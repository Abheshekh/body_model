import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { isDeepStrictEqual } from 'node:util';
import { fromPrototype, clampPose, type Limits, type Pose, type ProtoPose } from '../rig/pose';

const read = (f: string) => JSON.parse(readFileSync(`public/data/${f}`, 'utf8'));
const ex = read('exercises.json').exercises;
const tasks = read('tasks.json').tasks;
const prov = read('provisional_muscles.json');
const limits: Limits = read('joints.json').joints;
const parts: { plain: string; side: string; kind: string }[] = read('body/manifest.json').parts.filter((p: { kind: string }) => p.kind === 'muscle');
const all = [...ex, ...tasks];
type Variant = { id: string; still?: boolean; proto: { a: ProtoPose; b: ProtoPose }; muscles: { provisional: boolean; prime: [string][]; syn: [string][]; stab: [string][] } };
const variants = all.flatMap((e) => (e.variants as Variant[]).map((v) => ({ e, v })));

const maxClamp = (p: Pose): number => {
  const c = clampPose(p, limits);
  let m = Math.max(Math.abs(c.root.pitch - p.root.pitch), Math.abs(c.root.roll - p.root.roll), Math.abs(c.root.yaw - p.root.yaw));
  for (const [j, axes] of Object.entries(p.joints))
    for (const [a, v] of Object.entries(axes)) m = Math.max(m, Math.abs(c.joints[j][a] - v));
  return m;
};

describe('content data', () => {
  it('counts', () => {
    expect(ex.length).toBe(11);
    expect(tasks.length).toBe(5);
  });
  it('provisional flags', () => {
    expect(prov.provisional).toBe(true);
    expect(prov.sources.length).toBeGreaterThan(0);
    for (const { v } of variants) expect(v.muscles.provisional).toBe(true);
  });
  for (const { e, v } of variants) {
    it(`${e.id}/${v.id}: keyframes a and b are objects, differ unless still, within limits`, () => {
      for (const k of [v.proto.a, v.proto.b]) {
        expect(k !== null && typeof k === 'object' && !Array.isArray(k), JSON.stringify(k)).toBe(true);
        expect(maxClamp(fromPrototype(k))).toBeLessThanOrEqual(1);
      }
      // a standing {} keyframe is fine; only a held position (still) may repeat itself
      if (!v.still) expect(isDeepStrictEqual(v.proto.a, v.proto.b), 'a = b in a moving variant').toBe(false);
    });
    it(`${e.id}/${v.id}: group keys resolve`, () => {
      const m = v.muscles;
      for (const [key] of [...m.prime, ...m.syn, ...m.stab]) {
        const [base, side] = key.split('_');
        const names: string[] | undefined = prov.groups[base];
        expect(names?.length, key).toBeGreaterThan(0);
        for (const n of names!) {
          const hit = parts.filter((p) => p.plain === n && (!side || p.side === (side === 'L' ? 'left' : 'right')));
          expect(hit.length, `${key} -> ${n}`).toBeGreaterThan(0);
        }
      }
    });
  }
});
