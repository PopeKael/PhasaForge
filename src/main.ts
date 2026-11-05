import { getCurrentWindow, cursorPosition, availableMonitors } from "@tauri-apps/api/window";
import { PhysicalPosition } from "@tauri-apps/api/dpi";
import { distanceToWorkArea, placeNearAnchor } from "./placement.mjs";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { lessonViewState } from "./view-state.mjs";
import "./style.css";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const source = $<HTMLTextAreaElement>("source-text");
const speed = $<HTMLInputElement>("speed");
const selectedKey = "phasaforge.selected-text";
const settingsKey = "phasaforge.settings";
let sentences: string[] = [];
let sentenceIndex = 0;
let mediaRecorder: MediaRecorder | undefined;
let recordedChunks: Blob[] = [];
let stream: MediaStream | undefined;
let recordingUrl: string | undefined;
let activeTab = "characters";
let settingsOpen = false;
let nativeThaiVoices: { id: string; name: string; language: string }[] = [];
let ttsAudioUrl: string | undefined;
let speechPlaying = false;
const ttsAudio = document.createElement("audio");
ttsAudio.id = "native-speech-audio";
ttsAudio.hidden = true;
document.body.append(ttsAudio);
ttsAudio.addEventListener("ended", () => finishSpeech());
ttsAudio.addEventListener("error", () => {
  $("voice-note").textContent = "Windows returned Thai speech, but the WebView could not play the audio stream.";
  finishSpeech();
});

type Settings = { speed: number; voice: string; modelFolder: string; meaning: string; hotkeyModifier: string; hotkeyKey: string };
const defaults: Settings = { speed: 0.75, voice: "", modelFolder: "", meaning: "", hotkeyModifier: "right_ctrl", hotkeyKey: "up" };
const loadSettings = (): Settings => {
  try { return { ...defaults, ...JSON.parse(localStorage.getItem(settingsKey) ?? "{}") }; }
  catch { return defaults; }
};
let settings = loadSettings();

function splitSentences(text: string): string[] {
  // Keep punctuation with its sentence; this is a cautious clause-level fallback for Thai text.
  return text.replace(/\r/g, "").split(/(?<=[.!?。！？\n])\s*/u).map(x => x.trim()).filter(Boolean);
}

function renderPassage(): void {
  sentences = splitSentences(source.value);
  sentenceIndex = Math.min(sentenceIndex, Math.max(sentences.length - 1, 0));
  const current = sentences[sentenceIndex] ?? "";
  $("thai-focus").textContent = current || "Paste a Thai passage to begin.";
  $("sentence-position").textContent = `(Sentence ${sentences.length ? sentenceIndex + 1 : 0} of ${sentences.length})`;
  $("passage-count").textContent = `${sentences.length ? sentenceIndex + 1 : 0} of ${sentences.length}`;
  $("romanization").textContent = current ? "Romanisation is not provided. No unverified pronunciation guide is shown." : "Romanisation is not generated yet.";
  $("meaning-line").textContent = settings.meaning ? `Meaning: ${settings.meaning}` : "Meaning: no translation supplied.";
  renderCharacters(current);
  localStorage.setItem(selectedKey, source.value);
}

function renderShortcut(): void {
  const modifiers: Record<string, string> = { right_ctrl: "Right Ctrl", left_ctrl: "Left Ctrl", right_alt: "Right Alt", left_alt: "Left Alt" };
  const keys: Record<string, string> = { up: "↑", down: "↓", space: "Space" };
  $("shortcut-label").textContent = `${modifiers[settings.hotkeyModifier] ?? "Right Ctrl"} + ${keys[settings.hotkeyKey] ?? "↑"}`;
}

function describeCharacter(char: string): string {
  const cp = char.codePointAt(0) ?? 0;
  if (cp >= 0x0e01 && cp <= 0x0e2e) return "Thai consonant letter";
  if ((cp >= 0x0e30 && cp <= 0x0e3a) || (cp >= 0x0e40 && cp <= 0x0e4e)) {
    if (cp >= 0x0e48 && cp <= 0x0e4b) return "Thai tone mark (written diacritic; its effect depends on the syllable)";
    return "Thai vowel or combining mark (its role depends on the surrounding syllable)";
  }
  if (cp >= 0x0e50 && cp <= 0x0e59) return "Thai digit";
  return "Other written character";
}

