import { getCurrentWindow, cursorPosition, availableMonitors } from "@tauri-apps/api/window";
import { PhysicalPosition } from "@tauri-apps/api/dpi";
import { distanceToWorkArea, placeNearAnchor } from "./placement.mjs";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { lessonViewState } from "./view-state.mjs";
import { captureNotice, capturedSourceText } from "./capture-state.mjs";
import "./style.css";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const source = $<HTMLTextAreaElement>("source-text");
const speed = $<HTMLInputElement>("speed");
const selectedKey = "phasaforge.selected-text";
const settingsKey = "phasaforge.settings";
const setupSeenKey = "phasaforge.setup-seen.0.4.1";
const translationDefaultKey = "phasaforge.translation-default.0.3.5";
const MMS_VOICE = "mms:facebook/mms-tts-tha";
let sentences: string[] = [];
let sentenceIndex = 0;
let mediaRecorder: MediaRecorder | undefined;
let recordedChunks: Blob[] = [];
let stream: MediaStream | undefined;
let recordingUrl: string | undefined;
let activeTab = "words";
let settingsOpen = !localStorage.getItem(setupSeenKey);
let nativeThaiVoices: { id: string; name: string; language: string }[] = [];
let nativeVoiceDiscoveryComplete = false;
let ttsAudioUrl: string | undefined;
let speechPlaying = false;
let thaiAsrReady = false;
let lastRecordingBlob: Blob | undefined;
let transcriptionInProgress = false;
let thaiAsrPreparation: Promise<void> | undefined;
let ollamaDiscovery: OllamaDiscovery | undefined;
const ttsAudio = document.createElement("audio");
ttsAudio.id = "native-speech-audio";
ttsAudio.hidden = true;
document.body.append(ttsAudio);
ttsAudio.addEventListener("ended", () => finishSpeech());
ttsAudio.addEventListener("error", () => {
  $("voice-note").textContent = "Windows returned Thai speech, but the WebView could not play the audio stream.";
  finishSpeech();
});

type Settings = { speed: number; voice: string; hotkeyModifier: string; hotkeyKey: string; translationProvider: string; translationModel: string; translationProviderConfigured: boolean };
type OllamaRunningModel = { name: string; size: number; size_vram: number };
type OllamaDiscovery = { installed: boolean; executable: string | null; service_available: boolean; model_store_found: boolean; model_directory: string; endpoint: string; models: string[]; api_models: string[]; manifest_models: string[]; running_models: OllamaRunningModel[] };
type WordCard = { word: string; reading: string | null; syllables: { reading: string; tone: string }[]; meaning: string | null; note: string | null; source: string | null; confidence: string | null; example_thai: string | null; example_english: string | null };
type SentenceCard = { text: string; reading: string; meaning: string | null; meaning_source: string | null; words: WordCard[] };

function renderSentencePronunciation(card: SentenceCard | undefined): void {
  const thai = $("thai-focus");
  const pronunciation = $("romanization");
  thai.replaceChildren();
  pronunciation.replaceChildren();
  const sentence = card?.text;
  if (!card || !sentence) {
    thai.textContent = "Paste a Thai passage to begin.";
    pronunciation.textContent = "Pronunciation appears with the word breakdown.";
    return;
  }

  const linkedGroups = new Set<number>();
  let cursor = 0;
  let alignmentIntact = true;
  for (let index = 0; index < card.words.length; index++) {
    const word = card.words[index];
    const position = alignmentIntact ? sentence.indexOf(word.word, cursor) : -1;
    if (!word.word || position < 0) {
      alignmentIntact = false;
      continue;
    }
    thai.append(document.createTextNode(sentence.slice(cursor, position)));
    if (word.reading) {
      const chunk = document.createElement("span");
      chunk.className = "linked-syllable-chunk";
      chunk.dataset.syllableGroup = String(index);
      chunk.dataset.syllableCount = String(Math.max(1, word.syllables.length));
      chunk.lang = "th";
      chunk.tabIndex = 0;
      chunk.textContent = word.word;
      chunk.setAttribute("aria-label", `${word.word}, ${word.reading}`);
      thai.append(chunk);
      linkedGroups.add(index);
    } else {
      thai.append(document.createTextNode(word.word));
    }
    cursor = position + word.word.length;
  }
  thai.append(document.createTextNode(sentence.slice(cursor)));

  pronunciation.append(document.createTextNode("Pronunciation: "));
  if (!card.words.length) {
    pronunciation.append(document.createTextNode("Thai words not detected"));
    return;
  }
  const pairs = new Map<number, HTMLSpanElement[]>();
  for (let index = 0; index < card.words.length; index++) {
    if (index > 0) pronunciation.append(document.createTextNode(" · "));
    const word = card.words[index];
    if (!word.reading) {
      pronunciation.append(document.createTextNode("[reading unavailable]"));
      continue;
    }
    if (!linkedGroups.has(index)) {
      pronunciation.append(document.createTextNode(word.reading));
      continue;
    }
    const chunk = document.createElement("span");
    chunk.className = "linked-syllable-chunk";
    chunk.dataset.syllableGroup = String(index);
    chunk.dataset.syllableCount = String(Math.max(1, word.syllables.length));
    chunk.lang = "und-Latn";
    chunk.tabIndex = 0;
    chunk.textContent = word.reading;
    chunk.setAttribute("aria-label", `${word.word}, ${word.reading}`);
    pronunciation.append(chunk);
    const pair = pairs.get(index) ?? [];
    pair.push(chunk);
    pairs.set(index, pair);
  }

  for (const [index, chunks] of pairs) {
    const thaiChunk = thai.querySelector<HTMLSpanElement>(`[data-syllable-group="${index}"]`);
    if (!thaiChunk) continue;
    chunks.push(thaiChunk);
    const highlight = () => chunks.forEach(chunk => chunk.classList.add("syllable-highlight"));
    const clear = () => chunks.forEach(chunk => chunk.classList.remove("syllable-highlight"));
    chunks.forEach(chunk => {
      chunk.addEventListener("mouseenter", highlight);
      chunk.addEventListener("mouseleave", clear);
      chunk.addEventListener("focus", highlight);
      chunk.addEventListener("blur", clear);
    });
  }
}

