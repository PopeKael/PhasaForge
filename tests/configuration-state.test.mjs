import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_SETTINGS, MMS_VOICE, SETTINGS_KEY, TRANSLATION_DEFAULT_KEY, isConfigured, loadSettings, persistSettings, requiredProvidersReady } from "../src/configuration-state.mjs";

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
  };
}

test("new configurations select MMS but remain in setup until required settings are saved", () => {
  const storage = memoryStorage();
  const settings = loadSettings(storage);
  assert.equal(settings.voice, MMS_VOICE);
  assert.equal(settings.translationProvider, "azure");
  assert.equal(settings.voiceConfigured, false);
  assert.equal(settings.translationProviderConfigured, false);
  assert.equal(isConfigured(settings), false);
});

test("saved provider, model, voice, and unrelated settings survive reload and migration", () => {
  const old = { ...DEFAULT_SETTINGS, translationProvider: "ollama", translationModel: "qwen3:4b", translationProviderConfigured: true, voice: "winrt:thai-voice", voiceConfigured: true, speed: 0.85, customSetting: "keep" };
  const storage = memoryStorage({ [SETTINGS_KEY]: JSON.stringify(old) });
  const loaded = loadSettings(storage);
  assert.equal(loaded.translationProvider, "ollama");
  assert.equal(loaded.translationModel, "qwen3:4b");
  assert.equal(loaded.voice, "winrt:thai-voice");
  assert.equal(loaded.speed, 0.85);
  assert.equal(loaded.customSetting, "keep");
  assert.equal(isConfigured(loaded), true, "a saved provider and voice remain configured even when a provider is temporarily unavailable");
  assert.ok(storage.getItem(TRANSLATION_DEFAULT_KEY));
  persistSettings(storage, loaded);
  const restarted = loadSettings(storage);
  assert.deepEqual(restarted, loaded);
});

test("offline and Azure readiness are provider-specific", () => {
  const base = { translationProviderConfigured: true, voiceConfigured: true };
  assert.equal(requiredProvidersReady({ ...base, translationProvider: "offline" }, { voiceReady: false }), true);
  assert.equal(requiredProvidersReady({ ...base, translationProvider: "azure" }, { voiceReady: true, azureKeyConfigured: false }), false);
  assert.equal(requiredProvidersReady({ ...base, translationProvider: "azure" }, { voiceReady: true, azureKeyConfigured: true }), true);
  assert.equal(requiredProvidersReady({ ...base, translationProvider: "azure" }, { voiceReady: false, azureKeyConfigured: true }), true, "an optional, not-yet-downloaded voice model must not block the configured app");
});

test("Ollama is ready only when selected model is available and already resident", () => {
  const settings = { translationProviderConfigured: true, voiceConfigured: true, translationProvider: "ollama" };
  const base = { voiceReady: true, ollamaServiceAvailable: true, ollamaModelAvailable: true };
  assert.equal(requiredProvidersReady(settings, { ...base, ollamaModelLoaded: false }), false);
  assert.equal(requiredProvidersReady(settings, { ...base, ollamaModelLoaded: true }), true);
});