function renderCharacters(text: string): void {
  const root = $("character-chips");
  root.replaceChildren();
  if (!text) { root.innerHTML = '<span class="muted">Thai characters will appear here.</span>'; return; }
  const segmenter = new Intl.Segmenter("th", { granularity: "grapheme" });
  for (const { segment } of segmenter.segment(text)) {
    if (/\s/u.test(segment)) continue;
    const button = document.createElement("button");
    button.className = "character-chip";
    button.lang = "th";
    button.textContent = segment;
    button.title = "Inspect this written component";
    button.addEventListener("click", () => {
      root.querySelectorAll(".character-chip").forEach(x => x.classList.remove("chosen"));
      button.classList.add("chosen");
      $("character-large").textContent = segment;
      const details = $("character-details");
      details.replaceChildren();
      const label = document.createElement("strong");
      label.textContent = describeCharacter(segment);
      const written = document.createElement("p");
      written.textContent = "Written unit: " + segment + " · Unicode " + [...segment].map(c => "U+" + (c.codePointAt(0) ?? 0).toString(16).toUpperCase().padStart(4, "0")).join(" ");
      const note = document.createElement("p");
      note.textContent = "This is a script-level label only. Thai sound and tone are determined by the complete syllable, not by reading each visible mark in isolation.";
      details.append(label, written, note);
    });
    root.append(button);
  }
}

function getThaiVoices(): SpeechSynthesisVoice[] {
  return window.speechSynthesis?.getVoices().filter(v => /^th(?:-|$)/i.test(v.lang)) ?? [];
}

function updateVoiceOptions(): void {
  const voices = getThaiVoices();
  const select = $<HTMLSelectElement>("voice-select");
  select.replaceChildren();
  for (const voice of nativeThaiVoices) select.add(new Option(voice.name + " (" + voice.language + " · Windows)", "winrt:" + voice.id));
  for (const voice of voices) select.add(new Option(voice.name + " (" + voice.lang + " · WebView)", "web:" + voice.name));
  const values = nativeThaiVoices.map(v => "winrt:" + v.id).concat(voices.map(v => "web:" + v.name));
  if (!values.length) {
    select.add(new Option("No Thai voice detected", ""));
    $("voice-note").textContent = "No installed Thai speech voice was found. Playback is unavailable until one is installed.";
    return;
  }
  if (!values.includes(settings.voice)) settings.voice = values[0];
  select.value = settings.voice;
  const activeNative = nativeThaiVoices.find(v => "winrt:" + v.id === settings.voice);
  $("voice-note").textContent = activeNative ? "Windows Thai voice ready: " + activeNative.name : "Thai WebView voice ready: " + settings.voice.slice(4);
}

