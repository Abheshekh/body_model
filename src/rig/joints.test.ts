import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const data = JSON.parse(readFileSync('public/data/joints.json', 'utf8'));
type Limit = { min: number; max: number; source: string; note?: string };
const joints: Record<string, Record<string, Limit>> = data.joints;

const sides = ['l', 'r'].flatMap((s) => [
  [`shoulder_${s}`, ['flex', 'abd', 'rot']], [`scapula_${s}`, ['elev']],
  [`elbow_${s}`, ['flex', 'pron']], [`wrist_${s}`, ['flex', 'dev']],
  [`hip_${s}`, ['flex', 'abd', 'rot']], [`knee_${s}`, ['flex']],
  [`ankle_${s}`, ['flex', 'inv']],
]);
const expected: [string, string[]][] = [
  ['pelvis', ['pitch', 'roll', 'yaw']],
  ['lumbar', ['flex', 'side', 'twist']], ['thoracic', ['flex', 'side', 'twist']],
  ['neck', ['flex', 'side', 'turn']], ['head', ['flex', 'side', 'turn']],
  ...(sides as [string, string[]][]),
];

describe('joints.json', () => {
  it('has sources and exactly the SPEC joints', () => {
    expect(data.sources.length).toBeGreaterThan(0);
    expect(Object.keys(joints).sort()).toEqual(expected.map((e) => e[0]).sort());
  });
  for (const [key, axes] of expected) {
    it(`${key}: axes, min < max, source`, () => {
      expect(Object.keys(joints[key]).sort()).toEqual([...axes].sort());
      for (const ax of axes) {
        const l = joints[key][ax];
        expect(l.min, ax).toBeLessThan(l.max);
        expect(l.source.length, ax).toBeGreaterThan(0);
        if (l.source === 'convention') expect(l.note, ax).toBeTruthy();
      }
    });
  }
});
