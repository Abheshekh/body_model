import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { isDeepStrictEqual } from 'node:util';
import { fromPrototype, clampPose, type Limits, type Pose, type ProtoPose } from '../rig/pose';

const read = (f: string) => JSON.parse(readFileSync(`public/data/${f}`, 'utf8'));
const ex = read('exercises.json').exercises;
const tasks = read('tasks.json').tasks;
const limits: Limits = read('joints.json').joints;
const all = [...ex, ...tasks];
type Variant = { id: string; still?: boolean; proto: { a: ProtoPose; b: ProtoPose } };
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
  it('no variant carries a muscles list (effort comes from the engine)', () => {
    for (const { e, v } of variants) expect(Object.keys(v), `${e.id}/${v.id}`).not.toContain('muscles');
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
  }
});
