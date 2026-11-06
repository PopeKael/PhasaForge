import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

// Runs against a separate invisible Tauri window and isolated app-data identity.
const root = resolve(".");
const scratch = await mkdtemp(join(tmpdir(), "phasaforge-layout-ui-"));
const screenshots = join(root, "release-artifacts", "0.3.4", "ui-check");
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
    return {viewport:[innerWidth,innerHeight],app:[app.width,app.height],source:rect('.source-panel'),audio:rect('.audio-panel'),focus:rect('.focus-panel'),meaning:rect('#meaning-view'),sourceStyle:style('#source-text'),thaiStyle:style('#thai-focus'),romanStyle:style('#romanization'),summaryStyle:style('#meaning-line'),meaningStyle:style('#translation-english'),buttons:['#play-selection','#play-current','#stop-speech'].map(s=>rect(s)),controls:['#play-selection','#play-current','#stop-speech','#speed'].map(s=>!!document.querySelector(s))};
  })()`);
  assert.deepEqual(layout.viewport, [640, 480]);
  assert.deepEqual(layout.app, [640, 480]);
  assert.equal(layout.source.height, 101, "Selected Text is 15 px shorter than 0.3.2");
  assert.equal(layout.focus.height, 133, "Current Sentence receives the 15 px recovered from Selected Text");
  assert.equal(layout.controls.every(Boolean), true, "all speech controls and the speed slider remain available");
  assert.equal(layout.sourceStyle.fontSize, "15px");
  assert.equal(layout.thaiStyle.fontSize, "22px", "Thai sentence text is 2 pt larger than 0.3.3");
  assert.equal(layout.romanStyle.whiteSpace, "normal");
  assert.equal(layout.romanStyle.fontSize, "13px");
  assert.equal(layout.summaryStyle.fontSize, "14px");
  assert.equal(layout.meaningStyle.fontSize, "18px");
  assert.ok(layout.buttons[0].width > 0 && layout.buttons[1].width > 0 && layout.buttons[2].width > 0);
  assert.ok(layout.buttons[0].x + layout.buttons[0].width <= layout.buttons[1].x, "Play and Current Sentence buttons do not overlap");
  assert.ok(layout.buttons[1].x + layout.buttons[1].width <= layout.buttons[2].x, "Current Sentence and Stop buttons do not overlap");
  assert.ok(layout.buttons[0].height <= 26 && layout.buttons[1].height <= 26, "Play buttons stay compact beside Stop");
  assert.ok(layout.buttons.every(button => button.x >= layout.audio.x && button.x + button.width <= layout.audio.x + layout.audio.width), "speech buttons stay inside the audio panel");
  assert.ok(layout.source.y + layout.source.height <= layout.focus.y, "top and sentence panels do not overlap");
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
  const groups = await evaluate(`(() => {
    const ids=[...new Set([...document.querySelectorAll('.linked-syllable-chunk')].map(e=>e.dataset.syllableGroup))];
    return ids.map(id=>({id,thai:[...document.querySelectorAll('#thai-focus .linked-syllable-chunk')].filter(e=>e.dataset.syllableGroup===id).length,roman:[...document.querySelectorAll('#romanization .linked-syllable-chunk')].filter(e=>e.dataset.syllableGroup===id).length,syllableCount:Number(document.querySelector('#thai-focus [data-syllable-group="'+id+'"]').dataset.syllableCount),thaiText:document.querySelector('#thai-focus [data-syllable-group="'+id+'"]').textContent,romanText:document.querySelector('#romanization [data-syllable-group="'+id+'"]').textContent}));
  })()`);
  assert.ok(groups.length > 4, "existing Thai word/readings form paired chunks");
  assert.ok(groups.every(group => group.thai === 1 && group.roman === 1 && group.thaiText && group.romanText), "each linked group has exactly one Thai and one romanized chunk");
  assert.ok(groups.some(group => group.syllableCount > 1), "multi-syllable words remain grouped using the dictionary syllable data");
  const hoverGroup = (groups.find(group => group.syllableCount > 1) ?? groups[0]).id;
  for (const direction of ["thai", "roman"]) {
    const hover = await evaluate(`(() => {
      const group=${JSON.stringify(hoverGroup)};
      const thai=document.querySelector('#thai-focus [data-syllable-group="'+group+'"]');
      const roman=document.querySelector('#romanization [data-syllable-group="'+group+'"]');
      const target=${JSON.stringify(direction)}==='thai'?thai:roman;
      const before=[thai.getBoundingClientRect(),roman.getBoundingClientRect()].map(r=>[r.x,r.y,r.width,r.height]);
      target.dispatchEvent(new MouseEvent('mouseenter'));
      const highlighted=thai.classList.contains('syllable-highlight')&&roman.classList.contains('syllable-highlight');
      const markerColor=getComputedStyle(thai).backgroundColor;
      const markerShadow=getComputedStyle(thai).boxShadow;
      const after=[thai.getBoundingClientRect(),roman.getBoundingClientRect()].map(r=>[r.x,r.y,r.width,r.height]);
      return {highlighted,markerColor,markerShadow,before,after};
    })()`);
    assert.equal(hover.highlighted, true, `hovering ${direction} highlights both corresponding chunks`);
    assert.match(hover.markerColor, /255, 222, 92/, "highlight uses the soft yellow marker color");
    assert.notEqual(hover.markerShadow, "none", "marker underline is visible");
    assert.deepEqual(hover.after, hover.before, "highlighting does not shift layout");
    const screenshot = await call("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
    await writeFile(join(screenshots, `hover-${direction}.png`), Buffer.from(screenshot.data, "base64"));
    const cleared = await evaluate(`(() => {const group=${JSON.stringify(hoverGroup)};const target=document.querySelector('#${direction === "thai" ? "thai-focus" : "romanization"} [data-syllable-group="'+group+'"]');target.dispatchEvent(new MouseEvent('mouseleave'));return !document.querySelector('#thai-focus [data-syllable-group="'+group+'"]').classList.contains('syllable-highlight')&&!document.querySelector('#romanization [data-syllable-group="'+group+'"]').classList.contains('syllable-highlight');})()`);
    assert.equal(cleared, true, `leaving ${direction} clears both highlights`);
  }
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
  const longGroups = await evaluate(`(() => {const ids=[...new Set([...document.querySelectorAll('.linked-syllable-chunk')].map(e=>e.dataset.syllableGroup))];return ids.map(id=>[...document.querySelectorAll('.linked-syllable-chunk')].filter(e=>e.dataset.syllableGroup===id).length);})()`);
  assert.ok(longGroups.length > 10 && longGroups.every(count => count === 2), "long passage retains one-to-one paired chunks where dictionary alignment exists");
  const longHover = await evaluate(`(() => {const thai=document.querySelector('#thai-focus .linked-syllable-chunk');const group=thai.dataset.syllableGroup;const roman=document.querySelector('#romanization [data-syllable-group="'+group+'"]');thai.dispatchEvent(new MouseEvent('mouseenter'));const matched=thai.classList.contains('syllable-highlight')&&roman?.classList.contains('syllable-highlight');thai.dispatchEvent(new MouseEvent('mouseleave'));return Boolean(matched)&&!thai.classList.contains('syllable-highlight')&&!roman?.classList.contains('syllable-highlight');})()`);
  assert.equal(longHover, true, "long passage chunks also highlight and clear their matching pronunciation");
  const focusScroll = await evaluate(`(() => {const e=document.querySelector('.focus-details');return {client:e.clientHeight,scroll:e.scrollHeight,overflow:getComputedStyle(e).overflowY};})()`);
  assert.equal(focusScroll.overflow, "auto");
  assert.ok(focusScroll.scroll > focusScroll.client, "long Thai and pronunciation remain available in the sentence panel scroll area");
  await evaluate("document.querySelector('[data-tab=meaning]').click()");
  const longMeaning = await evaluate(`(() => {const e=document.querySelector('#translation-english');const card=e.parentElement;return {text:e.textContent,font:getComputedStyle(e).fontSize,cardHeight:card.clientHeight,cardScroll:card.scrollHeight,overflow:getComputedStyle(card).overflowY,detailsVisible:!document.querySelector('.translation-details').open};})()`);
  assert.ok(longMeaning.text.length > 100, `long English translation should be present; got ${longMeaning.text.length} characters`);
  assert.equal(longMeaning.cardHeight, 63, "Meaning translation card retains the 0.3.2 content height");
  assert.equal(longMeaning.font, "18px");
  assert.equal(longMeaning.overflow, "auto");
  assert.equal(longMeaning.detailsVisible, true, "provider details stay collapsed by default");
  const longShot = await call("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  await writeFile(join(screenshots, "long.png"), Buffer.from(longShot.data, "base64"));
  await evaluate("document.querySelector('.translation-details').open=true");
  assert.ok(await evaluate("document.querySelector('#translation-source').textContent.includes('Azure Translator F0')"));
  assert.ok(await evaluate("!!document.querySelector('#translate-current')"), "manual retry remains available in translation details");
  console.log("Short passage:", JSON.stringify({ ...short, meaningLayout: shortMeaning }));
  console.log("Long passage:", JSON.stringify({ thaiLength: long.thai.length, wordCount: long.words.length, readingLength: long.reading.length, englishLength: longMeaning.text.length, focusScroll, meaningLayout: { ...longMeaning, text: undefined } }));
  console.log(`Hidden UI screenshots: ${screenshots}`);
} finally {
  socket?.close();
  const killer = spawn("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" });
  await new Promise(done => { killer.once("exit", done); killer.once("error", done); });
  await rm(scratch, { recursive: true, force: true, maxRetries: 8, retryDelay: 250 });
}
