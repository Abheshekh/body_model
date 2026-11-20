/* eslint-disable */
// Headless Chrome over the DevTools protocol (shared by contact.mjs and layout.mjs; same recipe as tools/engine/shots.mjs).
// Needs `node --experimental-websocket` and the dev server on port 5300 (npx vite --port 5300).
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export async function launch(port, { width = 390, height = 844 } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'cdp-'));
  const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
    '--headless=new', `--remote-debugging-port=${port}`, '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--hide-scrollbars', `--window-size=${width},${height}`, `--user-data-dir=${dir}`, 'about:blank'], { stdio: 'ignore' });
  const done = (code) => { chrome.kill('SIGKILL'); setTimeout(() => { try { rmSync(dir, { recursive: true, force: true }); } catch {} process.exit(code); }, 300); };
  for (let i = 0; i < 100; i++) { try { if ((await fetch(`http://127.0.0.1:${port}/json/version`)).ok) break; } catch { await sleep(100); } }
  const target = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json();
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  let nextId = 1, loadWaiter = null; const pending = new Map(); const errors = [];
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { const { res, rej } = pending.get(m.id); pending.delete(m.id); m.error ? rej(new Error(m.error.message)) : res(m.result); }
    else if (m.method === 'Page.loadEventFired') loadWaiter?.();
    else if (m.method === 'Runtime.exceptionThrown') errors.push(`exception: ${m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text}`);
    else if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push(`console.error: ${m.params.args.map((a) => a.value ?? a.description).join(' ')}`);
  };
  const send = (method, params = {}) => new Promise((res, rej) => { const id = nextId++; pending.set(id, { res, rej }); ws.send(JSON.stringify({ id, method, params })); });
  const evaluate = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
    return r.result.value;
  };
  const waitFor = async (js, ms = 20000) => { for (let t = 0; t < ms; t += 100) { if (await evaluate(js)) return true; await sleep(100); } return false; };
  for (const d of ['Page', 'Runtime']) await send(`${d}.enable`);
  const metrics = (w, h, mobile = true) => send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile });
  await metrics(width, height);
  /** load the app for one sex and wait until the canvas is up */
  const open = async (sex, hash = 'workouts') => {
    const loaded = new Promise((r) => { loadWaiter = r; });
    await send('Page.navigate', { url: `http://localhost:5300/?seed=${sex}&adult=1&sex=${sex}&depth=outer#${hash}` });
    await loaded;
    if (!(await waitFor(`!!document.querySelector('canvas') && !document.querySelector('.load-error')`))) { console.log('webgl/app did not start', errors); done(2); }
    await sleep(3000);
  };
  /** PNG as a Buffer; clip = { x, y, width, height } optional */
  const png = async (clip) => Buffer.from((await send('Page.captureScreenshot', { format: 'png', ...(clip ? { clip: { ...clip, scale: 1 } } : {}) })).data, 'base64');
  return { send, evaluate, waitFor, errors, metrics, open, png, done };
}
