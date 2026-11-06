import test from "node:test";
import assert from "node:assert/strict";
import { captureNotice, capturedSourceText } from "../src/capture-state.mjs";

test("an empty capture clears previous source text instead of reusing stale text", () => {
  const previous = "ย่อหน้าก่อนหน้า";
  const result = capturedSourceText({ text: null, source: "none" });
  assert.equal(result, "");
  assert.notEqual(result, previous);
});

test("a skipped rich clipboard is reported as skipped, not as restoration failure", () => {
  const capture = { text: null, source: "none", clipboard_status: "multiple_clipboard_formats", clipboard_restored: null };
  assert.match(captureNotice(capture), /was skipped and the clipboard was left alone/i);
  assert.doesNotMatch(captureNotice(capture), /restoration failed/i);
});

test("an attempted clipboard restoration failure is reported distinctly", () => {
  const capture = { text: "ภาษาไทย", source: "clipboard", clipboard_status: "restore_failed", clipboard_restored: false };
  assert.match(captureNotice(capture), /restoration failed/i);
});