const defaults: Settings = { speed: 0.75, voice: "", hotkeyModifier: "right_ctrl", hotkeyKey: "up", translationProvider: "azure", translationModel: "", translationProviderConfigured: true };
const loadSettings = (): Settings => {
  try { const saved = JSON.parse(localStorage.getItem(settingsKey) ?? "{}"); const value = { ...defaults, ...saved }; if (saved.translationProviderConfigured !== true) { value.translationProvider = "azure"; value.translationProviderConfigured = true; } return value; }
  catch { return defaults; }
};
let settings = loadSettings();
if (!localStorage.getItem(translationDefaultKey)) {
  settings.translationProvider = "azure";
  settings.translationModel = "";
  settings.translationProviderConfigured = true;
  localStorage.setItem(settingsKey, JSON.stringify(settings));
  localStorage.setItem(translationDefaultKey, "set");
}
let analysis: SentenceCard[] = [];
let analysisRequest = 0;
let azureKeyConfigured = false;

function updateAzureSetupStatus(configured: boolean): void {
  azureKeyConfigured = configured;
  $("azure-key-editor").hidden = configured;
  $("replace-azure-key").hidden = !configured;
  const provider = settings.translationProvider;
  const providerName = provider === "ollama" ? "Local Ollama" : provider === "offline" ? "Offline examples" : "Azure Translator F0";
  $("translation-setup-status").textContent = configured
    ? `Azure F0 is already configured and its key is saved securely. ${provider === "azure" ? "Azure is selected; there is nothing to set up here." : `${providerName} is currently selected; choose Azure only if you want to switch back.`}`
    : `No saved Azure key was found. Azure is the default hosted translator; enter a key only if you want to use it. ${provider === "azure" ? "Until then, new sentence translations will not be available." : `${providerName} is currently selected.`}`;
}

function updateProviderControls(): void {
  const provider = $<HTMLSelectElement>("translation-provider").value;
  $("azure-provider-controls").hidden = provider !== "azure";
  $("ollama-model-controls").hidden = provider !== "ollama";
}

function renderSentence(card: SentenceCard | undefined): void {
  const current = card?.text ?? "";
  renderSentencePronunciation(card);
  $("sentence-position").textContent = `(Sentence ${analysis.length ? sentenceIndex + 1 : 0} of ${analysis.length})`;
  $("passage-count").textContent = `${analysis.length ? sentenceIndex + 1 : 0} of ${analysis.length}`;
  $("meaning-line").textContent = card?.meaning ? `Meaning: ${card.meaning}` : "Meaning: translation pending…";
  $("translation-english").textContent = card?.meaning ?? (current ? "Translation pending…" : "The sentence meaning will appear here.");
  $("translation-source").textContent = card?.meaning_source ? `Source: ${card.meaning_source}. Dictionary meanings are learner-drafted and may need checking.` : "Translation is automatic. Exact offline examples appear instantly; new text uses the selected provider.";
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
    if (settings.translationProvider !== "offline") {
      for (let i = 0; i < cards.length; i++) {
        const card = cards[i];
        if (card.meaning) continue;
        void translateCard(card, request, i);
      }
    }
  }).catch(error => {
    if (request !== analysisRequest) return;
    $("capture-status").textContent = `Thai analysis failed: ${String(error)}`;
    $("meaning-line").textContent = "Meaning: local dictionary could not be opened.";
  });
}

