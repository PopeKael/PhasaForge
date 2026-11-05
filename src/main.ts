import { getCurrentWindow } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";
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
      $("character-details").innerHTML = `<strong>${describeCharacter(segment)}</strong><p>Written unit: <code>${segment}</code> · Unicode ${[...segment].map(c => `U+${(c.codePointAt(0) ?? 0).toString(16).toUpperCase().padStart(4, "0")}`).join(" ")}</p><p>This is a script-level label only. Thai sound and tone are determined by the complete syllable, not by reading each visible mark in isolation.</p>`;
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
  if (!voices.length) {
    select.add(new Option("No Thai voice detected", ""));
    $("voice-note").textContent = "No installed Thai speech voice was found. Playback is unavailable until one is installed.";
    return;
  }
  for (const voice of voices) select.add(new Option(`${voice.name} (${voice.lang})`, voice.name));
  if (!settings.voice || !voices.some(v => v.name === settings.voice)) settings.voice = voices[0].name;
  select.value = settings.voice;
  $("voice-note").textContent = `Thai voice: ${settings.voice}`;
}

function speak(text: string): void {
  if (!text.trim()) { $("voice-note").textContent = "Add Thai text before playing."; return; }
  const voices = getThaiVoices();
  const voice = voices.find(v => v.name === settings.voice) ?? voices[0];
  if (!voice) { $("voice-note").textContent = "No Thai voice is installed. English substitution is disabled."; return; }
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = voice.lang;
  utterance.voice = voice;
  utterance.rate = Number(speed.value);
  utterance.onend = () => { $("voice-note").textContent = `Thai voice: ${voice.name}`; };
  utterance.onerror = () => { $("voice-note").textContent = "Thai speech playback failed in the Windows WebView."; };
  window.speechSynthesis.speak(utterance);
}

function showTab(tab: string): void {
  document.querySelectorAll<HTMLElement>(".tab-content").forEach(el => { if (!el.classList.contains("settings-view")) el.hidden = true; });
  document.querySelectorAll(".tab").forEach(el => el.classList.remove("active"));
  document.querySelector<HTMLElement>(`[data-tab="${tab}"]`)?.classList.add("active");
  $(`${tab}-view`).hidden = false;
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
$("previous").addEventListener("click", () => { sentenceIndex = Math.max(0, sentenceIndex - 1); renderPassage(); });
$("next").addEventListener("click", () => { sentenceIndex = Math.min(sentences.length - 1, sentenceIndex + 1); renderPassage(); });
document.querySelectorAll<HTMLButtonElement>(".tab").forEach(button => button.addEventListener("click", () => showTab(button.dataset.tab ?? "characters")));
$("settings-toggle").addEventListener("click", () => { $("settings-view").hidden = !$("settings-view").hidden; });
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
$("record").addEventListener("click", async () => {
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    recordedChunks = [];
    mediaRecorder = new MediaRecorder(stream);
    mediaRecorder.ondataavailable = e => { if (e.data.size) recordedChunks.push(e.data); };
    mediaRecorder.onstop = () => {
      $("practice-status").textContent = "Audio captured locally for this session. No Thai recognition engine is configured; no transcript or pronunciation score was generated.";
      $("heard-text").textContent = "Recognition unavailable — configure a local speech model in a future build.";
      stream?.getTracks().forEach(t => t.stop());
    };
    mediaRecorder.start();
    $("practice-status").textContent = "Recording… Microphone is active. Press Stop when finished.";
    $("record").setAttribute("disabled", "true");
    $("stop-record").removeAttribute("disabled");
  } catch {
    $("practice-status").textContent = "Microphone access was not available. Check Windows microphone permissions.";
  }
});
$("stop-record").addEventListener("click", () => { if (mediaRecorder?.state === "recording") mediaRecorder.stop(); $("record").removeAttribute("disabled"); $("stop-record").setAttribute("disabled", "true"); });

if ("__TAURI_INTERNALS__" in window) {
  const appWindow = getCurrentWindow();
  invoke("set_hotkey", { modifier: settings.hotkeyModifier, key: settings.hotkeyKey }).then(() => {
    $("hotkey-status").textContent = "Shortcut is active. It passes the keystrokes through and stores no other keyboard input.";
  }).catch(error => {
    $("hotkey-status").textContent = `Shortcut unavailable; open Settings to retry. ${String(error)}`;
  });
  $("minimize").addEventListener("click", () => appWindow.minimize());
  $("close").addEventListener("click", async () => { try { await invoke("hide_main_window"); } catch { await appWindow.hide(); } });
}
