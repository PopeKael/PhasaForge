export const SETTINGS_KEY = "phasaforge.settings";
export const TRANSLATION_DEFAULT_KEY = "phasaforge.translation-default.0.3.5";
export const MMS_VOICE = "mms:facebook/mms-tts-tha";

export const DEFAULT_SETTINGS = Object.freeze({
  speed: 0.75,
  voice: MMS_VOICE,
  voiceConfigured: false,
  hotkeyModifier: "right_ctrl",
  hotkeyKey: "up",
  translationProvider: "azure",
  translationModel: "",
  translationProviderConfigured: false,
  autoStart: false,
});

export function loadSettings(storage) {
  const raw = storage.getItem(SETTINGS_KEY);
  let saved = {};
  try { saved = raw ? JSON.parse(raw) : {}; } catch { saved = {}; }
  if (!saved || typeof saved !== "object" || Array.isArray(saved)) saved = {};

  const settings = { ...DEFAULT_SETTINGS, ...saved };
  if (typeof saved.translationProviderConfigured !== "boolean") {
    settings.translationProviderConfigured = typeof saved.translationProvider === "string" && saved.translationProvider.length > 0;
  }
  if (typeof saved.voiceConfigured !== "boolean") {
    settings.voiceConfigured = typeof saved.voice === "string" && saved.voice.length > 0;
  }

  if (!storage.getItem(TRANSLATION_DEFAULT_KEY)) {
    if (!saved.translationProvider) settings.translationProvider = "azure";
    storage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    storage.setItem(TRANSLATION_DEFAULT_KEY, "set");
  }
  return settings;
}

export function persistSettings(storage, settings) {
  storage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

export function isConfigured(settings) {
  return settings.translationProviderConfigured === true && settings.voiceConfigured === true;
}

export function requiredProvidersReady(settings, readiness) {
  // Voice models and native voice availability are reported in Setup, but an
  // optional speech model does not prevent opening the learning interface.
  if (!isConfigured(settings)) return false;
  if (settings.translationProvider === "offline") return true;
  if (settings.translationProvider === "azure") return readiness.azureKeyConfigured === true;
  if (settings.translationProvider === "ollama") {
    return readiness.ollamaServiceAvailable === true
      && readiness.ollamaModelAvailable === true
      && readiness.ollamaModelLoaded === true;
  }
  return false;
}
