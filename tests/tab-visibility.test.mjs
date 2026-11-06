import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { lessonViewState } from "../src/view-state.mjs";

test("only the selected learning tab is visible, and Settings preserves it", async () => {
  const css = await readFile(new URL("../src/style.css", import.meta.url), "utf8");
  assert.match(css, /\.tab-content\[hidden\][^{]*\{[^}]*display\s*:\s*none\s*!important/i);
  assert.match(css, /#tabs\[hidden\][^{]*\{[^}]*display\s*:\s*none\s*!important/i);
  for (const activeTab of ["meaning", "words", "practice"]) {
    const visible = lessonViewState(activeTab, false);
    assert.equal(Object.values(visible).filter(Boolean).length, 1);
    assert.equal(visible[activeTab], true);
    assert.deepEqual(lessonViewState(activeTab, true), { meaning: false, words: false, practice: false });
    assert.equal(lessonViewState(activeTab, false)[activeTab], true);
  }
});
