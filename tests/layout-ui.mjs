import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

// Runs against a separate invisible Tauri window and isolated app-data identity.
const root = resolve(".");
const scratch = await mkdtemp(join(tmpdir(), "phasaforge-layout-ui-"));
const screenshots = join(root, "release-artifacts", "0.3.2", "ui-check");
await mkdir(join(scratch, "Roaming"), { recursive: true });
await mkdir(join(scratch, "Local"), { recursive: true });
await mkdir(screenshots, { recursive: true });
const port = "9230";
const env = {
  ...process.env,
  APPDATA: join(scratch, "Roaming"),
  LOCALAPPDATA: join(scratch, "Local"),
  PHASAFORGE_TEST_MODE: "1",
  PHASAFORGE_TEST_APP_DATA: join(scratch, "AppData"),
  WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port}`,
  CARGO_HOME: join(root, ".cargo-home"),
  CARGO_TARGET_DIR: "C:\\Users\\Warren\\.codex\\visualizations\\2026\\11\\05\\01a1a999-114b-7ac1-9369-76c805915ca1\\phasaforge-target",
};
const child = spawn("npm.cmd", ["run", "tauri", "--", "dev", "--config", "src-tauri/tauri.test.conf.json"], {
  cwd: root, env, windowsHide: true, stdio: ["ignore", "pipe", "pipe"], shell: true,
});
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
  throw new Error("Timed out waiting for hidden Tauri WebView2");
}
try {
  const target = await waitFor(async () => {
    const response = await fetch(`http://127.0.0.1:${port}/json/list`);
    return response.ok ? (await response.json()).find(page => page.type === "page" && page.webSocketDebuggerUrl) : null;
  });
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolveOpen, reject) => { socket.addEventListener("open", resolveOpen, { once: true }); socket.addEventListener("error", reject, { once: true }); });
  let id = 0;
  const pending = new Map();
  socket.addEventListener("message", event => {
    const message = JSON.parse(event.data);
    if (!message.id) return;
    const p = pending.get(message.id);
    if (!p) return;
    pending.delete(message.id);
    message.error ? p.reject(new Error(JSON.stringify(message.error))) : p.resolve(message.result);
  });
  const call = (method, params = {}) => new Promise((resolveCall, reject) => {
    const current = ++id;
    const timer = setTimeout(() => { pending.delete(current); reject(new Error(`CDP timeout: ${method}`)); }, 30000);
    pending.set(current, {
      resolve: value => { clearTimeout(timer); resolveCall(value); },
      reject: error => { clearTimeout(timer); reject(error); },
    });
    socket.send(JSON.stringify({ id: current, method, params }));
  });
  await call("Page.enable");
  await call("Emulation.setDeviceMetricsOverride", { width: 640, height: 480, deviceScaleFactor: 1, mobile: false });
  const evaluate = async expression => {
    const result = await call("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
    return result.result.value;
  };
  await waitFor(async () => evaluate("document.readyState==='complete' && !!document.querySelector('#app')"));
  const layout = await evaluate(`(() => {
    const rect = selector => { const r = document.querySelector(selector).getBoundingClientRect(); return {x:r.x,y:r.y,width:r.width,height:r.height}; };
    const style = selector => { const s = getComputedStyle(document.querySelector(selector)); return {fontSize:s.fontSize,whiteSpace:s.whiteSpace,overflowY:s.overflowY}; };
    const app = document.querySelector('#app').getBoundingClientRect();
    return {viewport:[innerWidth,innerHeight],app:[app.width,app.height],source:rect('.source-panel'),audio:rect('.audio-panel'),focus:rect('.focus-panel'),meaning:rect('#meaning-view'),sourceStyle:style('#source-text'),thaiStyle:style('#thai-focus'),romanStyle:style('#romanization'),meaningStyle:style('#translation-english'),controls:['#play-selection','#play-current','#stop-speech','#speed'].map(s=>!!document.querySelector(s))};
  })()`);
  assert.deepEqual(layout.viewport, [640, 480]);
  assert.deepEqual(layout.app, [640, 480]);
  assert.ok(layout.source.height >= 112 && layout.focus.height >= 115, "text and current-sentence panels should receive more height");
  assert.equal(layout.controls.every(Boolean), true, "all speech controls and the speed slider remain available");
  assert.equal(layout.sourceStyle.fontSize, "15px");
  assert.equal(layout.thaiStyle.fontSize, "16px");
  assert.equal(layout.romanStyle.whiteSpace, "normal");
  assert.equal(layout.meaningStyle.fontSize, "18px");
  console.log("Layout geometry:", JSON.stringify(layout));

  async function enterThai(text) {
    await evaluate(`(() => { const e=document.querySelector('#source-text');e.value=${JSON.stringify(text)};e.dispatchEvent(new Event('input',{bubbles:true}));return true; })()`);
    await waitFor(async () => {
      const state = await evaluate(`({thai:document.querySelector('#thai-focus').textContent,meaning:document.querySelector('#translation-english').textContent})`);
      return state.thai === text && state.meaning && state.meaning !== "Translation pending…";
    }, 60000);
    return evaluate(`({thai:document.querySelector('#thai-focus').textContent,reading:document.querySelector('#romanization').textContent,summary:document.querySelector('#meaning-line').textContent,english:document.querySelector('#translation-english').textContent,words:[...document.querySelectorAll('.word-chip')].map(e=>e.textContent)})`);
  }
  const shortThai = "เราเดินดูของหลายอย่าง ทั้งผัก ผลไม้ และอาหารพื้นบ้าน";
  const short = await enterThai(shortThai);
  assert.equal(short.thai, shortThai);
  assert.ok(short.reading.startsWith("Pronunciation:") && short.reading.length > 20);
  assert.ok(short.words.length > 3);
  await evaluate("document.querySelector('[data-tab=meaning]').click()");
  assert.ok(await evaluate("!document.querySelector('#meaning-view').hidden"));
  const shortMeaning = await evaluate(`(() => {const e=document.querySelector('#translation-english');const r=e.getBoundingClientRect();return {text:e.textContent,font:getComputedStyle(e).fontSize,width:r.width,height:r.height,scrollHeight:e.parentElement.scrollHeight,clientHeight:e.parentElement.clientHeight,overflow:getComputedStyle(e.parentElement).overflowY};})()`);
  assert.ok(shortMeaning.text.length > 15);
  assert.equal(shortMeaning.font, "18px");
  assert.equal(shortMeaning.overflow, "auto");
  const shortShot = await call("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  await writeFile(join(screenshots, "short.png"), Buffer.from(shortShot.data, "base64"));

  const longThai = "วันหยุดนี้ฉันจะเดินทางจากบ้านไปตลาดที่อยู่ไกลออกไปเพื่อซื้อผักผลไม้และอาหารหลายชนิดจากร้านเล็ก ๆ เพราะฉันต้องเตรียมอาหารให้ครอบครัวที่กำลังจะมาเยี่ยมในช่วงสุดสัปดาห์นี้ และอยากเลือกวัตถุดิบสดใหม่ในราคาที่เหมาะสม";
  const long = await enterThai(longThai);
  assert.equal(long.thai, longThai);
  assert.ok(long.words.length > 10);
  await evaluate("document.querySelector('[data-tab=meaning]').click()");
  const longMeaning = await evaluate(`(() => {const e=document.querySelector('#translation-english');const card=e.parentElement;return {text:e.textContent,font:getComputedStyle(e).fontSize,cardHeight:card.clientHeight,cardScroll:card.scrollHeight,overflow:getComputedStyle(card).overflowY,detailsVisible:!document.querySelector('.translation-details').open};})()`);
  assert.ok(longMeaning.text.length > 100, `long English translation should be present; got ${longMeaning.text.length} characters`);
  assert.equal(longMeaning.font, "18px");
  assert.equal(longMeaning.overflow, "auto");
  assert.equal(longMeaning.detailsVisible, true, "provider details stay collapsed by default");
  const longShot = await call("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  await writeFile(join(screenshots, "long.png"), Buffer.from(longShot.data, "base64"));
  await evaluate("document.querySelector('.translation-details').open=true");
  assert.ok(await evaluate("document.querySelector('#translation-source').textContent.includes('Azure Translator F0')"));
  assert.ok(await evaluate("!!document.querySelector('#translate-current')"), "manual retry remains available in translation details");
  console.log("Short passage:", JSON.stringify({ ...short, meaningLayout: shortMeaning }));
  console.log("Long passage:", JSON.stringify({ thaiLength: long.thai.length, wordCount: long.words.length, readingLength: long.reading.length, englishLength: longMeaning.text.length, meaningLayout: { ...longMeaning, text: undefined } }));
  console.log(`Hidden UI screenshots: ${screenshots}`);
} finally {
  socket?.close();
  const killer = spawn("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" });
  await new Promise(done => { killer.once("exit", done); killer.once("error", done); });
  await rm(scratch, { recursive: true, force: true, maxRetries: 8, retryDelay: 250 });
}