function speak(text: string): void {
  if (!text.trim()) { $("voice-note").textContent = "Add Thai text before playing."; return; }
  if (mediaRecorder?.state === "recording") { $("voice-note").textContent = "Stop microphone recording before playing speech."; return; }
  if (settings.voice.startsWith("winrt:")) {
    speechPlaying = true;
    setRecordingControls(false, false);
    window.speechSynthesis?.cancel();
    ttsAudio.pause();
    if (ttsAudioUrl) URL.revokeObjectURL(ttsAudioUrl);
    $("voice-note").textContent = "Preparing Thai speech with the selected Windows voice…";
    void invoke<number[]>("synthesize_thai", { text, voiceId: settings.voice.slice(6), rate: Number(speed.value) }).then(bytes => {
      const blob = new Blob([new Uint8Array(bytes)], { type: "audio/wav" });
      ttsAudioUrl = URL.createObjectURL(blob);
      ttsAudio.src = ttsAudioUrl;
      return ttsAudio.play();
    }).then(() => {
      $("voice-note").textContent = "Playing Thai Windows speech.";
      $("stop-speech").removeAttribute("disabled");
    }).catch(error => {
      $("voice-note").textContent = "Windows Thai speech failed: " + String(error);
      finishSpeech();
    });
    return;
  }
  const voices = getThaiVoices();
  const voice = voices.find(v => "web:" + v.name === settings.voice) ?? voices[0];
  if (!voice) { $("voice-note").textContent = "No Thai voice is installed. English substitution is disabled."; return; }
  speechPlaying = true;
  setRecordingControls(false, false);
  window.speechSynthesis.cancel();
  $("stop-speech").removeAttribute("disabled");
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = voice.lang;
  utterance.voice = voice;
  utterance.rate = Number(speed.value);
  utterance.onend = () => { $("voice-note").textContent = "Thai voice: " + voice.name; finishSpeech(); };
  utterance.onerror = () => { $("voice-note").textContent = "Thai speech playback failed in the Windows WebView."; finishSpeech(); };
  window.speechSynthesis.speak(utterance);
}

function finishSpeech(): void {
  speechPlaying = false;
  $("stop-speech").setAttribute("disabled", "true");
  setRecordingControls(mediaRecorder?.state === "recording", !audio.paused);
  if (ttsAudioUrl) URL.revokeObjectURL(ttsAudioUrl);
  ttsAudioUrl = undefined;
}

function renderViews(): void {
  const visibility = lessonViewState(activeTab, settingsOpen);
  document.querySelectorAll<HTMLElement>(".tab-content").forEach(el => {
    if (el.id === "settings-view") el.hidden = !settingsOpen;
    else el.hidden = !visibility[el.id.replace("-view", "")];
  });
  $("tabs").hidden = settingsOpen;
  $("settings-toggle").setAttribute("aria-label", settingsOpen ? "Return to learning view" : "Settings");
  $("settings-toggle").title = settingsOpen ? "Return to learning view" : "Settings";
}

function showTab(tab: string): void {
  activeTab = tab;
  document.querySelectorAll<HTMLButtonElement>(".tab").forEach(el => {
    el.classList.toggle("active", el.dataset.tab === tab);
    el.setAttribute("aria-selected", String(el.dataset.tab === tab));
  });
  settingsOpen = false;
  renderViews();
}

source.value = localStorage.getItem(selectedKey) ?? "";
speed.value = String(settings.speed);
$<HTMLInputElement>("settings-speed").value = String(settings.speed);
$<HTMLOutputElement>("speed-output").value = `${Number(settings.speed).toFixed(2).replace(/0$/, "")}×`;
$<HTMLTextAreaElement>("meaning-note").value = settings.meaning;
$<HTMLInputElement>("model-folder").value = settings.modelFolder;
$<HTMLSelectElement>("hotkey-modifier").value = settings.hotkeyModifier;
$<HTMLSelectElement>("hotkey-key").value = settings.hotkeyKey;
renderShortcut();
renderPassage();
updateVoiceOptions();
window.speechSynthesis?.addEventListener("voiceschanged", updateVoiceOptions);

source.addEventListener("input", renderPassage);
speed.addEventListener("input", () => {
  $<HTMLOutputElement>("speed-output").value = `${Number(speed.value).toFixed(2).replace(/0$/, "")}×`;
  $<HTMLInputElement>("settings-speed").value = speed.value;
  settings.speed = Number(speed.value);
  localStorage.setItem(settingsKey, JSON.stringify(settings));
});
 $<HTMLInputElement>("settings-speed").addEventListener("input", () => { speed.value = $<HTMLInputElement>("settings-speed").value; speed.dispatchEvent(new Event("input")); });