async function translateCard(card: SentenceCard, request: number, index: number): Promise<void> {
  try {
    let result: { english: string; provider: string; latency_ms: number; cached: boolean };
    if (settings.translationProvider === "ollama") {
      result = await invoke("translate_ollama_auto", { text: card.text, model: settings.translationModel });
    } else {
      result = await invoke("translate_auto", { text: card.text, model: settings.translationModel });
    }
    if (request !== analysisRequest || !analysis[index] || analysis[index].text !== card.text) return;
    card.meaning = result.english;
    card.meaning_source = `${result.provider} · machine translation${result.cached ? " · cached" : ""}`;
    if (index === sentenceIndex) renderSentence(card);
    $("translation-status").textContent = `${result.cached ? "Cached" : "Translated"} in ${result.latency_ms} ms via ${result.provider}.`;
  } catch (error) {
    if (request !== analysisRequest) return;
    if (index === sentenceIndex && !card.meaning) $("meaning-line").textContent = "Meaning: translation unavailable; see Settings for provider status.";
    $("translation-status").textContent = `Translation failed: ${String(error)}`;
  }
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
      const largeWord = $("word-large");
      largeWord.replaceChildren();
      const label = document.createElement("span"); label.className = "word-label"; label.textContent = word.word;
      const playWord = document.createElement("button"); playWord.className = "secondary-button small word-play-button"; playWord.type = "button"; playWord.textContent = "▶ Play Thai word";
      playWord.addEventListener("click", () => speak(word.word, true));
      largeWord.append(label, playWord);
      const details = $("word-details");
      details.replaceChildren();
      const meaning = document.createElement("strong"); meaning.textContent = word.meaning ?? "Meaning not found in the local dictionary";
      const pronunciation = document.createElement("div"); pronunciation.className = "word-pronunciation";
      const reading = document.createElement("span"); reading.className = "word-reading"; reading.textContent = `Paiboon+ reading: ${word.reading ?? "unavailable"}`;
      const syllables = document.createElement("div"); syllables.className = "word-syllables";
      if (word.syllables.length) for (const item of word.syllables) { const tag = document.createElement("span"); tag.className = "word-syllable"; tag.textContent = `${item.reading} · ${item.tone} tone`; syllables.append(tag); }
      pronunciation.append(reading, syllables);
      const attribution = document.createElement("p"); attribution.textContent = `Source: ${word.source ?? "not found"}${word.confidence === null ? "" : ` · evidence status: ${word.confidence}`}`;
      details.append(meaning, pronunciation, attribution);
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
  select.add(new Option("MMS Thai · local CPU · CC BY-NC 4.0", MMS_VOICE));
  const values = nativeThaiVoices.map(v => "winrt:" + v.id).concat(voices.map(v => "web:" + v.name), [MMS_VOICE]);
  if (!values.includes(settings.voice)) settings.voice = nativeThaiVoices[0] ? "winrt:" + nativeThaiVoices[0].id : voices[0] ? "web:" + voices[0].name : MMS_VOICE;
  select.value = settings.voice;
  localStorage.setItem(settingsKey, JSON.stringify(settings));
  const activeNative = nativeThaiVoices.find(v => "winrt:" + v.id === settings.voice);
  $("voice-note").textContent = activeNative ? "Windows Thai voice ready: " + activeNative.name : settings.voice === MMS_VOICE ? "Local MMS Thai voice is available; choose Download + test to prepare its model." : "Thai WebView voice ready: " + settings.voice.slice(4);
  if (settings.voice === MMS_VOICE && nativeVoiceDiscoveryComplete && "__TAURI_INTERNALS__" in window) {
    $("voice-note").textContent = "Warming the local Thai voice in the background…";
    void invoke("prepare_mms_thai").then(() => {
      if (!speechPlaying && settings.voice === MMS_VOICE) $("voice-note").textContent = "Local MMS Thai voice is ready on this PC.";
    }).catch(error => {
      if (!speechPlaying && settings.voice === MMS_VOICE) $("voice-note").textContent = "Local Thai voice setup failed: " + String(error);
    });
  }
}

function playSynthesized(bytes: number[], description: string): void {
  const blob = new Blob([new Uint8Array(bytes)], { type: "audio/wav" });
  if (ttsAudioUrl) URL.revokeObjectURL(ttsAudioUrl);
  ttsAudioUrl = URL.createObjectURL(blob);
  ttsAudio.src = ttsAudioUrl;
  ttsAudio.playbackRate = Number(speed.value);
  void ttsAudio.play().then(() => {
    $("voice-note").textContent = description;
    $("stop-speech").removeAttribute("disabled");
  }).catch(error => {
    $("voice-note").textContent = "Generated Thai audio could not be played by this Windows WebView: " + String(error);
    finishSpeech();
  });
}

