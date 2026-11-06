import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, mkdir, writeFile, rm } from "node:fs/promises";
import { extname, join, resolve, sep } from "node:path";
import { tmpdir } from "node:os";

const root = resolve(".");
const dist = join(root, "dist");
const edge = [
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
].find(path => { try { return requireExists(path); } catch { return false; } });
function requireExists(path) { return process.getBuiltinModule("node:fs").existsSync(path); }
assert.ok(edge, "Microsoft Edge is required for the hidden WebView layout check");

const mime = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".svg": "image/svg+xml" };
const server = createServer(async (req, res) => {
  try {
    const relative = decodeURIComponent(new URL(req.url, "http://127.0.0.1").pathname).replace(/^\/+/, "");
    const file = resolve(dist, relative || "index.html");
    assert.ok(file === dist || file.startsWith(dist + sep), "request path escaped dist");
    const bytes = await readFile(file);
    res.writeHead(200, { "content-type": mime[extname(file)] ?? "application/octet-stream" });
    res.end(bytes);
  } catch { res.writeHead(404); res.end("Not found"); }
});
await new Promise(resolveListen => server.listen(0, "127.0.0.1", resolveListen));
const url = `http://127.0.0.1:${server.address().port}/`;
const profile = await mkdtemp(join(tmpdir(), "phasaforge-edge-"));
const browser = spawn(edge, ["--headless=new", "--disable-gpu", "--no-first-run", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "about:blank"], { windowsHide: true, stdio: "ignore" });
let page;

async function waitFor(fn, timeout = 15000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    try { const result = await fn(); if (result) return result; } catch { /* browser is starting */ }
    await new Promise(r => setTimeout(r, 100));
  }
  throw new Error("Timed out waiting for headless Edge");
}
async function connect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  await new Promise((yes, no) => { ws.addEventListener("open", yes, { once: true }); ws.addEventListener("error", no, { once: true }); });
  let nextId = 0;
  const pending = new Map();
  ws.addEventListener("message", e => {
    const message = JSON.parse(e.data);
    if (!message.id) return;
    const waiter = pending.get(message.id);
    if (waiter) { pending.delete(message.id); message.error ? waiter.reject(new Error(JSON.stringify(message.error))) : waiter.resolve(message.result); }
  });
  return {
    call(method, params = {}) {
      const id = ++nextId;
      return new Promise((resolveCall, rejectCall) => {
        pending.set(id, { resolve: resolveCall, reject: rejectCall });
        ws.send(JSON.stringify({ id, method, params }));
        setTimeout(() => { if (pending.has(id)) { pending.delete(id); rejectCall(new Error(`CDP timeout: ${method}`)); } }, 10000);
      });
    }, close() { ws.close(); },
  };
}

try {
  const portFile = join(profile, "DevToolsActivePort");
  const port = await waitFor(async () => (await readFile(portFile, "utf8")).split(/\r?\n/)[0]);
  const version = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
  const browserCdp = await connect(version.webSocketDebuggerUrl);
  const target = await browserCdp.call("Target.createTarget", { url });
  browserCdp.close();
  page = await waitFor(async () => {
    const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    const match = targets.find(item => item.id === target.targetId);
    return match?.webSocketDebuggerUrl && connect(match.webSocketDebuggerUrl);
  });
  await page.call("Page.enable");
  await page.call("Emulation.setDeviceMetricsOverride", { width: 640, height: 480, deviceScaleFactor: 1, mobile: false });
  const evaluate = async expression => {
    const out = await page.call("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (out.exceptionDetails) throw new Error(out.exceptionDetails.exception?.description ?? out.exceptionDetails.text);
    return out.result.value;
  };
  await waitFor(async () => await evaluate("document.readyState === 'complete' && document.querySelector('#app') !== null"));
  const home = await evaluate("({width:innerWidth,height:innerHeight,app:document.querySelector('#app').getBoundingClientRect().toJSON(),tab:document.querySelector('.tab.active').textContent.trim(),characters:!!document.querySelector('#characters-view')})");
  assert.equal(home.width, 640); assert.equal(home.height, 480); assert.equal(home.tab, "Words");
  assert.equal(home.characters, false, "the retired Characters panel must not remain in the UI");
  assert.ok(Math.abs(home.app.width - 640) < 1 && Math.abs(home.app.height - 480) < 1, "app shell should fit the 640×480 viewport");
  const out = join(root, "release-artifacts", "0.2.0", "ui-verification"); await mkdir(out, { recursive: true });
  const capture = async name => { const shot = await page.call("Page.captureScreenshot", { format: "png", captureBeyondViewport: false }); await writeFile(join(out, name), Buffer.from(shot.data, "base64")); };
  await capture("words-640x480.png");
  const settings = await evaluate("document.querySelector('#settings-toggle').click(); ({hidden:document.querySelector('#settings-view').hidden,scrollHeight:document.querySelector('#settings-view').scrollHeight,clientHeight:document.querySelector('#settings-view').clientHeight,provider:!!document.querySelector('#translation-provider'),test:!!document.querySelector('#test-offline')})");
  assert.equal(settings.hidden, false); assert.ok(settings.scrollHeight > settings.clientHeight, "Settings must scroll inside the fixed window"); assert.ok(settings.provider && settings.test);
  await capture("settings-640x480.png");
  console.log(JSON.stringify({ viewport: "640×480", home, settings: { scrollHeight: settings.scrollHeight, clientHeight: settings.clientHeight, provider: settings.provider, offlineTest: settings.test }, screenshots: out }, null, 2));
  page.close();
} finally {
  page?.close();
  const killer = spawn("taskkill.exe", ["/PID", String(browser.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" });
  await new Promise(resolveKill => { killer.once("exit", resolveKill); killer.once("error", resolveKill); });
  await new Promise(resolveServer => server.close(resolveServer));
  await rm(profile, { recursive: true, force: true, maxRetries: 8, retryDelay: 250 });
}
