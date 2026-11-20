/* eslint-disable */
// Phone layout check (R5 T13): opens library, player, editor and task builder at 390x844, sheet collapsed and open.
//   node --experimental-websocket tools/library/layout.mjs   (dev server on 5300: npx vite --port 5300)
// Passes ("layout ok") when the sheet is <= 45% of the height and the body is not under it. The body's box is measured from a
// screenshot taken with the sheet hidden: pixels that are not the dark teal stage (red above green, or near white) above the tab bar (y < 790).
// ponytail: colour heuristic (bar plates and shadow are dark, so they do not count); a viewer hook would be exact.
import { launch, sleep } from './cdp.mjs';

const H = 844, MAX = 0.45 * H;
const routes = [['library', 'workouts/exercises'], ['player', 'workouts/exercises/barbell-curl'], ['editor', 'workouts/edit/exercises/bench-press'], ['builder', 'workouts/tasks']];
const c = await launch(9337);
await c.open('male');
const bodyBox = (b64) => c.evaluate(`(async () => {
  const img = new Image(); img.src = 'data:image/png;base64,${b64}'; await img.decode();
  const cv = document.createElement('canvas'); cv.width = img.width; cv.height = img.height;
  const x = cv.getContext('2d'); x.drawImage(img, 0, 0); const d = x.getImageData(0, 0, cv.width, cv.height).data;
  let top = 1e9, bottom = -1, n = 0;
  for (let y = 0; y < Math.min(cv.height, 790); y++) for (let i = 0; i < cv.width; i++) { const o = (y * cv.width + i) * 4, r = d[o], g = d[o + 1], b = d[o + 2];
    if ((r > g + 8 && r > 90) || (r > 150 && g > 150 && b > 150)) { n++; if (y < top) top = y; if (y > bottom) bottom = y; } }
  return { top, bottom, n }; })()`);
let bad = 0;
for (const [name, hash] of routes) {
  await c.evaluate(`location.hash = '#${hash}'`);
  await sleep(500);
  await c.waitFor(`!!document.querySelector('.sheet') && !/Loading/.test(document.querySelector('.sheet').textContent) && document.querySelectorAll('.sheet button, .sheet a').length > 1`, 15000);
  await sleep(2500);
  for (const state of ['collapsed', 'open']) {
    if (state === 'open') {
      const h = await c.evaluate(`(() => { const b = document.querySelector('.sheet-handle'); if (b && !b.closest('.sheet').classList.contains('open')) b.click(); return !!b; })()`);
      await sleep(4000);
      if (!h) { console.log(`${name} open: no handle (sheet is always the same size)`); }
    }
    const r = await c.evaluate(`(() => { const s = document.querySelector('.sheet').getBoundingClientRect(); return { top: s.top, height: s.height }; })()`);
    await c.evaluate(`document.querySelector('.sheet').style.visibility = 'hidden'`);
    await sleep(300);
    const box = await bodyBox((await c.png()).toString('base64'));
    await c.evaluate(`document.querySelector('.sheet').style.visibility = ''`);
    const ok = (state === 'collapsed' || r.height <= MAX + 0.5) && box.n > 500 && box.bottom <= r.top + 2;
    console.log(`${name} ${state}: sheet ${Math.round(r.height)} px (${(100 * r.height / H).toFixed(1)}%), body ${box.top}..${box.bottom} px of ${Math.round(r.top)} px sheet top, ${box.n} px ${ok ? 'ok' : 'FAIL'}`);
    if (!ok) bad++;
  }
}
if (c.errors.length) console.log('console:', [...new Set(c.errors)]);
console.log(bad ? `layout FAIL (${bad})` : 'layout ok');
c.done(bad ? 1 : 0);
