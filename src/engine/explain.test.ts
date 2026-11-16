import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { explain, explainBalance } from './explain';
import { resolveAction, type Dir } from './muscles';
import type { Reason } from './types';

const j = (joint: string, axis: string, dir: '+' | '-', loadKg?: number): Reason => ({ kind: 'joint', joint, axis, dir, demand: 0.4, loadKg });

describe('explain', () => {
  it('plan examples', () => {
    expect(explain(j('elbow_l', 'flex', '+', 6), 'left')).toBe('Bends the left elbow against 6 kg at the hand');
    expect(explain(j('lumbar', 'flex', '-', 10), 'center')).toBe('Keeps the trunk upright: the load pulls it forward');
  });
  it('directions and sides', () => {
    expect(explain(j('knee_r', 'flex', '-'), 'right')).toBe('Straightens the right knee');
    expect(explain(j('lumbar', 'side', '+'), 'left')).toBe('Bends the trunk to the left');
    expect(explain(j('ankle_l', 'flex', '-'), 'left')).toBe('Points the left foot down');
    expect(explain(j('shoulder_r', 'hadd', '+', 8), 'right')).toBe('Pulls the right arm across the chest against 8 kg at the hand');
    expect(explain(j('elbow_l', 'flex', '+'), 'left', 2.25)).toBe('Bends the left elbow against 2.3 kg at the hand');
  });
  it('rules', () => {
    expect(explain({ kind: 'rule', rule: 'grip', value: 0.5 }, 'right')).toBe('Grips with the right hand');
    expect(explain({ kind: 'rule', rule: 'scapula', value: 0.5 }, 'left')).toBe('Holds the left shoulder blade steady under the arm');
    expect(explain({ kind: 'rule', rule: 'bracing', value: 0.5 }, 'center')).toBe('Braces the trunk as the lower-back moment rises');
  });
  it('every action in actions.json has words, both directions', () => {
    const muscles = JSON.parse(readFileSync('public/data/actions.json', 'utf8')).muscles as Record<string, { actions: [string, string, Dir, number][] }>;
    for (const { actions } of Object.values(muscles))
      for (const [joint, axis, dir] of actions)
        for (const side of ['left', 'right'] as const)
          for (const [k, d] of resolveAction(joint, dir, side)) expect(explain(j(k, axis, d), side)).toMatch(/^[A-Z]/);
    expect(() => explain(j('elbow_l', 'twist', '+'), 'left')).toThrow(/unknown joint axis/);
  });
  it('balance', () => {
    expect(explainBalance({ comOverFeet: true, margin: 0.05 })).toBeNull();
    expect(explainBalance({ comOverFeet: false, margin: -0.09 })).toBe('The centre of mass is beyond the feet in this pose');
  });
});
