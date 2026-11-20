/* eslint-disable */
// Equipment contact sheets: drives headless Chrome over the DevTools protocol against the dev server (npx vite --port 5300).
//   node --experimental-websocket tools/library/sheet.mjs
// One tile per item of public/data/equipment.json, three views each (front, three-quarter, close-up); `items` go to
// docs/reports/r5/equipment-gym.png, `objects` to docs/reports/r5/equipment-objects.png. Prints "tiles: N of N".
import { spawn } from 'node:child_process';
import { readFileSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const BASE = 'http://localhost:5300/tools/library/sheet.html';
const PORT = 9335;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const eq = JSON.parse(readFileSync('public/data/equipment.json', 'utf8'));
const dir = mkdtempSync(join(tmpdir(), 'sheet-'));
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--headless=new', `--remote-debugging-port=${PORT}`, '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
  '--hide-scrollbars', `--user-data-dir=${dir}`, 'about:blank'], { stdio: 'ignore' });
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
  else if (m.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(m.params.type)) errors.push(`console.${m.params.type}: ${m.params.args.map((a) => a.value ?? a.description).join(' ')}`);
};
const send = (method, params = {}) => new Promise((res, rej) => { const id = nextId++; pending.set(id, { res, rej }); ws.send(JSON.stringify({ id, method, params })); });
const evaluate = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
  return r.result.value;
};
for (const d of ['Page', 'Runtime']) await send(`${d}.enable`);

mkdirSync('docs/reports/r5', { recursive: true });
let rendered = 0, expected = 0;
for (const [set, list, out] of [['gym', eq.items, 'equipment-gym.png'], ['objects', eq.objects, 'equipment-objects.png']]) {
  expected += list.length;
  const loaded = new Promise((r) => { loadWaiter = r; });
  await send('Page.navigate', { url: `${BASE}?set=${set}` });
  await loaded;
  let sheet = null;
  for (let t = 0; t < 180000 && !sheet; t += 200) { sheet = await evaluate('window.__sheet ?? null'); if (!sheet) await sleep(200); }
  if (!sheet) { console.log(`${set}: sheet did not finish`, errors); done(2); }
  await send('Emulation.setDeviceMetricsOverride', { width: sheet.w, height: sheet.h, deviceScaleFactor: 1, mobile: false });
  await sleep(500);
  writeFileSync(`docs/reports/r5/${out}`, Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
  console.log(`${out}: ${sheet.ok} of ${sheet.total}`, sheet.bad.length ? sheet.bad : '');
  rendered += sheet.ok;
}
if (errors.length) console.log('console:', [...new Set(errors)]);
console.log(`tiles: ${rendered} of ${expected}`);
done(rendered === expected ? 0 : 1);
