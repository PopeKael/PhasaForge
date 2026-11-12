import test from "node:test";
import assert from "node:assert/strict";
import { applyAutoStartPreference } from "../src/autostart-state.mjs";

test("unchanged startup preference does not touch the Windows registration", async () => {
  let calls = 0;
  const current = await applyAutoStartPreference(false, false, {
    async enable() { calls++; },
    async disable() { calls++; },
  });
  assert.equal(current, false);
  assert.equal(calls, 0);
});

test("startup preference enables or disables only when selection changes", async () => {
  const calls = [];
  const api = {
    async enable() { calls.push("enable"); },
    async disable() { calls.push("disable"); },
  };
  assert.equal(await applyAutoStartPreference(true, false, api), true);
  assert.equal(await applyAutoStartPreference(false, true, api), false);
  assert.deepEqual(calls, ["enable", "disable"]);
});

test("a failed startup registration change propagates without claiming success", async () => {
  await assert.rejects(
    applyAutoStartPreference(true, false, { async enable() { throw new Error("denied"); }, async disable() {} }),
    /denied/,
  );
});
