import { describe, expect, it } from 'vitest';
import { solveTwoBone, type Vec3 } from './ik';

const hip: Vec3 = [0, 1, 0], knee: Vec3 = [0, 0.5, 0], ankle: Vec3 = [0, 0, 0]; // two 0.5 m bones
const d = (p: Vec3, q: Vec3) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);

describe('solveTwoBone', () => {
  it('reaches a reachable target within 1 mm with preserved bone lengths', () => {
    const t: Vec3 = [0.1, 0.3, 0.4];
    const r = solveTwoBone(hip, knee, ankle, t, [0, 0, 1]);
    expect(d(r.end, t)).toBeLessThan(1e-3);
    expect(d(hip, r.mid)).toBeCloseTo(0.5, 6);
    expect(d(r.mid, r.end)).toBeCloseTo(0.5, 6);
    expect(r.clamped).toBe(false);
  });
  it('clamps an unreachable target to full extension along the target line', () => {
    const t: Vec3 = [2, 1, 0];
    const r = solveTwoBone(hip, knee, ankle, t, [0, 0, 1]);
    expect(r.clamped).toBe(true);
    expect(r.end[0]).toBeCloseTo(1, 6);
    expect(r.end[1]).toBeCloseTo(1, 6);
    expect(r.flex).toBeCloseTo(0, 3);
  });
  it('bends toward the pole', () => {
    const t: Vec3 = [0, 0.3, 0];
    expect(solveTwoBone(hip, knee, ankle, t, [0, 0, 1]).mid[2]).toBeGreaterThan(0.1);
    expect(solveTwoBone(hip, knee, ankle, t, [0, 0, -1]).mid[2]).toBeLessThan(-0.1);
  });
  it('respects a bend limit', () => {
    const r = solveTwoBone(hip, knee, ankle, [0, 0.9, 0], [0, 0, 1], { min: 0, max: 100 });
    expect(r.flex).toBeCloseTo(100, 6);
    expect(r.clamped).toBe(true);
    expect(d(r.mid, r.end)).toBeCloseTo(0.5, 6);
  });
});
