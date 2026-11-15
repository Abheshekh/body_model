/* eslint-disable */
// Headless Chrome screenshot + yellow-pixel count over the DevTools protocol. Node 24 built-ins only.
// Usage: node cdp-shot.mjs <url> <out.png> <width> <height> [js] [wait-ms]
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const [url, out, wArg, hArg, js, waitArg] = process.argv.slice(2);
if (!url || !out || !wArg || !hArg) {
  console.error('usage: node cdp-shot.mjs <url> <out.png> <width> <height> [js] [wait-ms]');
  process.exit(1);
}
const W = Number(wArg), H = Number(hArg), WAIT = waitArg ? Number(waitArg) : 8000;
const PORT = 9333;
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const dir = mkdtempSync(join(tmpdir(), 'cdp-shot-'));
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
const waiters = [];
ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) {
    const { res, rej } = pending.get(msg.id);
    pending.delete(msg.id);
    msg.error ? rej(new Error(msg.error.message)) : res(msg.result);
  } else if (msg.method) {
    for (const w of waiters.splice(0)) w.method === msg.method ? w.res(msg.params) : waiters.push(w);
  }
};
const send = (method, params = {}) => new Promise((res, rej) => {
  const id = nextId++;
  pending.set(id, { res, rej });
  ws.send(JSON.stringify({ id, method, params }));
});
const once = (method) => new Promise((res) => waiters.push({ method, res }));
const evaluate = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
  return r.result.value;
};

await send('Page.enable');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: W < 900 });
const loaded = once('Page.loadEventFired');
await send('Page.navigate', { url });
await loaded;
await sleep(WAIT);

const ok = await evaluate(`!document.querySelector('.load-error') && !!document.querySelector('canvas')`);
if (!ok) await finish(2, { error: 'webgl' });
else {
  let jsResult = null;
  if (js) {
    jsResult = await evaluate(`(async () => (${js}))()`);
    await sleep(1500);
  }
  const { data } = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(out, Buffer.from(data, 'base64'));
  const counts = await evaluate(`(async () => {
    const img = new Image();
    img.src = 'data:image/png;base64,${data}';
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const g = c.getContext('2d');
    g.drawImage(img, 0, 0);
    const px = g.getImageData(0, 0, c.width, c.height).data;
    let yellow = 0, yellowVisible = 0;
    for (let y = 0; y < c.height; y += 4) for (let x = 0; x < c.width; x += 4) {
      const i = (y * c.width + x) * 4, r = px[i], gr = px[i + 1], b = px[i + 2];
      if (r > 120 && gr > 90 && b < 60 && r - b > 100) {
        yellow++;
        if (document.elementFromPoint(x, y)?.tagName === 'CANVAS') yellowVisible++;
      }
    }
    return { yellow, yellowVisible };
  })()`);
  finish(0, { png: out, ...counts, js: jsResult ?? null });
}
