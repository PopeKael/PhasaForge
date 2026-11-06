import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

// Starts a separate, invisible test-identity Tauri app. PHASAFORGE_TEST_MODE
// disables only its tray and global keyboard hook so this check cannot steal
// focus or consume keyboard input from the user's desktop.
const root = resolve(".");
const scratch = await mkdtemp(join(tmpdir(), "phasaforge-tauri-ui-"));
const appData = join(scratch, "Roaming"); const localAppData = join(scratch, "Local");
await mkdir(appData, { recursive: true }); await mkdir(localAppData, { recursive: true });
const port = "9227";
const testAppData = join(scratch, "AppData");
const env = { ...process.env, APPDATA: appData, LOCALAPPDATA: localAppData, PHASAFORGE_TEST_MODE: "1", PHASAFORGE_TEST_APP_DATA: testAppData, WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port}`,
  CARGO_HOME: join(root, "src-tauri", ".cargo-home"), CARGO_TARGET_DIR: "C:\\Users\\Warren\\.codex\\visualizations\\2026\\11\\05\\01a1a999-114b-7ac1-9369-76c805915ca1\\phasaforge-target" };
const processUnderTest = spawn("npm.cmd", ["run", "tauri", "--", "dev", "--config", "src-tauri/tauri.test.conf.json"], { cwd: root, env, windowsHide: true, stdio: "ignore", shell: true });
let cdp;

async function waitFor(fn, timeout = 180000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    try { const value = await fn(); if (value) return value; } catch { /* service is starting */ }
    if (processUnderTest.exitCode !== null) throw new Error(`Tauri UI test process exited (${processUnderTest.exitCode})`);
    await new Promise(r => setTimeout(r, 250));
  }
  throw new Error("Timed out waiting for invisible Tauri WebView2");
}
async function connect(wsUrl) {
  const socket = new WebSocket(wsUrl);
  await new Promise((yes, no) => { socket.addEventListener("open", yes, { once: true }); socket.addEventListener("error", no, { once: true }); });
  let nextId = 0; const pending = new Map();
  socket.addEventListener("message", event => {
    const message = JSON.parse(event.data); if (!message.id) return;
    const entry = pending.get(message.id); if (!entry) return;
    pending.delete(message.id); clearTimeout(entry.timer);
    message.error ? entry.reject(new Error(JSON.stringify(message.error))) : entry.resolve(message.result);
  });
  return {
    call(method, params = {}) {
      const id = ++nextId;
      return new Promise((resolveCall, rejectCall) => {
        const entry = { resolve: resolveCall, reject: rejectCall, timer: setTimeout(() => { pending.delete(id); rejectCall(new Error(`CDP timeout ${method}`)); }, 30000) };
        pending.set(id, entry); socket.send(JSON.stringify({ id, method, params }));
      });
    }, close() { socket.close(); },
  };
}
async function findFile(directory, name) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isFile() && entry.name === name) return path;
    if (entry.isDirectory()) { const found = await findFile(path, name); if (found) return found; }
  }
  return null;
}
async function listFiles(directory) {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isFile()) result.push(path);
    else if (entry.isDirectory()) result.push(...await listFiles(path));
  }
  return result;
}

try {
  const targets = await waitFor(async () => {
    const response = await fetch(`http://127.0.0.1:${port}/json/list`);
    if (!response.ok) return null;
    const pages = await response.json(); return pages.find(p => p.type === "page" && p.webSocketDebuggerUrl);
  });
  cdp = await connect(targets.webSocketDebuggerUrl);
  await cdp.call("Page.enable");
  await cdp.call("Emulation.setDeviceMetricsOverride", { width: 640, height: 480, deviceScaleFactor: 1, mobile: false });
  const evaluate = async expression => {
    const out = await cdp.call("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (out.exceptionDetails) throw new Error(out.exceptionDetails.exception?.description ?? out.exceptionDetails.text);
    return out.result.value;
  };
  await waitFor(async () => evaluate("document.readyState === 'complete' && document.querySelector('#app') !== null"));
  const sample = "เราเดินดูของหลายอย่าง ทั้งผัก ผลไม้ และอาหารพื้นบ้าน";
  await evaluate(`(() => { const e=document.querySelector('#source-text'); e.value=${JSON.stringify(sample)}; e.dispatchEvent(new Event('input',{bubbles:true})); return true; })()`);
  await waitFor(async () => (await evaluate("document.querySelector('#meaning-line')?.textContent"))?.includes("We looked at many kinds of things"));
  const analysis = await evaluate("({sentence:document.querySelector('#thai-focus').textContent,meaning:document.querySelector('#meaning-line').textContent,pronunciation:document.querySelector('#romanization').textContent,tiles:[...document.querySelectorAll('.word-chip')].map(e=>e.textContent)})");
  assert.equal(analysis.sentence, sample);
  assert.ok(analysis.tiles.includes("ผัก") && analysis.tiles.includes("ผลไม้"), JSON.stringify(analysis.tiles));
  await evaluate("[...document.querySelectorAll('.word-chip')].find(e=>e.textContent==='ผัก').click()");
  const word = await evaluate("document.querySelector('#word-details').innerText");
  assert.match(word, /vegetable/i); assert.match(word, /pàk/i); assert.match(word, /low tone/i);
  const voices = await evaluate("window.__TAURI_INTERNALS__.invoke('list_thai_voices')");
  const voiceUi = await evaluate("({choices:[...document.querySelector('#voice-select').options].map(o=>o.text),note:document.querySelector('#voice-note').textContent})");
  const output = join(root, "release-artifacts", "0.2.2", "ui-verification"); await mkdir(output, { recursive: true });
  const capture = async name => { const shot = await cdp.call("Page.captureScreenshot", { format: "png", captureBeyondViewport: false }); await writeFile(join(output, name), Buffer.from(shot.data, "base64")); };
  await capture("tauri-words-640x480.png");
  await evaluate("document.querySelector('#settings-toggle').click()");
  const settings = await evaluate("({hidden:document.querySelector('#settings-view').hidden,scroll:document.querySelector('#settings-view').scrollHeight>document.querySelector('#settings-view').clientHeight,scrollHeight:document.querySelector('#settings-view').scrollHeight,clientHeight:document.querySelector('#settings-view').clientHeight,width:document.querySelector('#app').getBoundingClientRect().width,height:document.querySelector('#app').getBoundingClientRect().height})");
  assert.equal(settings.hidden, false); assert.equal(settings.scroll, true); assert.equal(settings.width, 640); assert.equal(settings.height, 480);
  await evaluate("document.querySelector('#test-offline').click()");
  await waitFor(async () => (await evaluate("document.querySelector('#engine-test-status').textContent"))?.startsWith("Passed"));
  const diagnosticLog = await findFile(testAppData, "hotkey.log");
  assert.ok(diagnosticLog, `startup should write the privacy-safe diagnostic log under app data; found files: ${JSON.stringify(await listFiles(scratch))}`);
  const diagnosticText = await readFile(diagnosticLog, "utf8");
  assert.match(diagnosticText, /app\.start version=0\.2.2/);
  assert.doesNotMatch(diagnosticText, new RegExp(sample));
  await capture("tauri-settings-640x480.png");
  console.log(JSON.stringify({ size: "640×480", sample: analysis, clickedWord: word, engineTest: await evaluate("document.querySelector('#engine-test-status').textContent"), settings, installedThaiWinRtVoices: voices.length, voiceUi, diagnosticLog, screenshots: output }, null, 2));
} finally {
  cdp?.close();
  const killer = spawn("taskkill.exe", ["/PID", String(processUnderTest.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" });
  await new Promise(done => { killer.once("exit", done); killer.once("error", done); });
  await rm(scratch, { recursive: true, force: true, maxRetries: 8, retryDelay: 250 });
}
