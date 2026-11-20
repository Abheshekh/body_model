import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { isDeepStrictEqual } from 'node:util';
import { fromPrototype, clampPose, type Limits, type Pose, type ProtoPose } from '../rig/pose';
import { legacyId, loadExercises, validateExercises } from './exercises';

const read = (f: string) => JSON.parse(readFileSync(`public/data/${f}`, 'utf8'));
const exJson = read('exercises.json');
const ex = loadExercises(exJson);
const limits: Limits = read('joints.json').joints;
// a record's keyframes. `still` = a held position whose keyframes may repeat
const moves: { key: string; frames: ProtoPose[]; still: boolean }[] = [
  ...ex.map((e) => ({ key: e.id, frames: e.keyframes, still: e.pattern === 'hold' })),
];

const maxClamp = (p: Pose): number => {
  const c = clampPose(p, limits);
  let m = Math.max(Math.abs(c.root.pitch - p.root.pitch), Math.abs(c.root.roll - p.root.roll), Math.abs(c.root.yaw - p.root.yaw));
  for (const [j, axes] of Object.entries(p.joints))
    for (const [a, v] of Object.entries(axes)) m = Math.max(m, Math.abs(c.joints[j][a] - v));
  return m;
};

describe('content data', () => {
  it('exercises.json v2 is valid against the engine tables and equipment.json', () => {
    const tables = { loads: read('loads.json'), supports: read('supports.json') };
    expect(validateExercises(exJson, tables, read('equipment.json'))).toEqual([]);
  });
  it('every R4 variant has its record (plan 2b.1)', () => {
    const ids = new Set(ex.map((e) => e.id));
    for (const [old, vs] of Object.entries({ curl: ['stand', 'seat', 'preacher'], ohp: ['stand', 'seat'], press: ['bench', 'pushup'],
      row: ['bent', 'cable'], pull: ['pullup', 'pulldown'], squat: ['back', 'legpress'], deadlift: ['conv', 'rdl'], lateral: ['stand', 'seat'],
      triceps: ['pushdown', 'overhead'], plank: ['front'], calf: ['stand', 'seat'] }))
      for (const v of vs) expect(ids.has(legacyId(old, v)!), `${old}/${v}`).toBe(true);
  });
  it('no record or variant carries a muscles list (effort comes from the engine)', () => {
    for (const e of ex) expect(Object.keys(e), e.id).not.toContain('muscles');
  });
  for (const { key, frames, still } of moves) {
    it(`${key}: keyframes are objects, differ unless still, within limits`, () => {
      for (const k of frames) {
        expect(k !== null && typeof k === 'object' && !Array.isArray(k), JSON.stringify(k)).toBe(true);
        expect(maxClamp(fromPrototype(k))).toBeLessThanOrEqual(1);
      }
      // a standing {} keyframe is fine; only a held position (still) may repeat itself
      if (!still) expect(frames.every((k) => isDeepStrictEqual(k, frames[0])), 'all keyframes equal in a moving record').toBe(false);
    });
  }
});
