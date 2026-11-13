import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const file = path => new URL(`../${path}`, import.meta.url);

test("NSIS and MSI uninstall only PhasaForge startup registrations", async () => {
  const config = JSON.parse(await readFile(file("src-tauri/tauri.conf.json"), "utf8"));
  const nsis = await readFile(file("src-tauri/windows/nsis_hooks.nsh"), "utf8");
  const wix = await readFile(file("src-tauri/windows/fragments/phasaforge_uninstall.wxs"), "utf8");

  assert.equal(config.bundle.windows.nsis.installerHooks, "windows/nsis_hooks.nsh");
  assert.deepEqual(config.bundle.windows.wix.componentGroupRefs, ["PhasaForgeUninstallCleanup"]);
  assert.match(nsis, /NSIS_HOOK_PREUNINSTALL/);
  assert.match(nsis, /DeleteRegValue HKCU .*\\Run" "PhasaForge"/);
  assert.match(nsis, /DeleteRegValue HKCU .*StartupApproved\\Run" "PhasaForge"/);
  assert.doesNotMatch(nsis, /DeleteRegKey/);

  assert.match(wix, /RemovePhasaForgeRunEntry[\s\S]*REMOVE="ALL"/);
  assert.match(wix, /RemovePhasaForgeStartupApprovedEntry[\s\S]*REMOVE="ALL"/);
  assert.equal((wix.match(/\[System64Folder\]reg\.exe/g) ?? []).length, 2);
  assert.equal((wix.match(/\/v "PhasaForge" \/f/g) ?? []).length, 2);
  assert.doesNotMatch(wix, /RemoveRegistryKey/);
});