$("play-selection").addEventListener("click", () => speak(source.value));
$("play-current").addEventListener("click", () => speak(sentences[sentenceIndex] ?? ""));
$("stop-speech").addEventListener("click", () => {
  window.speechSynthesis.cancel();
  $("stop-speech").setAttribute("disabled", "true");
  $("voice-note").textContent = "Speech stopped.";
});
$("previous").addEventListener("click", () => { sentenceIndex = Math.max(0, sentenceIndex - 1); renderPassage(); });
$("next").addEventListener("click", () => { sentenceIndex = Math.min(sentences.length - 1, sentenceIndex + 1); renderPassage(); });
document.querySelectorAll<HTMLButtonElement>(".tab").forEach(button => button.addEventListener("click", () => showTab(button.dataset.tab ?? "characters")));
$("settings-toggle").addEventListener("click", () => { settingsOpen = !settingsOpen; renderViews(); });
$("save-meaning").addEventListener("click", () => { settings.meaning = $<HTMLTextAreaElement>("meaning-note").value; localStorage.setItem(settingsKey, JSON.stringify(settings)); renderPassage(); });
$("save-settings").addEventListener("click", async () => {
  settings.voice = $<HTMLSelectElement>("voice-select").value;
  settings.modelFolder = $<HTMLInputElement>("model-folder").value.trim();
  settings.hotkeyModifier = $<HTMLSelectElement>("hotkey-modifier").value;
  settings.hotkeyKey = $<HTMLSelectElement>("hotkey-key").value;
  settings.speed = Number(speed.value);
  localStorage.setItem(settingsKey, JSON.stringify(settings));
  renderShortcut();
  try {
    await invoke("set_hotkey", { modifier: settings.hotkeyModifier, key: settings.hotkeyKey });
    $("hotkey-status").textContent = "Shortcut saved and active.";
  } catch (error) {
    $("hotkey-status").textContent = `Preference saved; shortcut listener is unavailable: ${String(error)}`;
  }
  $("settings-saved").textContent = "Saved on this device.";
  setTimeout(() => { $("settings-saved").textContent = ""; }, 2000);
});

const audio = $("recorded-audio") as HTMLAudioElement;
const setRecordingControls = (recording: boolean, playing: boolean): void => {
  $("record").toggleAttribute("disabled", recording || playing);
  $("stop-record").toggleAttribute("disabled", !recording);
  $("play-recording").toggleAttribute("disabled", recording || playing || speechPlaying || !recordingUrl);
  $("record-again").toggleAttribute("disabled", recording || playing || speechPlaying);
  $("play-selection").toggleAttribute("disabled", recording);
  $("play-current").toggleAttribute("disabled", recording);
};
audio.addEventListener("play", () => setRecordingControls(false, true));
audio.addEventListener("ended", () => {
  setRecordingControls(false, false);
  $("practice-status").textContent = "Recording playback finished. Audio remains available for replay in this session.";
});
audio.addEventListener("error", () => {
  setRecordingControls(false, false);
  $("practice-status").textContent = "The captured audio could not be played by this Windows installation.";
});

async function startRecording(): Promise<void> {
  if (mediaRecorder?.state === "recording" || !audio.paused) return;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    recordedChunks = [];
    if (recordingUrl) URL.revokeObjectURL(recordingUrl);
    recordingUrl = undefined;
    $("play-recording").setAttribute("disabled", "true");
    $("record-again").setAttribute("disabled", "true");
    mediaRecorder = new MediaRecorder(stream);
    mediaRecorder.ondataavailable = e => { if (e.data.size) recordedChunks.push(e.data); };
    mediaRecorder.onstop = () => {
      $("practice-status").textContent = "Audio captured locally for this session. No Thai recognition engine is configured; no transcript or pronunciation score was generated.";
      $("heard-text").textContent = "Recognition unavailable — configure a local speech model in a future build.";
      stream?.getTracks().forEach(t => t.stop());
      stream = undefined;
      const blob = new Blob(recordedChunks, { type: mediaRecorder?.mimeType || "audio/webm" });
      recordingUrl = blob.size ? URL.createObjectURL(blob) : undefined;
      if (recordingUrl) audio.src = recordingUrl;
      setRecordingControls(false, false);
    };
    mediaRecorder.start();
    $("practice-status").textContent = "Recording… Microphone is active. Press Stop when finished.";
    setRecordingControls(true, false);
  } catch {
    stream?.getTracks().forEach(t => t.stop());
    stream = undefined;
    setRecordingControls(false, false);
    $("practice-status").textContent = "Microphone access was not available. Check Windows microphone permissions.";
  }
}
$("record").addEventListener("click", () => { void startRecording(); });
$("record-again").addEventListener("click", () => { void startRecording(); });
$("stop-record").addEventListener("click", () => {
  if (mediaRecorder?.state === "recording") mediaRecorder.stop();
});
$("play-recording").addEventListener("click", () => {
  if (!recordingUrl || mediaRecorder?.state === "recording") return;
  audio.currentTime = 0;
  void audio.play().then(() => {
    $("practice-status").textContent = "Playing the locally captured recording.";
  }).catch(() => {
    $("practice-status").textContent = "The captured audio could not be played by this Windows installation.";
  });
});
setRecordingControls(false, false);
renderViews();

