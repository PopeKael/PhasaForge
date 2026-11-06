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
  PHASAFORGE_TEST_MMS_CACHE: process.env.PHASAFORGE_TEST_MMS_CACHE ?? join(root, ".cache-tts"),
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
  const output = join(root, "release-artifacts", "0.3.0", "ui-verification"); await mkdir(output, { recursive: true });
  const capture = async name => { const shot = await cdp.call("Page.captureScreenshot", { format: "png", captureBeyondViewport: false }); await writeFile(join(output, name), Buffer.from(shot.data, "base64")); };
  await capture("tauri-words-640x480.png");
  await evaluate("document.querySelector('#settings-toggle').click()");
  await waitFor(async () => (await evaluate("[...document.querySelector('#translation-model').options].some(o=>o.value==='qwen3.8-27b-ud-iq3-xxs:ctx32k')")) === true);
  const settings = await evaluate("({hidden:document.querySelector('#settings-view').hidden,scroll:document.querySelector('#settings-view').scrollHeight>document.querySelector('#settings-view').clientHeight,scrollHeight:document.querySelector('#settings-view').scrollHeight,clientHeight:document.querySelector('#settings-view').clientHeight,width:document.querySelector('#app').getBoundingClientRect().width,height:document.querySelector('#app').getBoundingClientRect().height})");
  assert.equal(settings.hidden, false); assert.equal(settings.scroll, true); assert.equal(settings.width, 640); assert.equal(settings.height, 480);
  await capture("tauri-settings-640x480.png");
  await evaluate("document.querySelector('#test-offline').click()");
  await waitFor(async () => (await evaluate("document.querySelector('#engine-test-status').textContent"))?.startsWith("Passed"));
  await evaluate("(() => {document.querySelector('#model-download-name').value='qwen3.5:4b';document.querySelector('#pull-model').click();return true;})()");
  await waitFor(async () => (await evaluate("document.querySelector('#provider-status').textContent"))?.startsWith("Ollama finished the qwen3.5:4b pull"), 60000);
  const modelPullStatus = await evaluate("document.querySelector('#provider-status').textContent");
  await evaluate("(() => {const p=document.querySelector('#translation-provider');p.value='ollama';p.dispatchEvent(new Event('change',{bubbles:true}));document.querySelector('#refresh-models').click();return true;})()");
  await waitFor(async () => (await evaluate("[...document.querySelector('#translation-model').options].some(o=>o.value==='qwen3.8-27b-ud-iq3-xxs:ctx32k')")) === true);
  await evaluate("(() => {document.querySelector('#translation-model').value='qwen3.8-27b-ud-iq3-xxs:ctx32k';document.querySelector('#test-local-translation').click();return true;})()");
  await waitFor(async () => (await evaluate("document.querySelector('#provider-status').textContent"))?.startsWith("Ran 5 local translations"), 60000);
  const references = await evaluate("[...document.querySelectorAll('.translation-test-row')].map(row=>({thai:row.querySelector('strong')?.textContent,reference:row.querySelectorAll('span')[0]?.textContent,model_output:row.querySelectorAll('span')[1]?.textContent}))");
  assert.equal(references.length, 5); assert.ok(references.every(row => row.model_output?.trim()), "all five reference translations should contain local model output");
  await evaluate("document.querySelector('#save-settings').click()");
  const unfamiliar = "แม่ใส่น้ำมันมะกอกลงในกระทะ";
  await evaluate(`(() => {const e=document.querySelector('#source-text');e.value=${JSON.stringify(unfamiliar)};e.dispatchEvent(new Event('input',{bubbles:true}));document.querySelector(".tab[data-tab='meaning']").click();return true;})()`);
  await waitFor(async () => (await evaluate("document.querySelector('#thai-focus')?.textContent")) === unfamiliar);
  const unfamiliarWords = await evaluate(`window.__TAURI_INTERNALS__.invoke('analyze_text',{text:${JSON.stringify(unfamiliar)}}).then(cards=>cards[0].words.map(w=>({word:w.word,meaning:w.meaning,reading:w.reading,source:w.source})))`);
  const oliveOil = unfamiliarWords.find(word => word.word === "น้ำมันมะกอก");
  assert.ok(oliveOil?.meaning?.toLowerCase().includes("olive oil") && oliveOil.reading, JSON.stringify(unfamiliarWords));
  await evaluate("document.querySelector(\".tab[data-tab='words']\").click();[...document.querySelectorAll('.word-chip')].find(e=>e.textContent==='น้ำมันมะกอก')?.click()");
  assert.match(await evaluate("document.querySelector('#word-details').innerText"), /olive oil/i);
  await evaluate("document.querySelector(\".tab[data-tab='meaning']\").click()");
  await evaluate("document.querySelector('#translate-current').click()");
  await waitFor(async () => (await evaluate("document.querySelector('#translation-status').textContent"))?.startsWith("Local model output shown"), 60000);
  const unfamiliarTranslation = await evaluate("({thai:document.querySelector('#thai-focus').textContent,meaning:document.querySelector('#meaning-line').textContent,source:document.querySelector('#translation-source').textContent})");
  assert.ok(unfamiliarTranslation.meaning.length > 20 && unfamiliarTranslation.source.includes("qwen3.8-27b-ud-iq3-xxs:ctx32k"));
  const speech = await evaluate("window.__TAURI_INTERNALS__.invoke('synthesize_mms_thai',{text:'สวัสดีครับ วันนี้อากาศดี'}).then(b=>{const u=Uint8Array.from(b),v=new DataView(u.buffer);let peak=0;for(let i=44;i+1<u.length;i+=2)peak=Math.max(peak,Math.abs(v.getInt16(i,true)));return{length:b.length,header:String.fromCharCode(...b.slice(0,4)),rate:v.getUint32(24,true),peak};})");
  assert.ok(speech.length > 20_000 && speech.header === "RIFF" && speech.rate === 16000 && speech.peak > 0, JSON.stringify(speech));
  const wordSpeech = await evaluate("window.__TAURI_INTERNALS__.invoke('synthesize_mms_thai',{text:'น้ำมันมะกอก'}).then(b=>{const u=Uint8Array.from(b),v=new DataView(u.buffer);let peak=0;for(let i=44;i+1<u.length;i+=2)peak=Math.max(peak,Math.abs(v.getInt16(i,true)));return{length:b.length,header:String.fromCharCode(...b.slice(0,4)),rate:v.getUint32(24,true),peak};})");
  assert.ok(wordSpeech.length > 5_000 && wordSpeech.header === "RIFF" && wordSpeech.rate === 16000 && wordSpeech.peak > 0, JSON.stringify(wordSpeech));
  const wordPlayButton = await evaluate("[...document.querySelectorAll('#word-details button')].some(button=>button.textContent.includes('Play Thai word'))");
  assert.equal(wordPlayButton, true);
  await evaluate("(() => {document.querySelector('#native-speech-audio').muted=true;document.querySelector('#word-details button').click();return true;})()");
  await waitFor(async () => (await evaluate("document.querySelector('#voice-note').textContent"))?.startsWith("Playing generated local MMS Thai speech"), 60000);
  const mutedPlayback = await evaluate("({paused:document.querySelector('#native-speech-audio').paused,muted:document.querySelector('#native-speech-audio').muted})");
  assert.equal(mutedPlayback.paused, false); assert.equal(mutedPlayback.muted, true);
  await evaluate("document.querySelector('#native-speech-audio').pause()");
  const diagnosticLog = await findFile(testAppData, "hotkey.log");
  assert.ok(diagnosticLog, `startup should write the privacy-safe diagnostic log under app data; found files: ${JSON.stringify(await listFiles(scratch))}`);
  const diagnosticText = await readFile(diagnosticLog, "utf8");
  assert.ok(diagnosticText.includes("app.start version=0.3.0"));
  assert.doesNotMatch(diagnosticText, new RegExp(sample));
  await capture("tauri-translation-640x480.png");
  console.log(JSON.stringify({ size: "640×480", sample: analysis, clickedWord: word, engineTest: await evaluate("document.querySelector('#engine-test-status').textContent"), modelPullStatus, references, unfamiliarTranslation, localSpeech: speech, localWordSpeech: wordSpeech, wordPlayButton, mutedPlayback, settings, installedThaiWinRtVoices: voices.length, voiceUi, diagnosticLog, screenshots: output }, null, 2));
} finally {
  cdp?.close();
  const killer = spawn("taskkill.exe", ["/PID", String(processUnderTest.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" });
  await new Promise(done => { killer.once("exit", done); killer.once("error", done); });
  await rm(scratch, { recursive: true, force: true, maxRetries: 8, retryDelay: 250 });
}
