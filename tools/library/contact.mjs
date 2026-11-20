/* eslint-disable */
// Contact sheets of all exercise records at the mid pose, one per sex: docs/reports/r5/contact-male.png and contact-female.png.
//   node --experimental-websocket tools/library/contact.mjs [--tiles <dir>]   (dev server on 5300: npx vite --port 5300)
// Opens each record in the player, pauses at 50%, crops the body area above the sheet, tiles them in a Chrome-rendered grid.
// --tiles <dir> also keeps every tile as <dir>/<sex>-<id>.png. Prints "tiles: N of M".
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { launch, sleep } from './cdp.mjs';

const recs = JSON.parse(readFileSync('public/data/exercises.json', 'utf8')).exercises;
const keep = process.argv.includes('--tiles') ? process.argv[process.argv.indexOf('--tiles') + 1] : null;
const c = await launch(9336);
mkdirSync('docs/reports/r5', { recursive: true });
if (keep) mkdirSync(keep, { recursive: true });
const TW = 215, TH = 292, COLS = 8; // tile = 390 x 530 body area at 0.55
let total = 0;
for (const sex of ['male', 'female']) {
  await c.open(sex);
  const tiles = [];
  for (const r of recs) {
    await c.evaluate(`location.hash = '#workouts/exercises/${r.id}'`);
    await sleep(400);
    const ok = await c.waitFor(`document.querySelector('.sheet.player h1')?.textContent === ${JSON.stringify(r.name)} && document.querySelectorAll('.effort-rows li').length > 0`, 15000);
    await c.evaluate(`(() => { const b = document.querySelector('.player-transport button'); if (b?.textContent === 'Pause') b.click();
      const g = document.querySelector('.player-transport input'); if (g) { g.value = '50'; g.dispatchEvent(new Event('input')); } })()`);
    await sleep(1200);
    const y = await c.evaluate(`Math.round(document.querySelector('.sheet')?.getBoundingClientRect().top ?? 530)`);
    const buf = await c.png({ x: 0, y: 0, width: 390, height: Math.min(y, 530) });
    if (keep) writeFileSync(`${keep}/${sex}-${r.id}.png`, buf);
    tiles.push({ name: r.name, ok, src: buf.toString('base64') });
    if (ok) total++; else console.log(`not opened: ${sex}/${r.id}`);
  }
  const rows = Math.ceil(tiles.length / COLS), W = COLS * TW, H = rows * (TH + 20);
  await c.evaluate(`(() => { document.body.innerHTML = ''; document.body.style.cssText = 'margin:0;background:#101418;overflow:visible';
    const g = document.createElement('div'); g.style.cssText = 'display:grid;grid-template-columns:repeat(${COLS},${TW}px);width:${W}px';
    for (const t of ${JSON.stringify(tiles)}) { const d = document.createElement('div'); d.style.cssText = 'width:${TW}px;height:${TH + 20}px;color:' + (t.ok ? '#ddd' : '#f66') + ';font:12px sans-serif';
      d.innerHTML = '<img style="width:${TW}px;height:${TH}px;object-fit:cover;object-position:top;display:block" src="data:image/png;base64,' + t.src + '"><div style="padding:2px 4px;white-space:nowrap;overflow:hidden">' + t.name + '</div>'; g.append(d); }
    document.body.append(g); })()`);
  await c.metrics(W, H, false);
  await sleep(800);
  writeFileSync(`docs/reports/r5/contact-${sex}.png`, await c.png());
  await c.metrics(390, 844);
  console.log(`contact-${sex}.png: ${tiles.filter((t) => t.ok).length} of ${tiles.length}`);
}
if (c.errors.length) console.log('console:', [...new Set(c.errors)]);
console.log(`tiles: ${total} of ${recs.length * 2}`);
c.done(total === recs.length * 2 ? 0 : 1);