if ("__TAURI_INTERNALS__" in window) {
  const appWindow = getCurrentWindow();
  void invoke<typeof nativeThaiVoices>("list_thai_voices").then(voices => {
    nativeThaiVoices = voices;
    updateVoiceOptions();
  }).catch(error => {
    $("voice-setup-note").textContent = "Windows native Thai voice discovery failed: " + String(error) + ". Install a Thai text-to-speech voice in Windows Settings.";
  });
  void listen<{ text: string | null; rect: { x: number; y: number; width: number; height: number } | null; clipboard_restored: boolean | null }>("selection-captured", async event => {
    const capture = event.payload;
    if (capture.clipboard_restored === false) {
      $("capture-status").textContent = "The saved clipboard could not be fully restored. Please check it.";
    } else if (capture.clipboard_restored === true) {
      $("capture-status").textContent = "Text captured with a temporary copy; the original clipboard was restored.";
    } else if (capture.text) {
      $("capture-status").textContent = "Text captured through Windows UI Automation.";
    } else {
      $("capture-status").textContent = "No selection found. The popup opened near the cursor.";
    }
    if (capture.text) {
      source.value = capture.text;
      sentenceIndex = 0;
      renderPassage();
    }
    const cursor = await cursorPosition();
    const anchor = capture.rect ?? { x: cursor.x, y: cursor.y, width: 0, height: 0 };
    const monitors = await availableMonitors();
    const point = { x: anchor.x + (anchor.width ?? 0) / 2, y: anchor.y + (anchor.height ?? 0) / 2 };
    const monitor = monitors.reduce((best, candidate) => {
      const area = { x: candidate.workArea.position.x, y: candidate.workArea.position.y, width: candidate.workArea.size.width, height: candidate.workArea.size.height };
      return !best || distanceToWorkArea(point, area) < best.distance ? { area, distance: distanceToWorkArea(point, area) } : best;
    }, undefined as { area: { x: number; y: number; width: number; height: number }; distance: number } | undefined);
    if (monitor) {
      const size = await appWindow.outerSize();
      const position = placeNearAnchor(anchor, monitor.area, { width: size.width, height: size.height });
      await appWindow.setPosition(new PhysicalPosition(position.x, position.y));
    }
    await appWindow.show();
    await appWindow.setFocus();
  });
  document.querySelector(".titlebar")?.addEventListener("mousedown", event => {
    const mouse = event as MouseEvent;
    if (mouse.buttons !== 1 || (mouse.target as HTMLElement).closest("button, input, select, textarea")) return;
    void appWindow.startDragging();
  });
  invoke("set_hotkey", { modifier: settings.hotkeyModifier, key: settings.hotkeyKey }).then(() => {
    $("hotkey-status").textContent = "Shortcut is active. Only its trigger key is consumed; unrelated keys pass through. No other keyboard input is stored.";
  }).catch(error => {
    $("hotkey-status").textContent = `Shortcut unavailable; open Settings to retry. ${String(error)}`;
  });
  $("close").addEventListener("click", async () => { try { await invoke("hide_main_window"); } catch { await appWindow.hide(); } });
}
