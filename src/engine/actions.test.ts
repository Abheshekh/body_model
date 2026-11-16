import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';

const read = (f: string) => JSON.parse(readFileSync(`public/data/${f}`, 'utf8'));
type Entry = { actions: [string, string, string, number][]; rules?: string[]; reviewed?: boolean; source: string };
const data: { sources: string[]; muscles: Record<string, Entry>; unmodelled: Record<string, string> } = read('actions.json');
const joints: Record<string, Record<string, unknown>> = read('joints.json').joints;
const manifest = read('body/manifest.json');
const parts: { id: number; plain: string; side: string; kind: string }[] = manifest.parts.filter((p: { kind: string }) => p.kind === 'muscle');
const plains = [...new Set(parts.map((p) => p.plain))];
const MIDLINE = new Set(['lumbar', 'thoracic', 'neck', 'head']);
const SIDED_AXES = new Set(['side', 'twist', 'turn']);

/** §2b.2: summed triangle count per plain name from the muscle pack (all heads, both sides). */
function trianglesByPlain(): Map<string, number> {
  const pack = manifest.packs.find((p: { name: string }) => p.name === 'muscle');
  const raw = gunzipSync(readFileSync(`public/data/body/${pack.file}`));
  const view = (name: string) => raw.subarray(pack.arrays[name][0], pack.arrays[name][0] + pack.arrays[name][1]);
  const idx = new Uint32Array(Uint8Array.from(view('idx')).buffer);
  const mid = new Uint16Array(Uint8Array.from(view('mid')).buffer);
  const plainOf = new Map<number, string>(manifest.parts.map((p: { id: number; plain: string }) => [p.id, p.plain]));
  const out = new Map<string, number>();
  for (let t = 0; t < idx.length; t += 3) {
    const k = plainOf.get(mid[idx[t]])!;
    out.set(k, (out.get(k) ?? 0) + 1);
  }
  return out;
}

describe('actions.json', () => {
  it('has sources', () => expect(data.sources.length).toBeGreaterThan(0));

  it('covers every manifest muscle part exactly once, nothing stale', () => {
    expect(parts.length).toBe(443);
    expect(plains.length).toBe(222);
    for (const p of parts) {
      expect(['left', 'right', 'center'], p.plain).toContain(p.side);
      const inM = p.plain in data.muscles, inU = p.plain in data.unmodelled;
      expect(inM !== inU, `${p.id} ${p.plain}`).toBe(true);
    }
    for (const k of [...Object.keys(data.muscles), ...Object.keys(data.unmodelled)]) expect(plains, k).toContain(k);
  });

  it('every unmodelled entry gives a reason', () => {
    for (const [k, r] of Object.entries(data.unmodelled)) expect(typeof r === 'string' && r.length > 10, k).toBe(true);
  });

  it('every muscle has a source and an action or a rule', () => {
    for (const [k, e] of Object.entries(data.muscles)) {
      expect(typeof e.source === 'string' && e.source.length > 0, k).toBe(true);
      expect(e.actions.length + (e.rules?.length ?? 0), k).toBeGreaterThan(0);
      for (const r of e.rules ?? []) expect(['grip', 'scapula', 'bracing'], k).toContain(r);
    }
  });

  it('actions: sideless joint keys and axes from joints.json (hadd on the shoulder), dirs, weights in (0, 1]', () => {
    for (const [k, e] of Object.entries(data.muscles))
      for (const [joint, axis, dir, w] of e.actions) {
        const msg = `${k}: ${joint} ${axis} ${dir} ${w}`;
        expect(joint.endsWith('_l') || joint.endsWith('_r') || joint === 'pelvis' || joint === 'scapula', msg).toBe(false);
        const j = joints[joint] ?? joints[`${joint}_l`];
        expect(j, msg).toBeDefined();
        expect(axis in j || (axis === 'hadd' && joint === 'shoulder'), msg).toBe(true);
        // side bend and turn are sided: they need ipsi/contra; every other axis needs + or -
        if (MIDLINE.has(joint) && SIDED_AXES.has(axis)) expect(['ipsi', 'contra'], msg).toContain(dir);
        else expect(['+', '-'], msg).toContain(dir);
        expect(w > 0 && w <= 1, msg).toBe(true);
      }
  });

  it('rule tags: grip, scapula and bracing muscles', () => {
    const tagged = (r: string) => Object.keys(data.muscles).filter((k) => data.muscles[k].rules?.includes(r)).sort();
    expect(tagged('bracing')).toEqual(['External abdominal oblique muscle', 'Internal abdominal oblique muscle', 'Rectus abdominis muscle', 'Transversus abdominis muscle']);
    expect(tagged('scapula')).toEqual(['Ascending part of trapezius muscle', 'Descending part of trapezius muscle', 'Levator scapulae', 'Rhomboid major muscle',
      'Rhomboid minor muscle', 'Serratus anterior muscle', 'Transverse part of trapezius muscle']);
    for (const k of tagged('grip')) expect(data.muscles[k].actions.some(([j]) => j === 'wrist'), k).toBe(true);
    for (const k of ['Flexor digitorum profundus', 'Humero-ulnar head of flexor digitorum superficialis', 'Extensor digitorum', 'Extensor carpi radialis brevis'])
      expect(tagged('grip')).toContain(k);
  });

  it('the 40 largest (summed triangles, §2b.2) are reviewed or unmodelled; the 40 largest modelled are all reviewed', () => {
    const tris = trianglesByPlain();
    for (const p of plains) expect(tris.get(p) ?? 0, p).toBeGreaterThan(0);
    const ranked = [...tris.entries()].filter(([k]) => plains.includes(k)).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([k]) => k);
    for (const k of ranked.slice(0, 40)) expect(data.muscles[k]?.reviewed === true || k in data.unmodelled, k).toBe(true);
    const modelled = ranked.filter((k) => k in data.muscles);
    for (const k of modelled.slice(0, 40)) expect(data.muscles[k].reviewed, k).toBe(true);
  });
});
