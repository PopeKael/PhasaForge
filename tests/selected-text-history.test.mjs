import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import {
  MAX_SELECTED_TEXT_HISTORY,
  SELECTED_TEXT_ANALYSIS_VERSION,
  SELECTED_TEXT_HISTORY_KEY,
  loadSelectedTextHistory,
  nextSelectedTextIndex,
  previousSelectedTextIndex,
  rememberSelectedText,
  saveSelectedTextHistory,
  selectedTextAnalysisNeedsRefresh,
  shouldAutoTranslateSelectedText,
} from "../src/selected-text-history.mjs";

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
  };
}

test("selected text history persists cached sentence analysis and translation across reload", () => {
  const storage = memoryStorage();
  const initial = rememberSelectedText([], "  ห้องน้ำอยู่ที่ไหนครับ  ", "text-1", "2026-11-10T10:18:00Z");
  initial.entry.analysis.push({ text: "ห้องน้ำอยู่ที่ไหนครับ", meaning: "Where is the bathroom?", words: [{ word: "ห้องน้ำ", reading: "hɔ̂ng-náam" }] });
  initial.entry.status = "processed";
  saveSelectedTextHistory(storage, initial.entries);

  const restored = loadSelectedTextHistory(storage);
  assert.equal(restored[0].text, "ห้องน้ำอยู่ที่ไหนครับ");
  assert.equal(restored[0].analysis[0].meaning, "Where is the bathroom?");
  assert.equal(restored[0].analysis[0].words[0].reading, "hɔ̂ng-náam");
  assert.equal(restored[0].status, "processed");
  assert.equal(restored[0].analysis_version, SELECTED_TEXT_ANALYSIS_VERSION);
});

test("legacy processed history stays available and is flagged for local reanalysis", () => {
  const storage = memoryStorage({ [SELECTED_TEXT_HISTORY_KEY]: JSON.stringify([
    { id: "old", recorded_at: "2026-11-10T10:18:00Z", text: "ห้องน้ำ", analysis: [{ text: "ห้องน้ำ" }], status: "processed" },
  ]) });
  const [legacy] = loadSelectedTextHistory(storage);
  assert.equal(legacy.text, "ห้องน้ำ");
  assert.equal(selectedTextAnalysisNeedsRefresh(legacy), true);
  assert.equal(selectedTextAnalysisNeedsRefresh({ ...legacy, analysis_version: SELECTED_TEXT_ANALYSIS_VERSION }), false);
  assert.equal(selectedTextAnalysisNeedsRefresh({ ...legacy, status: "processing" }), false);
});

test("reselecting saved text reuses its entry and cached results instead of creating a conversion", () => {
  const entry = { id: "text-1", recorded_at: "2026-11-10T10:18:00Z", text: "สวัสดีครับ", status: "processed", analysis: [{ text: "สวัสดีครับ", meaning: "Hello." }] };
  const result = rememberSelectedText([entry], "สวัสดีครับ", "text-2", "2026-11-10T10:20:00Z");
  assert.equal(result.created, false);
  assert.equal(result.entry, entry);
  assert.deepEqual(result.entries, [entry]);
});

test("history retains the latest ten unique texts and navigation clamps at either end", () => {
  let entries = [];
  for (let n = 1; n <= MAX_SELECTED_TEXT_HISTORY + 1; n++) {
    entries = rememberSelectedText(entries, `ประโยค ${n}`, `text-${n}`, `2026-11-10T10:00:${String(n).padStart(2, "0")}Z`).entries;
  }
  assert.equal(entries.length, MAX_SELECTED_TEXT_HISTORY);
  assert.equal(entries[0].text, "ประโยค 2");
  assert.equal(entries.at(-1).text, "ประโยค 11");
  assert.equal(previousSelectedTextIndex(0, entries.length), 0);
  assert.equal(nextSelectedTextIndex(entries.length - 1, entries.length), entries.length - 1);
  assert.equal(previousSelectedTextIndex(-1, 0), -1);
  assert.equal(nextSelectedTextIndex(-1, 0), -1);
});

test("malformed history does not prevent the rest of Setup from loading", () => {
  const storage = memoryStorage({ [SELECTED_TEXT_HISTORY_KEY]: "not-json" });
  assert.deepEqual(loadSelectedTextHistory(storage), []);
});

test("migration of the prior single-text setting never triggers a hosted request", () => {
  assert.equal(shouldAutoTranslateSelectedText("azure", true), false);
  assert.equal(shouldAutoTranslateSelectedText("ollama", true), false);
  assert.equal(shouldAutoTranslateSelectedText("azure", false), true);
  assert.equal(shouldAutoTranslateSelectedText("offline", false), false);
});

test("history restoration does not call local analysis or translation providers", async () => {
  const source = await readFile(fileURLToPath(new URL("../src/main.ts", import.meta.url)), "utf8");
  const start = source.indexOf("function restoreSelectedTextHistory(");
  const end = source.indexOf("function restoreSelectedTextHistoryAndRefresh(", start);
  assert.ok(start >= 0 && end > start, "selected-text history restore function should remain explicit");
  const restore = source.slice(start, end);
  assert.doesNotMatch(restore, /invoke|translateCard|analyze_text|translate_auto|translate_ollama_auto/);
});

test("legacy history refresh reanalyzes locally and never calls a translation provider", async () => {
  const source = await readFile(fileURLToPath(new URL("../src/main.ts", import.meta.url)), "utf8");
  const start = source.indexOf("function restoreSelectedTextHistoryAndRefresh(");
  const end = source.indexOf("function rememberAndProcessSelectedText(", start);
  assert.ok(start >= 0 && end > start, "legacy history refresh should remain explicit");
  const refresh = source.slice(start, end);
  assert.match(refresh, /invoke<SentenceCard\[]>\("analyze_text"/);
  assert.doesNotMatch(refresh, /translateCard|translate_auto|translate_ollama_auto/);
  assert.match(source, /restoreSelectedTextHistoryAndRefresh\(savedTextIndex\)/);
});
