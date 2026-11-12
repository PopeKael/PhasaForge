import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const root = process.cwd();
const helper = await readFile(join(root, "src", "thai-character-inspector.mjs"));
const edge = [
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
].find(path => process.getBuiltinModule("node:fs").existsSync(path));
assert.ok(edge, "Microsoft Edge is required for Thai character hover geometry verification");
const fixtures = JSON.parse(await readFile(join(root, "tests", "fixtures", "syllable-inspector.json"), "utf8"));
const fixturesSource = JSON.stringify(fixtures);

const html = `<!doctype html><meta charset="utf-8"><style>
body{margin:0;padding:32px;background:#061d22;color:white;font:64px/1.2 "Leelawadee UI","Noto Sans Thai","Segoe UI",sans-serif}
.inspector{position:relative;display:inline-block;white-space:nowrap;line-height:1.2}
.label{display:block;pointer-events:none}.overlay{position:absolute;inset:0;pointer-events:none}
.thai-character-hit-area{position:absolute;display:block;min-width:0;min-height:0;margin:0;padding:0;border:0;background:transparent;appearance:none;pointer-events:auto;cursor:help}
#tooltip{position:fixed;pointer-events:none;font:12px/1.3 sans-serif;background:#10282f;padding:6px}
</style><div id="cases"></div><div id="tooltip" hidden></div><script type="module">
import {createThaiCharacterHitAreas} from '/thai-character-inspector.mjs';
const fixtures=${fixturesSource};
const byWord=word=>fixtures.dictionaryCards.find(card=>card.word===word);
const cases=[['career',byWord('อาชีพ')],['everyone',byWord('ทุกคน')],['bird',byWord('นก')],['unseen',fixtures.unseenCompounds.find(card=>card.word==='ลูกนก')],['below',{word:'กุ',syllables:[{reading:'ku',tone:'low',spelling:'กุ'}]}],['tone',{word:'ก่',syllables:[{reading:'kà',tone:'low',spelling:'ก่'}]}]];
for(const [id,card] of cases){
 const {word,syllables}=card;
 const inspector=document.createElement('span');inspector.className='inspector';inspector.id='inspector-'+id;
 const label=document.createElement('span');label.className='label';label.id='label-'+id;label.textContent=word;
 const overlay=document.createElement('span');overlay.className='overlay';overlay.id='overlay-'+id;
 inspector.append(label,overlay);document.querySelector('#cases').append(inspector,document.createElement('br'));
 createThaiCharacterHitAreas(word,label,overlay,(target,info)=>{window.__lastHit=target;const tip=document.querySelector('#tooltip');const syllable=info?.syllableInfo;tip.textContent=syllable?'Syllable '+syllable.index+'/'+syllable.count+': '+syllable.spelling+' '+syllable.reading+' '+syllable.tone+' tone '+syllable.combined+' '+syllable.toneRule+' '+syllable.breakdown.map(part=>part.character+' '+part.name+' '+part.romanization+' '+part.explanation).join(' '):info?info.character+' '+info.name+' '+info.romanization+' '+info.explanation:'';tip.hidden=!info;},()=>{document.querySelector('#tooltip').hidden=true;},syllables);
}
window.__thaiReady=true;
</script>`;

function waitFor(fn, timeout = 30000) {
  const deadline = Date.now() + timeout;
  return new Promise((resolve, reject) => {
    const poll = async () => {
      try { const value = await fn(); if (value) return resolve(value); } catch { /* browser is starting */ }
      if (Date.now() >= deadline) return reject(new Error("Timed out waiting for Edge inspector fixture"));
      setTimeout(poll, 100);
    };
    poll();
  });
}

