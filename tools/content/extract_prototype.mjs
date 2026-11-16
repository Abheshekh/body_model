// Writes public/data/exercises.json and tasks.json from prototype/index.html lines 380-690 (poses kept as-is, prototype form).
import { readFileSync, writeFileSync } from 'node:fs';
import vm from 'node:vm';

const src = readFileSync('prototype/index.html', 'utf8').split('\n').slice(379, 690).join('\n');
const ctx = vm.runInNewContext(src + '\n({EX, CH})', {});

// Changelog 2026-11-16 01:40: prototype ankle dorsiflexion beyond the AAOS 20 deg limit (prototype sign: - = dorsiflexion).
const ADJUST = {
  'press/pushup': [{ ankle: 0 }, "Ankle 0 (prototype -62 stood in for toe extension; pin 'toes' grounds the ball)."],
  'plank/front': [{ ankle: 0 }, "Ankle 0 (prototype -70 stood in for toe extension; pin 'toes' grounds the ball)."],
  'squat/back': [{ ankle: -20 }, 'Ankle dorsiflexion 28 -> 20 (AAOS 1965 limit).'],
  'bucket/squat': [{ ankle: -20 }, 'Ankle dorsiflexion 26 -> 20 (AAOS 1965 limit).'],
};
const sources = ['prototype/index.html lines 380-690 (EX, CH); muscle effort comes from the R4 effort engine'];
const variant = (v, eid) => {
  const adj = ADJUST[`${eid}/${v.id}`];
  const fix = (k) => (adj && k.ankle !== undefined ? { ...k, ...adj[0] } : k);
  const o = { id: v.id, name: v.name, props: v.props ?? [] };
  if (v.cam) o.cam = v.cam;
  if (v.spine) o.spine = v.spine;
  if (v.still) o.still = true; // a held position: a = b
  o.proto = { a: fix(v.a), b: fix(v.b) };
  if (adj) o.adjusted = adj[1];
  o.moving = v.moving;
  o.held = v.held;
  if (v.note) o.note = v.note;
  return o;
};
const item = (e) => ({ id: e.id, name: e.name, part: e.part, cues: e.cues, avoid: e.avoid, variants: e.variants.map((v) => variant(v, e.id)) });
const out = (file, key, list) => writeFileSync(`public/data/${file}`, JSON.stringify({ sources, [key]: list.map(item) }, null, 1) + '\n');
out('exercises.json', 'exercises', ctx.EX);
out('tasks.json', 'tasks', ctx.CH);
console.log(ctx.EX.length, 'exercises', ctx.CH.length, 'tasks');
