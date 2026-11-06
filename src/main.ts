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
let activeTab = "words";
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

type Settings = { speed: number; voice: string; hotkeyModifier: string; hotkeyKey: string; translationProvider: string; translationModel: string };
type WordCard = { word: string; reading: string | null; syllables: { reading: string; tone: string }[]; meaning: string | null; note: string | null; source: string | null; confidence: string | null; example_thai: string | null; example_english: string | null };
type SentenceCard = { text: string; reading: string; meaning: string | null; meaning_source: string | null; words: WordCard[] };
const defaults: Settings = { speed: 0.75, voice: "", hotkeyModifier: "right_ctrl", hotkeyKey: "up", translationProvider: "offline", translationModel: "" };
const loadSettings = (): Settings => {
  try { return { ...defaults, ...JSON.parse(localStorage.getItem(settingsKey) ?? "{}") }; }
  catch { return defaults; }
};
let settings = loadSettings();
let analysis: SentenceCard[] = [];
let analysisRequest = 0;

function renderSentence(card: SentenceCard | undefined): void {
  const current = card?.text ?? "";
  $("thai-focus").textContent = current || "Paste a Thai passage to begin.";
  $("sentence-position").textContent = `(Sentence ${analysis.length ? sentenceIndex + 1 : 0} of ${analysis.length})`;
  $("passage-count").textContent = `${analysis.length ? sentenceIndex + 1 : 0} of ${analysis.length}`;
  $("romanization").textContent = current ? `Pronunciation: ${card?.reading || "Thai words not detected"}` : "Pronunciation appears with the word breakdown.";
  $("meaning-line").textContent = card?.meaning ? `Meaning: ${card.meaning}` : "Meaning: no sentence translation found in the offline examples.";
  $("translation-source").textContent = card?.meaning_source ? `Source: ${card.meaning_source}. Dictionary meanings are learner-drafted and may need checking.` : "No exact sentence example is stored offline. You can ask a downloaded local translation model in Meaning.";
  renderWords(card?.words ?? []);
  localStorage.setItem(selectedKey, source.value);
}

function renderPassage(): void {
  const request = ++analysisRequest;
  analysis = [];
  sentenceIndex = 0;
  renderSentence(undefined);
  const text = source.value.trim();
  if (!text) return;
  if (!("__TAURI_INTERNALS__" in window)) { $("capture-status").textContent = "Thai analysis runs in the PhasaForge desktop app."; return; }
  $("capture-status").textContent = "Segmenting Thai with the bundled offline language engine…";
  void invoke<SentenceCard[]>("analyze_text", { text }).then(cards => {
    if (request !== analysisRequest) return;
    analysis = cards;
    sentences = cards.map(card => card.text);
    sentenceIndex = 0;
    renderSentence(cards[0]);
    $("capture-status").textContent = cards.length ? `Offline analysis ready · ${cards.length} sentence${cards.length === 1 ? "" : "s"}` : "No sentence text was found.";
  }).catch(error => {
    if (request !== analysisRequest) return;
    $("capture-status").textContent = `Thai analysis failed: ${String(error)}`;
    $("meaning-line").textContent = "Meaning: local dictionary could not be opened.";
  });
}

function renderShortcut(): void {
  const modifiers: Record<string, string> = { right_ctrl: "Right Ctrl", left_ctrl: "Left Ctrl", right_alt: "Right Alt", left_alt: "Left Alt" };
  const keys: Record<string, string> = { up: "↑", down: "↓", space: "Space" };
  $("shortcut-label").textContent = `${modifiers[settings.hotkeyModifier] ?? "Right Ctrl"} + ${keys[settings.hotkeyKey] ?? "↑"}`;
}

