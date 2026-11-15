/* eslint-disable */
// Takes the 10 R1 contact sheets (2 sexes × 5 depths) with headless Chrome over the DevTools protocol. Node built-ins only.
// Needs Vite on the repo root: npx vite --port 5190 --strictPort
// Usage: node tools/pipeline/v5/contact/shoot.mjs [base-url] [out-dir]
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const BASE = process.argv[2] || 'http://localhost:5190';
const OUT = process.argv[3] || 'docs/reports/r1';
const W = 1600, H = 800, PORT = 9334, TIMEOUT = 60000;
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const SEXES = ['male', 'female'], DEPTHS = ['skin', 'outer', 'intermediate', 'deep', 'bones'];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

mkdirSync(OUT, { recursive: true });
const dir = mkdtempSync(join(tmpdir(), 'r1-shoot-'));
const chrome = spawn(CHROME, [
  '--headless=new', `--remote-debugging-port=${PORT}`, '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
  '--hide-scrollbars', `--window-size=${W},${H}`, `--user-data-dir=${dir}`, 'about:blank',
], { stdio: 'ignore' });

function finish(code, line) {
  if (line) console.log(JSON.stringify(line));
  chrome.kill('SIGKILL');
  setTimeout(() => { try { rmSync(dir, { recursive: true, force: true }); } catch {} process.exit(code); }, 300);
  return new Promise(() => {}); // never resolves: callers await it to stop here
}

let ready = false;
for (let i = 0; i < 100 && !ready; i++) {
  try { ready = (await fetch(`http://127.0.0.1:${PORT}/json/version`)).ok; } catch { await sleep(100); }
}
if (!ready) await finish(1, { error: 'chrome did not start' });

const target = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' })).json();
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
let nextId = 1;
const pending = new Map();
const errors = [];
ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) {
    const { res, rej } = pending.get(msg.id);
    pending.delete(msg.id);
    msg.error ? rej(new Error(msg.error.message)) : res(msg.result);
  } else if (msg.method === 'Runtime.exceptionThrown') {
    errors.push(msg.params.exceptionDetails.exception?.description ?? msg.params.exceptionDetails.text);
  }
};
const send = (method, params = {}) => new Promise((res, rej) => {
  const id = nextId++;
  pending.set(id, { res, rej });
  ws.send(JSON.stringify({ id, method, params }));
});
const evaluate = async (expression) => (await send('Runtime.evaluate', { expression, returnByValue: true })).result.value;

await send('Page.enable');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });

for (const sex of SEXES) for (const depth of DEPTHS) {
  const t0 = Date.now();
  errors.length = 0;
  await send('Page.navigate', { url: `${BASE}/tools/pipeline/v5/contact/sheet.html?sex=${sex}&depth=${depth}` });
  await sleep(500);
  while (!(await evaluate('window.sheetReady === true'))) {
    if (errors.length || Date.now() - t0 > TIMEOUT) await finish(2, { error: 'sheet not ready', sex, depth, errors });
    await sleep(250);
  }
  const { data } = await send('Page.captureScreenshot', { format: 'png' });
  const png = join(OUT, `sheet-${sex}-${depth}.png`);
  writeFileSync(png, Buffer.from(data, 'base64'));
  console.log(JSON.stringify({ png, ms: Date.now() - t0 }));
}
await finish(0);