async function connect(url) {
  const ws = new WebSocket(url);
  await new Promise((resolve, reject) => { ws.addEventListener("open", resolve, { once: true }); ws.addEventListener("error", reject, { once: true }); });
  let id = 0;
  const pending = new Map();
  ws.addEventListener("message", event => {
    const message = JSON.parse(event.data);
    const callbacks = pending.get(message.id);
    if (!callbacks) return;
    pending.delete(message.id);
    clearTimeout(callbacks.timeout);
    message.error ? callbacks.reject(new Error(JSON.stringify(message.error))) : callbacks.resolve(message.result);
  });
  return {
    call(method, params = {}) {
      const requestId = ++id;
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => { if (pending.has(requestId)) { pending.delete(requestId); reject(new Error(`CDP timeout: ${method}`)); } }, 30000);
        pending.set(requestId, { resolve, reject, timeout });
        ws.send(JSON.stringify({ id: requestId, method, params }));
      });
    },
    close() { ws.close(); },
  };
}

test("hover hit areas select the combining vowel, consonant, below vowel, and tone mark independently", async () => {
  const server = createServer((request, response) => {
    if (new URL(request.url, "http://localhost").pathname === "/thai-character-inspector.mjs") {
      response.writeHead(200, { "content-type": "text/javascript; charset=utf-8" });
      response.end(helper);
    } else {
      response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      response.end(html);
    }
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const profile = await mkdtemp(join(tmpdir(), "phasaforge-thai-hover-"));
  const browser = spawn(edge, ["--headless=new", "--disable-gpu", "--no-first-run", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "about:blank"], { windowsHide: true, stdio: "ignore" });
  let browserCdp;
  let page;
  try {
    const activePortPath = join(profile, "DevToolsActivePort");
    const port = await waitFor(async () => (await readFile(activePortPath, "utf8")).split(/\r?\n/)[0]);
    const version = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
    browserCdp = await connect(version.webSocketDebuggerUrl);
    const target = await browserCdp.call("Target.createTarget", { url: `http://127.0.0.1:${server.address().port}/` });
    page = await waitFor(async () => {
      const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      const found = targets.find(item => item.id === target.targetId);
      return found?.webSocketDebuggerUrl && connect(found.webSocketDebuggerUrl);
    });
    await page.call("Page.enable");
    const evaluate = async expression => {
      try {
        const result = await page.call("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
        if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
        return result.result.value;
      } catch (error) {
        throw new Error(`Runtime.evaluate failed for ${expression}: ${error.message}`, { cause: error });
      }
    };
    await waitFor(async () => evaluate("window.__thaiReady === true"));

    const careerRects = await evaluate(`(() => {const rect=i=>{const e=document.querySelector('#overlay-career [data-character-index="'+i+'"]');const r=e.getBoundingClientRect();return {left:r.left,top:r.top,width:r.width,height:r.height,cx:r.left+r.width/2,cy:r.top+r.height/2};};const label=document.querySelector('#label-career');const canvas=document.createElement('canvas');const ctx=canvas.getContext('2d');ctx.font=getComputedStyle(label).font;const metrics=t=>{const m=ctx.measureText(t);return {width:m.width,ascent:m.actualBoundingBoxAscent,descent:m.actualBoundingBoxDescent,fontAscent:m.fontBoundingBoxAscent,fontDescent:m.fontBoundingBoxDescent};};const node=label.firstChild;const range=(a,b)=>{const r=document.createRange();r.setStart(node,a);r.setEnd(node,b);return [...r.getClientRects()].map(x=>({x:x.x,y:x.y,w:x.width,h:x.height}));};return {text:label.textContent,consonant:rect(2),vowel:rect(3),hits:document.querySelectorAll('#overlay-career .thai-character-hit-area').length,font:ctx.font,metrics:{base:metrics('ช'),cluster:metrics('ชี'),mark:metrics('ี')},range:{base:range(2,3),mark:range(3,4),cluster:range(2,4)},label:label.getBoundingClientRect().toJSON()};})()`);
    assert.equal(careerRects.text, "อาชีพ", "the Thai word stays in one unchanged text node");
    assert.equal(careerRects.hits, 5, "each supported code point receives its own transparent hit area");
    assert.ok(careerRects.vowel.cy < careerRects.consonant.cy, `the ี hit area must sit above ช: ${JSON.stringify(careerRects)}`);

    async function hoverAt(point) {
      return evaluate(`(() => {const target=document.elementFromPoint(${point.cx},${point.cy});target?.dispatchEvent(new MouseEvent('mouseenter'));return {target:target?.dataset.characterIndex,character:target?.dataset.thaiCharacter,tooltip:document.querySelector('#tooltip').textContent,hidden:document.querySelector('#tooltip').hidden};})()`);
    }
    const vowelHover = await hoverAt(careerRects.vowel);
    assert.equal(vowelHover.target, "3", "hovering on the visible ี mark selects the vowel hit area");
    assert.equal(vowelHover.character, "ี");
    assert.match(vowelHover.tooltip, /ชีพ chîip falling/);
    assert.match(vowelHover.tooltip, /ี สระอี sara ii/);
    assert.match(vowelHover.tooltip, /พ พ พาน pho phan Final p stop/);
    const consonantHover = await hoverAt(careerRects.consonant);
    assert.equal(consonantHover.target, "2", "hovering on ช selects the consonant hit area");
    assert.equal(consonantHover.character, "ช");
    assert.match(consonantHover.tooltip, /ชีพ chîip falling/);
    assert.match(consonantHover.tooltip, /ช ช ช้าง cho chang low-class initial/);

    const otherRects = await evaluate(`(() => {const get=(group,index)=>{const e=document.querySelector('#overlay-'+group+' [data-character-index="'+index+'"]');const r=e.getBoundingClientRect();return {cx:r.left+r.width/2,cy:r.top+r.height/2};};return {below:get('below',1),base:get('below',0),tone:get('tone',1)};})()`);
    assert.ok(otherRects.below.cy > otherRects.base.cy, "below-vowel hit area stays below its consonant");
    assert.match((await hoverAt(otherRects.below)).tooltip, /สระอุ.*sara u/);
    assert.match((await hoverAt(otherRects.tone)).tooltip, /ไม้เอก.*mai ek/);
    await evaluate("window.__lastHit.dispatchEvent(new MouseEvent('mouseleave'))");
    assert.equal(await evaluate("document.querySelector('#tooltip').hidden"), true, "tooltip disappears when the pointer leaves the mark");

    const everybodyRects = await evaluate(`(() => {const get=i=>{const e=document.querySelector('#overlay-everyone [data-character-index="'+i+'"]');const r=e.getBoundingClientRect();return {cx:r.left+r.width/2,cy:r.top+r.height/2};};return {initial:get(3),final:get(4)};})()`);
    const personInitial = await hoverAt(everybodyRects.initial);
    assert.equal(personInitial.target, "3", "hovering ค in ทุกคน selects the second syllable's initial");
    assert.equal(personInitial.character, "ค");
    assert.match(personInitial.tooltip, /Syllable 2\/2: คน kon mid tone/);
    assert.match(personInitial.tooltip, /low-class initial “kh”/);
    assert.match(personInitial.tooltip, /unwritten short \/o\/ vowel.*final \/n\//);
    const personFinal = await hoverAt(everybodyRects.final);
    assert.equal(personFinal.target, "4", "hovering น in ทุกคน selects the second syllable's final");
    assert.equal(personFinal.character, "น");
    assert.match(personFinal.tooltip, /Final nasal “n”/);

    const unseenRects = await evaluate(`(() => {const e=document.querySelector('#overlay-unseen [data-character-index="3"]');const r=e.getBoundingClientRect();return {cx:r.left+r.width/2,cy:r.top+r.height/2};})()`);
    const unseenHover = await hoverAt(unseenRects);
    assert.equal(unseenHover.character, "น");
    assert.match(unseenHover.tooltip, /Syllable 2\/2: นก nók high tone/);
    assert.match(unseenHover.tooltip, /unwritten short \/o\/ vowel.*final \/k\//);
  } finally {
    page?.close();
    browserCdp?.close();
    const killer = spawn("taskkill.exe", ["/PID", String(browser.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" });
    await new Promise(resolve => { killer.once("exit", resolve); killer.once("error", resolve); });
    await new Promise(resolve => server.close(resolve));
    await rm(profile, { recursive: true, force: true, maxRetries: 8, retryDelay: 250 });
  }
});