function renderWords(words: WordCard[]): void {
  const root = $("word-chips");
  root.replaceChildren();
  if (!words.length) { root.textContent = "Thai word tiles appear when Thai text is available."; return; }
  for (const word of words) {
    const button = document.createElement("button");
    button.className = "word-chip";
    button.lang = "th";
    button.textContent = word.word;
    button.title = word.meaning ?? "No dictionary meaning is available for this word";
    button.addEventListener("click", () => {
      root.querySelectorAll(".word-chip").forEach(x => x.classList.remove("chosen"));
      button.classList.add("chosen");
      $("word-large").textContent = word.word;
      const details = $("word-details");
      details.replaceChildren();
      const meaning = document.createElement("strong"); meaning.textContent = word.meaning ?? "Meaning not found in the local dictionary";
      const reading = document.createElement("p"); reading.textContent = `Paiboon+ reading: ${word.reading ?? "unavailable"}`;
      const syllables = document.createElement("div"); syllables.className = "word-syllables";
      if (word.syllables.length) for (const item of word.syllables) { const tag = document.createElement("span"); tag.className = "word-syllable"; tag.textContent = `${item.reading} · ${item.tone} tone`; syllables.append(tag); }
      const attribution = document.createElement("p"); attribution.textContent = `Source: ${word.source ?? "not found"}${word.confidence === null ? "" : ` · evidence status: ${word.confidence}`}`;
      details.append(meaning, reading, syllables, attribution);
      if (word.note) { const note = document.createElement("p"); note.textContent = word.note; details.append(note); }
      if (word.example_thai && word.example_english) { const example = document.createElement("p"); example.lang = "th"; example.textContent = `Example: ${word.example_thai} · ${word.example_english}`; details.append(example); }
    });
    root.append(button);
  }
  root.querySelector<HTMLButtonElement>(".word-chip")?.click();
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
$<HTMLSelectElement>("translation-provider").value = settings.translationProvider;
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
$("previous").addEventListener("click", () => { sentenceIndex = Math.max(0, sentenceIndex - 1); renderSentence(analysis[sentenceIndex]); });
$("next").addEventListener("click", () => { sentenceIndex = Math.min(analysis.length - 1, sentenceIndex + 1); renderSentence(analysis[sentenceIndex]); });
document.querySelectorAll<HTMLButtonElement>(".tab").forEach(button => button.addEventListener("click", () => showTab(button.dataset.tab ?? "words")));
$("settings-toggle").addEventListener("click", () => { settingsOpen = !settingsOpen; renderViews(); });
$("translation-provider").addEventListener("change", () => {
  settings.translationProvider = $<HTMLSelectElement>("translation-provider").value;
  localStorage.setItem(settingsKey, JSON.stringify(settings));
  $("provider-status").textContent = settings.translationProvider === "offline" ? "Offline examples and word lookup are local; no network is used." : "Translation is sent only to Ollama at 127.0.0.1 on this PC.";
});
$("refresh-models").addEventListener("click", () => { void refreshOllamaModels(); });
$("test-offline").addEventListener("click", async () => {
  $("engine-test-status").textContent = "Running segmentation and SQLite lookup…";
  try {
    const result = await invoke<SentenceCard[]>("analyze_text", { text: "เราเดินดูของหลายอย่าง ทั้งผัก ผลไม้ และอาหารพื้นบ้าน" });
    const learned = result[0]?.words.filter(word => word.meaning && word.reading).length ?? 0;
    if (result.length !== 1 || learned < 8 || !result[0]?.meaning) throw new Error("The expected Thai sample did not return sentence meaning plus at least eight dictionary word cards.");
    $("engine-test-status").textContent = `Passed · ${result[0].words.length} words · ${learned} with meaning and reading · sentence meaning found.`;
  } catch (error) { $("engine-test-status").textContent = `Failed: ${String(error)}`; }
});
$("test-voice").addEventListener("click", () => speak("สวัสดีครับ วันนี้อากาศดี"));
$("open-mic-test").addEventListener("click", () => showTab("practice"));
$("pull-model").addEventListener("click", async () => {
  const button = $<HTMLButtonElement>("pull-model"); button.disabled = true;
  $("provider-status").textContent = "Requesting the optional qwen3:1.7b model from local Ollama… This downloads a large model and may take time.";
  try {
    await invoke("pull_ollama_model", { model: "qwen3:1.7b" });
    settings.translationModel = "qwen3:1.7b";
    localStorage.setItem(settingsKey, JSON.stringify(settings));
    await refreshOllamaModels();
    $("provider-status").textContent = "qwen3:1.7b was downloaded by local Ollama. Select it and save settings to use it.";
  } catch (error) { $("provider-status").textContent = String(error); }
  finally { button.disabled = false; }
});
async function refreshOllamaModels(): Promise<void> {
  const select = $<HTMLSelectElement>("translation-model");
  select.replaceChildren();
  try {
    const models = await invoke<string[]>("ollama_models");
    for (const model of models) select.add(new Option(model, model));
    if (!models.length) select.add(new Option("No local models found", ""));
    if (models.includes(settings.translationModel)) select.value = settings.translationModel;
    $("provider-status").textContent = models.length ? `Local Ollama ready · ${models.length} model${models.length === 1 ? "" : "s"} found.` : "Ollama is running, but no local models are installed.";
  } catch (error) { select.add(new Option("Ollama unavailable", "")); $("provider-status").textContent = String(error); }
}
$("translate-current").addEventListener("click", async () => {
  const sentence = analysis[sentenceIndex];
  if (!sentence) { $("translation-status").textContent = "Add Thai text first."; return; }
  if (sentence.meaning && sentence.meaning_source?.startsWith("ThaiReader")) { $("translation-status").textContent = "An attributed offline sentence example is already shown."; return; }
  if (settings.translationProvider !== "ollama" || !settings.translationModel) { $("translation-status").textContent = "Select Local Ollama and a model in Settings first."; return; }
  const button = $<HTMLButtonElement>("translate-current"); button.disabled = true;
  $("translation-status").textContent = "Translating on the local Ollama service…";
  try {
    sentence.meaning = await invoke<string>("translate_local", { text: sentence.text, model: settings.translationModel });
    sentence.meaning_source = `Local Ollama (${settings.translationModel}) · machine translation`;
    renderSentence(sentence);
    $("translation-status").textContent = "Local model output shown. Check nuance before relying on it.";
  } catch (error) { $("translation-status").textContent = `Local translation failed: ${String(error)}`; }
  finally { button.disabled = false; }
});
$("save-correction").addEventListener("click", async () => {
  try {
    await invoke("save_correction", { word: $<HTMLInputElement>("correction-word").value, meaning: $<HTMLInputElement>("correction-meaning").value, reading: $<HTMLInputElement>("correction-reading").value || null, note: "Saved from PhasaForge Settings" });
    $("correction-status").textContent = "Saved to the local SQLite knowledge base.";
    renderPassage();
  } catch (error) { $("correction-status").textContent = `Could not save: ${String(error)}`; }
});
$("refresh-dictionary").addEventListener("click", async () => {
  try { $("dictionary-update-status").textContent = await invoke<string>("refresh_dictionary"); }
  catch (error) { $("dictionary-update-status").textContent = `Dictionary update failed: ${String(error)}`; }
});
$("save-settings").addEventListener("click", async () => {
  settings.voice = $<HTMLSelectElement>("voice-select").value;
  settings.translationProvider = $<HTMLSelectElement>("translation-provider").value;
  settings.translationModel = $<HTMLSelectElement>("translation-model").value;
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
      $("heard-text").textContent = "Recognition unavailable — no Thai ASR backend is installed/configured.";
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
  void invoke<string>("database_location").then(path => { $<HTMLInputElement>("database-path").value = path; }).catch(error => { $<HTMLInputElement>("database-path").value = String(error); });
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
