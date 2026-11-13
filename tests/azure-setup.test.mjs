import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const projectFile = path => new URL(`../${path}`, import.meta.url);

test("Azure onboarding collects a password field and an editable resource region", async () => {
  const html = await readFile(projectFile("index.html"), "utf8");
  assert.match(html, /id="azure-key" type="password"/);
  assert.match(html, /id="azure-region" type="text"/);
  assert.match(html, /Leave blank only for a global Translator resource/);
  assert.match(html, /Offline examples make no network requests/);
  assert.match(html, /Local Ollama needs Ollama running/);
});

test("Azure key and region save together in this Windows account's Credential Manager", async () => {
  const frontend = await readFile(projectFile("src/main.ts"), "utf8");
  const rust = await readFile(projectFile("src-tauri/src/language.rs"), "utf8");
  assert.match(frontend, /invoke\("save_translator_key", \{ key: input\.value, region \}\)/);
  assert.match(frontend, /invoke<string>\("translator_region"\)/);
  assert.match(frontend, /will not use another Windows account's credentials/);
  assert.match(rust, /PhasaForge\/AzureTranslator\/F0/);
  assert.match(rust, /PhasaForge\/AzureTranslator\/Region/);
  assert.match(rust, /fn validate_translator_region/);
});

test("Azure region header follows the saved region instead of a fixed location", async () => {
  const rust = await readFile(projectFile("src-tauri/src/language.rs"), "utf8");
  assert.doesNotMatch(rust, /Ocp-Apim-Subscription-Region",\s*"southeastasia"/);
  assert.match(rust, /if !region\.trim\(\)\.is_empty\(\) \{ request = request\.header\("Ocp-Apim-Subscription-Region", region\.trim\(\)\); \}/);
  assert.match(rust, /rejected the saved key or resource region/);
});
