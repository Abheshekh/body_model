// Writes public/data/exercises.json and tasks.json from prototype/index.html lines 380-690 (poses kept as-is, prototype form).
import { readFileSync, writeFileSync } from 'node:fs';
import vm from 'node:vm';

const src = readFileSync('prototype/index.html', 'utf8').split('\n').slice(379, 690).join('\n');
const ctx = vm.runInNewContext(src + '\n({EX, CH})', {});

const sources = ['prototype/index.html lines 380-690 (EX, CH); muscle lists are provisional until the R4 effort engine'];
const variant = (v) => {
  const o = { id: v.id, name: v.name, props: v.props ?? [] };
  if (v.cam) o.cam = v.cam;
  if (v.spine) o.spine = v.spine;
  o.proto = { a: v.a, b: v.b };
  o.moving = v.moving;
  o.held = v.held;
  if (v.note) o.note = v.note;
  o.muscles = { provisional: true, prime: v.prime, syn: v.syn, stab: v.stab };
  return o;
};
const item = (e) => ({ id: e.id, name: e.name, part: e.part, cues: e.cues, avoid: e.avoid, variants: e.variants.map(variant) });
const out = (file, key, list) => writeFileSync(`public/data/${file}`, JSON.stringify({ sources, [key]: list.map(item) }, null, 1) + '\n');
out('exercises.json', 'exercises', ctx.EX);
out('tasks.json', 'tasks', ctx.CH);
console.log(ctx.EX.length, 'exercises', ctx.CH.length, 'tasks');