function speak(text: string, steady = false): void {
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
      playSynthesized(bytes, "Playing Thai Windows speech.");
    }).catch(error => {
      $("voice-note").textContent = "Windows Thai speech failed: " + String(error);
      finishSpeech();
    });
    return;
  }
  if (settings.voice === MMS_VOICE) {
    speechPlaying = true;
    setRecordingControls(false, false);
    window.speechSynthesis?.cancel();
    ttsAudio.pause();
    $("voice-note").textContent = "Generating local Thai speech with MMS on CPU. First use downloads the optional model.";
    void invoke<number[]>("synthesize_mms_thai", { text, steady }).then(bytes => {
      playSynthesized(bytes, "Playing generated local MMS Thai speech (CPU). The text stayed on this PC.");
    }).catch(error => {
      $("voice-note").textContent = "Local Thai speech failed: " + String(error);
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
  $("app").classList.toggle("setup-mode", settingsOpen);
  $("settings-toggle").setAttribute("aria-label", settingsOpen ? "Return to PhasaForge" : "Setup and settings");
  $("settings-toggle").title = settingsOpen ? "Return to PhasaForge" : "Setup and settings";
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
$<HTMLButtonElement>("save-settings").textContent = settings.translationProvider === "ollama" ? "Save and Load Model" : "Save Settings";
$<HTMLInputElement>("model-download-name").value = "";
$<HTMLSelectElement>("hotkey-modifier").value = settings.hotkeyModifier;
$<HTMLSelectElement>("hotkey-key").value = settings.hotkeyKey;
renderShortcut();
renderPassage();
updateVoiceOptions();
updateProviderControls();
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
  ttsAudio.pause();
  $("stop-speech").setAttribute("disabled", "true");
  $("voice-note").textContent = "Speech stopped.";
});
$("previous").addEventListener("click", () => { sentenceIndex = Math.max(0, sentenceIndex - 1); renderSentence(analysis[sentenceIndex]); });
$("next").addEventListener("click", () => { sentenceIndex = Math.min(analysis.length - 1, sentenceIndex + 1); renderSentence(analysis[sentenceIndex]); });
document.querySelectorAll<HTMLButtonElement>(".tab").forEach(button => button.addEventListener("click", () => showTab(button.dataset.tab ?? "words")));
$("settings-toggle").addEventListener("click", () => {
  settingsOpen = !settingsOpen; renderViews();
  if (settingsOpen) { void refreshOllamaModels(); void refreshThaiAsrStatus(); $("settings-view").scrollTop = 0; }
});
$("finish-setup").addEventListener("click", () => {
  localStorage.setItem(setupSeenKey, "complete");
  settingsOpen = false;
  renderViews();
});
$("translation-provider").addEventListener("change", () => {
  settings.translationProvider = $<HTMLSelectElement>("translation-provider").value;
  settings.translationProviderConfigured = true;
  localStorage.setItem(settingsKey, JSON.stringify(settings));
  $<HTMLButtonElement>("save-settings").textContent = settings.translationProvider === "ollama" ? "Save and Load Model" : "Save Settings";
  updateProviderControls();
  $("provider-status").textContent = settings.translationProvider === "offline" ? "Offline examples and word lookup are local; no network is used." : settings.translationProvider === "ollama" ? "Translation is sent only to Ollama at 127.0.0.1 on this PC." : "Azure Translator F0 is the automatic provider. The app stops hosted requests at 1.9M characters per month; Ollama can serve as fallback.";
  if (azureKeyConfigured) updateAzureSetupStatus(true);
  if (settings.translationProvider === "ollama") void refreshOllamaModels();
  if (source.value.trim()) renderPassage();
});
$<HTMLSelectElement>("translation-model").addEventListener("change", event => {
  const model = (event.currentTarget as HTMLSelectElement).value;
  $<HTMLButtonElement>("save-settings").textContent = settings.translationProvider === "ollama" ? "Save and Load Model" : "Save Settings";
  if (!model) {
    $("provider-status").textContent = "Choose a detected local Ollama model, then save to load it.";
  } else if (ollamaDiscovery?.api_models.includes(model)) {
    $("provider-status").textContent = `${model} selected. Click Save Settings to start it and keep it loaded in Ollama.`;
  } else {
    $("provider-status").textContent = "That model was not found in the configured Ollama model store.";
  }
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
$("install-mms-voice").addEventListener("click", () => {
  settings.voice = MMS_VOICE;
  $<HTMLSelectElement>("voice-select").value = MMS_VOICE;
  localStorage.setItem(settingsKey, JSON.stringify(settings));
  speak("สวัสดีครับ วันนี้อากาศดี");
});
$("open-mic-test").addEventListener("click", () => showTab("practice"));
$("pull-model").addEventListener("click", async () => {
  const button = $<HTMLButtonElement>("pull-model"); button.disabled = true;
  const model = $<HTMLInputElement>("model-download-name").value.trim();
  if (!model) { $("provider-status").textContent = "Enter an Ollama model name first."; button.disabled = false; return; }
  $("provider-status").textContent = `Requesting ${model} from local Ollama… Model downloads can be several gigabytes.`;
  try {
    await invoke("pull_ollama_model", { model });
    settings.translationModel = model;
    localStorage.setItem(settingsKey, JSON.stringify(settings));
    await refreshOllamaModels();
    $("provider-status").textContent = `Ollama finished the ${model} pull; it is available (downloaded or already present) and selected. Run the five reference translations to compare it.`;
  } catch (error) { $("provider-status").textContent = String(error); }
  finally { button.disabled = false; }
});
async function refreshOllamaModels(): Promise<void> {
  const select = $<HTMLSelectElement>("translation-model");
  select.replaceChildren();
  try {
    const discovery = await invoke<OllamaDiscovery>("discover_ollama");
    ollamaDiscovery = discovery;
    // Only offer models the running Ollama API confirms it can load. Disk
    // manifests alone can belong to a store the current server has not opened.
    const models = discovery.api_models;
    select.add(new Option(models.length ? "Choose an installed model…" : "No installed models found", ""));
    for (const model of models) select.add(new Option(model, model));
    if (models.includes(settings.translationModel)) select.value = settings.translationModel;
    const activeModel = discovery.running_models.find(model => model.name.toLowerCase() === settings.translationModel.toLowerCase());
    const memoryText = (bytes: number): string => `${(bytes / (1024 ** 3)).toFixed(1)} GiB`;
    $("ollama-residency-status").textContent = activeModel
      ? `Loaded in Ollama: ${activeModel.name} · ${activeModel.size ? memoryText(activeModel.size) + " resident" : "resident"}${activeModel.size_vram ? ` · ${memoryText(activeModel.size_vram)} VRAM` : ""}.`
      : discovery.running_models.length
        ? `Ollama currently has ${discovery.running_models.map(model => model.name).join(", ")} loaded. The selected model is not resident.`
        : discovery.service_available ? "No model is currently loaded in Ollama memory." : "Ollama is not responding, so loaded model status is unavailable.";
    if (discovery.service_available) {
      $("ollama-discovery-status").textContent = discovery.api_models.length
        ? `Connected to Ollama at ${discovery.endpoint}. It reports ${discovery.api_models.length} installed model${discovery.api_models.length === 1 ? "" : "s"}${discovery.manifest_models.length > discovery.api_models.length ? `; ${discovery.manifest_models.length} model files are also detected locally` : ""}. Select a model and save to load it.`
        : discovery.manifest_models.length
          ? `Found ${discovery.manifest_models.length} local model entries in ${discovery.model_directory}, but Ollama's API does not report them. Discovery is read-only; PhasaForge leaves the shared Ollama service unchanged.`
          : `Connected to Ollama at ${discovery.endpoint}, but no installed models or local model entries were found.`;
    } else if (discovery.installed && discovery.manifest_models.length) {
      $("ollama-discovery-status").textContent = `Ollama is installed${discovery.executable ? ` at ${discovery.executable}` : ""}, but its service is not responding. Model files are present in ${discovery.model_directory}; start Ollama, then check again here.`;
    } else if (discovery.installed) {
      $("ollama-discovery-status").textContent = `Ollama is installed${discovery.executable ? ` at ${discovery.executable}` : ""}, but the configured service at ${discovery.endpoint} is not responding${discovery.manifest_models.length ? `; ${discovery.manifest_models.length} local model entries are detected` : ""}.`;
    } else if (discovery.manifest_models.length) {
      $("ollama-discovery-status").textContent = `Found model files in ${discovery.model_directory}, but the Ollama runtime was not located. Install Ollama for Windows from ollama.com/download/windows; keep its default application location, then reopen PhasaForge.`;
    } else if (discovery.model_store_found) {
      $("ollama-discovery-status").textContent = `A possible Ollama model folder exists at ${discovery.model_directory}, but the Ollama runtime or model manifests were not found. Azure is ready. To add local translation:\n1. Download and run Ollama for Windows: https://ollama.com/download/windows\n2. Keep the default application location: %LOCALAPPDATA%\\Programs\\Ollama.\n3. Start Ollama and reopen PhasaForge. Model files normally live in %USERPROFILE%\\.ollama\\models.`;
    } else {
      $("ollama-discovery-status").textContent = "Ollama was not found. Azure is ready and does not need a local model. To add local translation:\n1. Download and run Ollama for Windows: https://ollama.com/download/windows\n2. Keep the default application location: %LOCALAPPDATA%\\Programs\\Ollama. Models use %USERPROFILE%\\.ollama\\models by default.\n3. Start Ollama and reopen PhasaForge; startup discovery will list its installed models.";
    }
    if (settings.translationProvider === "ollama") {
      $("provider-status").textContent = discovery.service_available
          ? models.length ? `Choose a model above; Save Settings asks the running Ollama service to start it and keeps it loaded.` : "No installed Ollama models. Type a model name and click Download model."
        : discovery.installed ? "Ollama is installed but not running. Open Ollama, then choose Check local Ollama." : "Ollama is not installed. Follow the install location shown above, then reopen Setup.";
    }
  } catch (error) {
    select.add(new Option("Ollama unavailable", ""));
    $("ollama-discovery-status").textContent = `Could not complete the local model check: ${String(error)}`;
    if (settings.translationProvider === "ollama") $("provider-status").textContent = "Local Ollama discovery failed. Azure remains available if selected.";
  }
}
$("test-local-translation").addEventListener("click", async () => {
  const model = $<HTMLSelectElement>("translation-model").value;
  const button = $<HTMLButtonElement>("test-local-translation");
  if (!model) { $("provider-status").textContent = "Check Ollama and select an installed model first."; return; }
  button.disabled = true;
  const results = $("translation-test-results");
  results.replaceChildren();
  $("provider-status").textContent = `Testing ${model} against five attributed ThaiReader v42 examples on local Ollama…`;
  try {
    const cases = await invoke<{ thai: string; reference: string; model_output: string }[]>("test_local_translation", { model });
    for (const item of cases) {
      const row = document.createElement("div"); row.className = "translation-test-row";
      const thai = document.createElement("strong"); thai.lang = "th"; thai.textContent = item.thai;
      const reference = document.createElement("span"); reference.textContent = `Reference: ${item.reference}`;
      const output = document.createElement("span"); output.textContent = `Model: ${item.model_output}`;
      row.append(thai, reference, output); results.append(row);
    }
    $("provider-status").textContent = `Ran ${cases.length} local translations. Compare each model result with its ThaiReader reference; no automatic accuracy score is claimed.`;
  } catch (error) { $("provider-status").textContent = `Local translation test failed: ${String(error)}`; }
  finally { button.disabled = false; }
});
$("translate-current").addEventListener("click", async () => {
  const sentence = analysis[sentenceIndex];
  if (!sentence) { $("translation-status").textContent = "Add Thai text first."; return; }
  if (sentence.meaning && sentence.meaning_source?.startsWith("ThaiReader")) { $("translation-status").textContent = "An attributed offline sentence example is already shown."; return; }
  if (settings.translationProvider === "offline") { $("translation-status").textContent = "Offline mode only shows stored sentence examples; select Azure F0 or Ollama to translate new text."; return; }
  if (settings.translationProvider === "ollama" && !settings.translationModel) { $("translation-status").textContent = "Select an installed Ollama model in Settings first."; return; }
  const button = $<HTMLButtonElement>("translate-current"); button.disabled = true;
  $("translation-status").textContent = "Retrying translation…";
  await translateCard(sentence, analysisRequest, sentenceIndex);
  button.disabled = false;
});
$("save-azure-key").addEventListener("click", async () => {
  const input = $<HTMLInputElement>("azure-key");
  if (!input.value.trim()) { $("provider-status").textContent = "Paste a key from this resource's Keys and Endpoint page first."; return; }
  try {
    await invoke("save_translator_key", { key: input.value });
    input.value = "";
    $("provider-status").textContent = "F0 key saved in Windows Credential Manager. It is not stored in app settings or the database.";
    updateAzureSetupStatus(true);
  } catch (error) { $("provider-status").textContent = `Could not securely save the key: ${String(error)}`; }
});
$("replace-azure-key").addEventListener("click", () => {
  $("azure-key-editor").hidden = false;
  $("replace-azure-key").hidden = true;
  $<HTMLInputElement>("azure-key").focus();
});
$("test-azure-translation").addEventListener("click", async () => {
  const button = $<HTMLButtonElement>("test-azure-translation");
  const results = $("translation-test-results"); results.replaceChildren(); button.disabled = true;
  $("provider-status").textContent = "Testing the Azure F0 endpoint against five attributed ThaiReader examples…";
  try {
    const cases = await invoke<{ thai: string; reference: string; model_output: string }[]>("test_azure_translation");
    for (const item of cases) {
      const row = document.createElement("div"); row.className = "translation-test-row";
      const thai = document.createElement("strong"); thai.lang = "th"; thai.textContent = item.thai;
      const reference = document.createElement("span"); reference.textContent = `Reference: ${item.reference}`;
      const output = document.createElement("span"); output.textContent = `Azure: ${item.model_output}`;
      row.append(thai, reference, output); results.append(row);
    }
    $("provider-status").textContent = `Azure F0 returned ${cases.length} real translations. Compare the output with each ThaiReader reference; latency is shown per result.`;
  } catch (error) { $("provider-status").textContent = `Azure test failed: ${String(error)}`; }
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
  const nextProvider = $<HTMLSelectElement>("translation-provider").value;
  const selectedModel = $<HTMLSelectElement>("translation-model").value;
  if (nextProvider === "ollama" && !ollamaDiscovery?.service_available) {
    $("provider-status").textContent = `PhasaForge cannot reach the existing Ollama service at ${ollamaDiscovery?.endpoint ?? "the configured OLLAMA_HOST"}. Settings were not saved.`;
    return;
  }
  if (nextProvider === "ollama" && (!selectedModel || !ollamaDiscovery?.api_models.includes(selectedModel))) {
    $("provider-status").textContent = ollamaDiscovery?.manifest_models.length
      ? "Select one of the detected local models before saving Local Ollama."
      : "Select a detected local Ollama model before saving Local Ollama.";
    return;
  }
  settings.voice = $<HTMLSelectElement>("voice-select").value;
  settings.translationProvider = nextProvider;
  settings.translationProviderConfigured = true;
  settings.translationModel = selectedModel || settings.translationModel;
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
  if (settings.translationProvider === "ollama") {
    const button = $<HTMLButtonElement>("save-settings");
    button.disabled = true;
    $("settings-saved").textContent = "Settings saved; starting the model…";
    $("provider-status").textContent = `Starting ${settings.translationModel} in Ollama. First load can take a minute while its weights enter memory.`;
    $("ollama-residency-status").textContent = `Loading ${settings.translationModel}…`;
    try {
      const loaded = await invoke<OllamaRunningModel>("load_ollama_model", { model: settings.translationModel });
      const memory = loaded.size ? ` · ${ (loaded.size / (1024 ** 3)).toFixed(1) } GiB resident` : "";
      const vram = loaded.size_vram ? ` · ${(loaded.size_vram / (1024 ** 3)).toFixed(1)} GiB VRAM` : "";
      $("ollama-residency-status").textContent = `Loaded and resident in Ollama: ${loaded.name}${memory}${vram}.`;
      $("provider-status").textContent = `${loaded.name} is running and will stay loaded until Ollama unloads it. Local Thai translation is ready.`;
      $("settings-saved").textContent = "Saved; model loaded in memory.";
    } catch (error) {
      $("ollama-residency-status").textContent = `Model did not load: ${String(error)}`;
      $("provider-status").textContent = `Settings were saved, but Ollama did not confirm a running model: ${String(error)}`;
      $("settings-saved").textContent = "Settings saved; model load failed.";
    } finally { button.disabled = false; }
  } else {
    $("settings-saved").textContent = "Saved on this device.";
    setTimeout(() => { $("settings-saved").textContent = ""; }, 2000);
  }
});

async function refreshThaiAsrStatus(): Promise<void> {
  try {
    thaiAsrReady = await invoke<boolean>("thai_asr_status");
    $("asr-status").textContent = thaiAsrReady
      ? "Local Thai recognition is ready. It uses the CPU only while transcribing, then exits; a temporary audio file stays on this PC and is deleted after use."
      : "Not prepared yet. First-time setup installs the local CPU engine and audio support, then downloads the Thai model (about 150 MB extracted). It can take several minutes; Python 3.10+ and internet are required.";
    $("prepare-thai-asr").textContent = thaiAsrReady ? "Refresh Practice speech recognition" : "Prepare Practice speech recognition now";
  } catch (error) {
    thaiAsrReady = false;
    $("asr-status").textContent = `Could not check local Thai recognition: ${String(error)}`;
  }
}

async function ensureThaiAsrReady(): Promise<void> {
  if (thaiAsrReady) return;
  if (!thaiAsrPreparation) {
    thaiAsrPreparation = (async () => {
      await invoke("prepare_thai_asr");
      thaiAsrReady = await invoke<boolean>("thai_asr_status");
      if (!thaiAsrReady) throw new Error("Setup finished without a ready recognizer. Open Setup to retry.");
      await refreshThaiAsrStatus();
    })().finally(() => { thaiAsrPreparation = undefined; });
  }
  await thaiAsrPreparation;
}

async function transcribePracticeRecording(blob: Blob): Promise<void> {
  if (transcriptionInProgress) return;
  transcriptionInProgress = true;
  setRecordingControls(false, !audio.paused);
  try {
    if (!thaiAsrReady) {
      $("practice-status").textContent = "Your recording is saved. Preparing the Thai speech recognizer now (one-time download); it will transcribe this same take when ready…";
      $("heard-text").textContent = "Preparing Thai speech recognition…";
      await ensureThaiAsrReady();
    }
    $("practice-status").textContent = "Recording is available for replay. Transcribing locally on the CPU…";
    $("heard-text").textContent = "Transcribing…";
    $("heard-translation").textContent = "Waiting for Thai recognition…";
    $("heard-translation-status").textContent = "";
    const text = await transcribeRecording(blob);
    const recognizedThai = text.trim();
    $("heard-text").textContent = recognizedThai || "No Thai speech was recognised in this recording.";
    if (recognizedThai) {
      $("practice-status").textContent = "Thai speech recognized. Translating the recognized words into English…";
      await translatePracticeTranscript(recognizedThai);
    } else {
      $("heard-translation").textContent = "There is no recognized Thai text to translate.";
      $("practice-status").textContent = "No Thai speech was recognized in this recording.";
    }
  } catch (error) {
    $("heard-text").textContent = "Your recording is still available for replay; recognition setup did not finish.";
    $("practice-status").textContent = `Thai speech recognition could not prepare or transcribe this take: ${String(error)} Open Setup to retry; the saved take will be transcribed after setup.`;
    $("asr-status").textContent = `Speech recognition setup failed: ${String(error)}`;
  } finally {
    transcriptionInProgress = false;
    setRecordingControls(false, !audio.paused);
  }
}

async function translatePracticeTranscript(thai: string): Promise<void> {
  try {
    const result = await invoke<{ english: string; provider: string; latency_ms: number; cached: boolean }>("translate_azure", { text: thai });
    $("heard-translation").textContent = result.english;
    $("heard-translation-status").textContent = `${result.cached ? "Saved translation" : "Translated"} via ${result.provider}${result.latency_ms ? ` · ${result.latency_ms} ms` : ""}.`;
    $("practice-status").textContent = "Recognition and English translation complete. Compare both with the sentence above; this is not pronunciation or tone scoring.";
  } catch (error) {
    $("heard-translation").textContent = "English translation is unavailable.";
    $("heard-translation-status").textContent = `Translation failed: ${String(error)}`;
    $("practice-status").textContent = "Thai speech was recognized, but its English translation failed. The Thai transcript remains available above.";
  }
}

$("prepare-thai-asr").addEventListener("click", async event => {
  const button = event.currentTarget as HTMLButtonElement;
  button.disabled = true;
  $("asr-status").textContent = "Preparing the Practice speech recognizer: installing its local CPU engine and audio support, then downloading the Thai model (about 150 MB extracted). First setup can take several minutes; microphone audio stays local.";
  try {
    await ensureThaiAsrReady();
    await refreshThaiAsrStatus();
    if (lastRecordingBlob) void transcribePracticeRecording(lastRecordingBlob);
  } catch (error) {
    $("asr-status").textContent = `Practice speech recognition setup failed: ${String(error)}`;
  } finally {
    button.disabled = false;
  }
});

const audio = $("recorded-audio") as HTMLAudioElement;
const setRecordingControls = (recording: boolean, playing: boolean): void => {
  $("record").toggleAttribute("disabled", recording || playing || transcriptionInProgress);
  $("stop-record").toggleAttribute("disabled", !recording);
  $("play-recording").toggleAttribute("disabled", recording || playing || speechPlaying || !recordingUrl);
  $("record-again").toggleAttribute("disabled", recording || playing || speechPlaying || transcriptionInProgress);
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
  $("heard-text").textContent = "Waiting for recording…";
  $("heard-translation").textContent = "Waiting for Thai recognition…";
  $("heard-translation-status").textContent = "";
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
      stream?.getTracks().forEach(t => t.stop());
      stream = undefined;
      const blob = new Blob(recordedChunks, { type: mediaRecorder?.mimeType || "audio/webm" });
      lastRecordingBlob = blob;
      recordingUrl = blob.size ? URL.createObjectURL(blob) : undefined;
      if (recordingUrl) audio.src = recordingUrl;
      setRecordingControls(false, false);
      if (recordingUrl) {
        void transcribePracticeRecording(blob);
      } else {
        $("practice-status").textContent = "No usable audio was captured. Please record again.";
        $("heard-text").textContent = "—";
      }
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

async function transcribeRecording(blob: Blob): Promise<string> {
  const decoder = new AudioContext();
  try {
    const decoded = await decoder.decodeAudioData(await blob.arrayBuffer());
    if (decoded.duration > 60) throw new Error("Recordings for this baseline are limited to 60 seconds.");
    const frames = Math.max(1, Math.ceil(decoded.duration * 16_000));
    const offline = new OfflineAudioContext(1, frames, 16_000);
    const sourceNode = offline.createBufferSource();
    sourceNode.buffer = decoded;
    sourceNode.connect(offline.destination);
    sourceNode.start();
    const resampled = await offline.startRendering();
    const samples = Array.from(resampled.getChannelData(0));
    return await invoke<string>("transcribe_thai_audio", { samples, sampleRate: 16_000 });
  } finally {
    await decoder.close().catch(() => undefined);
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
void refreshThaiAsrStatus();
renderViews();

if ("__TAURI_INTERNALS__" in window) {
  const appWindow = getCurrentWindow();
  // Discover Ollama at startup and restore the saved model when Local Ollama is selected.
  void refreshOllamaModels();
  void invoke<typeof nativeThaiVoices>("list_thai_voices").then(voices => {
    nativeThaiVoices = voices;
    nativeVoiceDiscoveryComplete = true;
    updateVoiceOptions();
  }).catch(error => {
    nativeVoiceDiscoveryComplete = true;
    updateVoiceOptions();
    $("voice-setup-note").textContent = "Windows native Thai voice discovery failed: " + String(error) + ". Install a Thai text-to-speech voice in Windows Settings.";
  });
  void invoke<string>("database_location").then(path => { $<HTMLInputElement>("database-path").value = path; }).catch(error => { $<HTMLInputElement>("database-path").value = String(error); });
  void invoke<boolean>("translator_key_status").then(configured => {
    updateAzureSetupStatus(configured);
    if (configured) $("provider-status").textContent = "Azure Translator F0 key is stored in Windows Credential Manager. Automatic translation is ready.";
    else if (settings.translationProvider === "azure") $("provider-status").textContent = "No Azure F0 key is saved. Enter one in Setup only if you want to use Azure; offline word analysis remains ready.";
  }).catch(error => { $("translation-setup-status").textContent = `Could not check Azure key status: ${String(error)}`; $("provider-status").textContent = `Could not check secure Translator key status: ${String(error)}`; });
  void listen<{ text: string | null; rect: { x: number; y: number; width: number; height: number } | null; clipboard_restored: boolean | null; source: string; clipboard_status: string }>("selection-captured", async event => {
    const capture = event.payload;
    // A failed/empty capture replaces the previous source; never imply stale text was newly selected.
    source.value = capturedSourceText(capture);
    sentenceIndex = 0;
    renderPassage();
    $("capture-status").textContent = captureNotice(capture);
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
