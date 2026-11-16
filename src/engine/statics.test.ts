import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createSkeleton, type Rig } from '../rig/skeleton';
import { emptyPose, type Pose } from '../rig/pose';
import { G, bodyGeometry } from './geometry';
import { gravityForces, loadForces, solveSupports } from './statics';
import type { Force, Load, Segments, Sex, Support } from './types';

const read = (f: string) => JSON.parse(readFileSync(`public/data/${f}`, 'utf8'));
const rig: Rig = read('body/rig.json');
const segs: Segments = read('segments.json').segments;
const sup = read('supports.json');
const pose = (joints: Pose['joints'], pin: Pose['pin'] = 'ground'): Pose => ({ ...emptyPose(), joints, pin });
const fy = (fs: Force[]) => fs.reduce((a, x) => a + x.f[1], 0);

describe.each(['male', 'female'] as Sex[])('statics (%s)', (sex) => {
  const skel = createSkeleton(rig, sex);
  const geo = (p: Pose) => bodyGeometry(skel, p, segs, 70, sex);

  it('loads: free down, cable toward its pulley, machine along its track; plural points split', () => {
    const g = geo(pose({}));
    const [l, r] = loadForces(g, [{ id: 'bar', kind: 'free', kg: 20, at: 'hands' }]);
    expect(l.f).toEqual([0, -10 * G, 0]);
    expect([l.bone, r.bone]).toEqual(['hand_l', 'hand_r']);
    const [c] = loadForces(g, [{ id: 'h', kind: 'cable', kg: 15, at: 'hand_l', toward: [0, 0, 2] }]);
    expect(c.f[2]).toBeCloseTo(15 * G, 9);
    const [m] = loadForces(g, [{ id: 'p', kind: 'machine', kg: 40, at: 'foot_l', track: [0, 3, 0] }]);
    expect(m.f[1]).toBeCloseTo(40 * G, 9);
    expect(m.bone).toBe('ball_l');
    expect(() => loadForces(g, [{ id: 'x', kind: 'cable', kg: 5, at: 'hands' }])).toThrow(/direction/);
  });

  it('reactions sum to total weight within 0.5 N (standing, carrying, seated)', () => {
    const cases: [Pose, Load[], Support[]][] = [
      [pose({}), [], sup.pins.ground],
      [pose({ lumbar: { side: 10 } }), [{ id: 'b', kind: 'free', kg: 10, at: 'hand_r' }], sup.pins.ground],
      [pose({}, 'toes'), [{ id: 'bar', kind: 'free', kg: 20, at: 'hands' }], sup.pins.toes],
      [pose({ hip_l: { flex: 90 }, hip_r: { flex: 90 }, knee_l: { flex: 90 }, knee_r: { flex: 90 } }, 'none'), [], sup.props.seat],
    ];
    for (const [p, loads, s] of cases) {
      const g = geo(p);
      const { reactions } = solveSupports(g, loads, s);
      expect(Math.abs(fy(reactions) + fy([...gravityForces(g), ...loadForces(g, loads)]))).toBeLessThan(0.5);
      for (const r of reactions) expect(r.f[1]).toBeGreaterThanOrEqual(0);
    }
  });

  it('two feet split by where the COM sits (within 2%)', () => {
    for (const side of [-12, 0, 12]) {
      const g = geo(pose({ lumbar: { side }, thoracic: { side } }, 'toes'));
      const grav = gravityForces(g), W = -fy(grav);
      const xc = grav.reduce((a, x) => a + x.at[0] * -x.f[1], 0) / W;
      const xl = g.point('foot_l')[0], xr = g.point('foot_r')[0];
      const { reactions } = solveSupports(g, [], sup.pins.toes);
      const left = reactions.find((r) => r.bone === 'ball_l')!.f[1];
      const expected = (W * (xc - xr)) / (xl - xr);
      expect(Math.abs(left - expected) / expected).toBeLessThan(0.02);
    }
  });

  it('a support that would have to pull is dropped and the rest re-solved', () => {
    const g = geo(pose({ shoulder_l: { abd: 90 } }));
    const left: Support[] = [{ point: 'hand_l', normal: [0, 1, 0] }, { point: 'foot_l', normal: [0, 1, 0] }, { point: 'heel_l', normal: [0, 1, 0] }];
    const { reactions, balance } = solveSupports(g, [], left);
    expect(reactions.length).toBeLessThan(3);
    for (const r of reactions) expect(r.f[1]).toBeGreaterThanOrEqual(0);
    expect(balance.comOverFeet).toBe(false);
    expect(balance.margin).toBeLessThan(0);
  });

  it('no support: warning, no reactions, not balanced', () => {
    const { reactions, balance, warnings } = solveSupports(geo(pose({}, 'none')), [], []);
    expect(reactions).toEqual([]);
    expect(balance.comOverFeet).toBe(false);
    expect(warnings).toHaveLength(1);
  });

  it('standing with no pin uses the default pin (§2b.12): COM over the feet', () => {
    const p: Pose = { ...emptyPose(), joints: {} };
    const { balance, reactions } = solveSupports(geo(p), [], sup.pins[p.pin ?? 'default']);
    expect(balance.comOverFeet).toBe(true);
    expect(balance.margin).toBeGreaterThan(0);
    expect(reactions.length).toBeGreaterThanOrEqual(2);
  });

  it('standing flat: COM over the feet; leaning far forward: not', () => {
    expect(solveSupports(geo(pose({})), [], sup.pins.ground).balance.comOverFeet).toBe(true);
    const lean = solveSupports(geo(pose({ lumbar: { flex: 60 }, thoracic: { flex: 40 }, shoulder_l: { flex: 100 }, shoulder_r: { flex: 100 } }, 'ground')), [{ id: 'b', kind: 'free', kg: 20, at: 'hands' }], sup.pins.ground);
    expect(lean.balance.comOverFeet).toBe(false);
  });

  it('horizontal load is taken by friction; the back pad only pushes', () => {
    const g = geo(pose({}));
    const row: Load = { id: 'h', kind: 'cable', kg: 15, at: 'hands', toward: [0, 0, 1] };
    const { reactions } = solveSupports(g, [row], sup.pins.ground);
    expect(Math.abs(reactions.reduce((a, r) => a + r.f[2], 0) + 15 * G)).toBeLessThan(0.5);
    const seated = { hip_l: { flex: 90 }, hip_r: { flex: 90 }, knee_l: { flex: 90 }, knee_r: { flex: 90 } };
    const forward = solveSupports(geo(pose({ ...seated, lumbar: { flex: 30 } }, 'none')), [], [...sup.props.seat, ...sup.props.back]);
    expect(forward.reactions.some((r) => r.bone === 'spine_03')).toBe(false); // leaning away: the pad does nothing
    const back = solveSupports(geo(pose({ ...seated, lumbar: { flex: -15 } }, 'none')), [], [...sup.props.seat, ...sup.props.back]);
    expect(back.reactions.find((r) => r.bone === 'spine_03')!.f[2]).toBeGreaterThan(0);
  });
});
