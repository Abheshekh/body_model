/* eslint-disable */
// Drives headless Chrome over the DevTools protocol against the dev server (npx vite --port 5300).
//   node --experimental-websocket tools/engine/shots.mjs [male|female]   opens every exercise and task variant, prints "opened N of M" and console errors
//   node --experimental-websocket tools/engine/shots.mjs --shot <sex> <route> <out.png> [js]   one 390x844 screenshot of #<route> (js runs first)
import { spawn } from 'node:child_process';
import { readFileSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const args = process.argv.slice(2);
const shot = args[0] === '--shot';
const sex = (shot ? args[1] : args[0]) ?? 'male';
const BASE = 'http://localhost:5300/';
const PORT = 9334;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const dir = mkdtempSync(join(tmpdir(), 'shots-'));
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--headless=new', `--remote-debugging-port=${PORT}`, '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
  '--hide-scrollbars', '--window-size=390,844', `--user-data-dir=${dir}`, 'about:blank'], { stdio: 'ignore' });
const done = (code) => { chrome.kill('SIGKILL'); setTimeout(() => { try { rmSync(dir, { recursive: true, force: true }); } catch {} process.exit(code); }, 300); };

for (let i = 0; i < 100; i++) { try { if ((await fetch(`http://127.0.0.1:${PORT}/json/version`)).ok) break; } catch { await sleep(100); } }
const target = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' })).json();
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
let nextId = 1; const pending = new Map(); const errors = []; let loadWaiter = null;
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { const { res, rej } = pending.get(m.id); pending.delete(m.id); m.error ? rej(new Error(m.error.message)) : res(m.result); }
  else if (m.method === 'Page.loadEventFired') loadWaiter?.();
  else if (m.method === 'Runtime.exceptionThrown') errors.push(`exception: ${m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text}`);
  else if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push(`console.error: ${m.params.args.map((a) => a.value ?? a.description).join(' ')}`);
  else if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error' && !/favicon/.test(m.params.entry.url ?? '')) errors.push(`log: ${m.params.entry.text} ${m.params.entry.url ?? ''}`);
};
const send = (method, params = {}) => new Promise((res, rej) => { const id = nextId++; pending.set(id, { res, rej }); ws.send(JSON.stringify({ id, method, params })); });
const evaluate = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
  return r.result.value;
};
for (const d of ['Page', 'Runtime', 'Log']) await send(`${d}.enable`);
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
const loaded = new Promise((r) => { loadWaiter = r; });
await send('Page.navigate', { url: `${BASE}?seed=${sex}&adult=1&sex=${sex}&depth=outer#workouts` });
await loaded;
const waitFor = async (js, ms = 20000) => { for (let t = 0; t < ms; t += 100) { if (await evaluate(js)) return true; await sleep(100); } return false; };
if (!(await waitFor(`!!document.querySelector('canvas') && !document.querySelector('.load-error')`))) { console.log('webgl/app did not start', errors); done(2); }
await sleep(3000);

if (shot) {
  await evaluate(`location.hash = ${JSON.stringify('#' + args[2])}`);
  await waitFor(`!!document.querySelector('.sheet') && !/Loading/.test(document.querySelector('.sheet').textContent)`);
  await sleep(2500);
  if (args[4]) { await evaluate(`(async () => (${args[4]}))()`); await sleep(1500); }
  writeFileSync(args[3], Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
  console.log(args[3], errors.length ? errors : 'no console errors');
  done(0);
} else {
  const read = (f) => JSON.parse(readFileSync(`public/data/${f}`, 'utf8'));
  const jobs = [['exercises', read('exercises.json').exercises], ['tasks', read('tasks.json').tasks]]
    .flatMap(([kind, list]) => list.flatMap((e) => e.variants.map((v) => ({ kind, e, v }))));
  let ok = 0;
  for (const { kind, e, v } of jobs) {
    const before = errors.length;
    await evaluate(`location.hash = '#workouts/${kind}/${e.id}/${v.id}'`);
    await sleep(500);
    const opened = await waitFor(`(() => { const s = document.querySelector('.sheet.player'); return !!s && s.querySelector('h1')?.textContent === ${JSON.stringify(e.name)} && (!s.querySelector('#player-variant') || s.querySelector('#player-variant').value === ${JSON.stringify(v.id)}) && !/Loading|could not be loaded|^No /.test(s.textContent) && s.querySelectorAll('.effort-rows li').length > 0; })()`, 8000);
    await sleep(300); console.log(`${kind}/${e.id}/${v.id} ${opened}`);
    if (opened && errors.length === before) ok++;
    else console.log(`FAIL ${kind}/${e.id}/${v.id}: opened=${opened}`, errors.slice(before));
  }
  console.log(`opened ${ok} of ${jobs.length}`);
  if (errors.length) console.log('console errors:', errors);
  done(ok === jobs.length ? 0 : 1);
}
