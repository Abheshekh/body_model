import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { emptyPose, type Pose } from '../rig/pose';
import { effort, engineData } from './effort';
import { movedJoints, roleOf } from './roles';
import type { Reason } from './types';

const pose = (joints: Pose['joints']): Pose => ({ ...emptyPose(), joints });
const elbow: Reason = { kind: 'joint', joint: 'elbow_l', axis: 'flex', dir: '+', demand: 0.5 };

describe('movedJoints (§2b.6, 5° rule)', () => {
  it('a joint moves when any axis changes by ≥ 5°', () => {
    const a = pose({ elbow_l: { flex: 10, pron: 0 }, knee_l: { flex: 20 } });
    const b = pose({ elbow_l: { flex: 10, pron: 5 }, knee_l: { flex: 24.9 }, hip_l: { abd: -6 } });
    expect([...movedJoints(a, b)].sort()).toEqual(['elbow_l', 'hip_l']);
  });
  it('without b nothing moves', () => expect(movedJoints(pose({ elbow_l: { flex: 90 } })).size).toBe(0));
});

describe('roleOf', () => {
  const moved = new Set(['elbow_l']);
  it('moving joint → work, or help when the best weight < 0.6', () => {
    expect(roleOf(0.5, elbow, 1, moved)).toBe('work');
    expect(roleOf(0.5, elbow, 0.59, moved)).toBe('help');
    expect(roleOf(0.5, elbow, 0.6, moved)).toBe('work');
  });
  it('demand without motion → hold; rules hold; no level → none', () => {
    expect(roleOf(0.5, elbow, 1, new Set())).toBe('hold');
    expect(roleOf(0.5, { kind: 'rule', rule: 'grip', value: 0.5 }, 1, moved)).toBe('hold');
    expect(roleOf(0, elbow, 1, moved)).toBe('none');
    expect(roleOf(0.3, undefined, 0, moved)).toBe('none');
  });
  it('effort without poseB: every working muscle holds', () => {
    const read = (f: string) => JSON.parse(readFileSync(`public/data/${f}`, 'utf8'));
    const data = engineData({ rig: read('body/rig.json'), manifest: read('body/manifest.json'), segments: read('segments.json'), strengths: read('strengths.json'), actions: read('actions.json') });
    const p = pose({ elbow_l: { flex: 90 }, elbow_r: { flex: 90 } });
    const input = { sex: 'male' as const, loads: [{ id: 'bar', kind: 'free' as const, kg: 20, at: 'hands' as const }], supports: read('supports.json').pins.default };
    const roles = new Set(Object.values(effort({ ...input, pose: p }, data).muscle).filter((m) => m.level > 0).map((m) => m.role));
    expect([...roles]).toEqual(['hold']);
    const moving = effort({ ...input, pose: p, poseB: pose({}) }, data).muscle;
    expect(Object.values(moving).some((m) => m.role === 'work')).toBe(true);
  });
});
