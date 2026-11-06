import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

// Hidden-window end-to-end check. It starts a separate app-data identity and never takes desktop focus.
const root = resolve(".");
const scratch = await mkdtemp(join(tmpdir(), "phasaforge-azure-ui-"));
const port = "9228";
await mkdir(join(scratch, "Roaming"), { recursive: true });
await mkdir(join(scratch, "Local"), { recursive: true });
const env = { ...process.env, APPDATA: join(scratch, "Roaming"), LOCALAPPDATA: join(scratch, "Local"), PHASAFORGE_TEST_MODE: "1", PHASAFORGE_TEST_APP_DATA: join(scratch, "AppData"), WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port}`, CARGO_HOME: join(root, ".cargo-home"), CARGO_TARGET_DIR: "C:\\Users\\Warren\\.codex\\visualizations\\2026\\11\\05\\01a1a999-114b-7ac1-9369-76c805915ca1\\phasaforge-target" };
const child = spawn("npm.cmd", ["run", "tauri", "--", "dev", "--config", "src-tauri/tauri.test.conf.json"], { cwd: root, env, windowsHide: true, stdio: ["ignore", "pipe", "pipe"], shell: true });
let childLog = "";
child.stdout.on("data", chunk => { childLog = (childLog + chunk.toString()).slice(-8000); });
child.stderr.on("data", chunk => { childLog = (childLog + chunk.toString()).slice(-8000); });
let socket;
async function waitFor(fn, timeout = 180000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    try { const value = await fn(); if (value) return value; } catch {}
    if (child.exitCode !== null) throw new Error(`Hidden test app exited (${child.exitCode})\n${childLog}`);
    await new Promise(resolveWait => setTimeout(resolveWait, 250));
  }
  throw new Error("Timed out waiting for the hidden Tauri WebView2");
}
try {
  const target = await waitFor(async () => {
    const response = await fetch(`http://127.0.0.1:${port}/json/list`);
    if (!response.ok) return null;
    return (await response.json()).find(page => page.type === "page" && page.webSocketDebuggerUrl);
  });
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolveOpen, reject) => { socket.addEventListener("open", resolveOpen, { once: true }); socket.addEventListener("error", reject, { once: true }); });
  let id = 0; const pending = new Map();
  socket.addEventListener("message", event => { const message = JSON.parse(event.data); if (!message.id) return; const p = pending.get(message.id); if (!p) return; pending.delete(message.id); message.error ? p.reject(new Error(JSON.stringify(message.error))) : p.resolve(message.result); });
  const call = (method, params = {}) => new Promise((resolveCall, reject) => { const current = ++id; const timer = setTimeout(() => { pending.delete(current); reject(new Error(`CDP timeout: ${method}`)); }, 30000); pending.set(current, { resolve: value => { clearTimeout(timer); resolveCall(value); }, reject: error => { clearTimeout(timer); reject(error); } }); socket.send(JSON.stringify({ id: current, method, params })); });
  await call("Page.enable");
  await call("Emulation.setDeviceMetricsOverride", { width: 640, height: 480, deviceScaleFactor: 1, mobile: false });
  const evaluate = async expression => { const result = await call("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true }); if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text); return result.result.value; };
  await waitFor(async () => evaluate("document.readyState==='complete' && !!document.querySelector('#app')"));
  const dimensions = await evaluate("({width:window.innerWidth,height:window.innerHeight})");
  assert.equal(await evaluate("window.__TAURI_INTERNALS__.invoke('translator_key_status')"), true, "rotated F0 key should be available to the app in Windows Credential Manager");
  const references = await evaluate("window.__TAURI_INTERNALS__.invoke('test_azure_translation')");
  assert.equal(references.length, 5);
  assert.ok(references.every(item => item.model_output?.length > 0));
  console.log("Azure F0 reference responses:", JSON.stringify(references));
  await evaluate("localStorage.setItem('phasaforge.settings', JSON.stringify({translationProvider:'azure',translationModel:''}))");
  await call("Page.reload");
  await waitFor(async () => evaluate("document.readyState==='complete' && !!document.querySelector('#app')"));
  const thai = "ลิงสีม่วงกำลังขับยานอวกาศเหนือเชียงใหม่";
  await evaluate(`(() => {const e=document.querySelector('#source-text');e.value=${JSON.stringify(thai)};e.dispatchEvent(new Event('input',{bubbles:true}));return true;})()`);
  await waitFor(async () => { const text = await evaluate("document.querySelector('#meaning-line')?.textContent"); return text && !text.includes("pending") && !text.includes("unavailable"); }, 45000);
  const automatic = await evaluate("({thai:document.querySelector('#thai-focus').textContent,meaning:document.querySelector('#meaning-line').textContent,source:document.querySelector('#translation-source').textContent,words:[...document.querySelectorAll('.word-chip')].map(x=>x.textContent)})");
  console.log("Automatic UI result:", JSON.stringify(automatic));
  assert.equal(automatic.thai, thai);
  assert.match(automatic.meaning, /^Meaning: /);
  assert.ok(automatic.source.includes("Azure Translator F0"));
  assert.ok(automatic.words.length > 0);
  const first = await evaluate("window.__TAURI_INTERNALS__.invoke('translate_azure',{text:'วันนี้อากาศดี'})");
  const cached = await evaluate("window.__TAURI_INTERNALS__.invoke('translate_azure',{text:'วันนี้อากาศดี'})");
  assert.ok(first.english.length > 0 && first.latency_ms > 0);
  assert.equal(cached.cached, true); assert.equal(cached.latency_ms, 0);
  console.log(JSON.stringify({ dimensions, references, automatic, measuredFirstRequestMs: first.latency_ms, cachedSecondRequest: cached.cached }, null, 2));
} finally {
  socket?.close();
  const killer = spawn("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" });
  await new Promise(done => { killer.once("exit", done); killer.once("error", done); });
  await rm(scratch, { recursive: true, force: true, maxRetries: 8, retryDelay: 250 });
}
