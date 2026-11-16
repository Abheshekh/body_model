import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createSkeleton, mul, tr, type M3, type Rig } from '../rig/skeleton';
import { emptyPose, type Pose } from '../rig/pose';
import { G, bodyGeometry, unit } from './geometry';
import { gravityForces, loadForces, solveSupports } from './statics';
import { jointAxis, jointTorques } from './torque';
import type { Load, Segments, Sex, Support, Vec3 } from './types';

const read = (f: string) => JSON.parse(readFileSync(`public/data/${f}`, 'utf8'));
const rig: Rig = read('body/rig.json');
const segs: Segments = read('segments.json').segments;
const sup = read('supports.json');
const elbowFlexStrength = read('strengths.json').strengths.elbow.flex['+'] as number;
const pose = (joints: Pose['joints'], pin: Pose['pin'] = 'ground'): Pose => ({ ...emptyPose(), joints, pin });
const SEATED = { hip_l: { flex: 90 }, hip_r: { flex: 90 }, knee_l: { flex: 90 }, knee_r: { flex: 90 } };
const db = (kg: number, at: Load['at'] = 'hand_l'): Load => ({ id: 'db', kind: 'free', kg, at });
const mag = (t: Record<string, number>) => Math.hypot(...Object.entries(t).filter(([a]) => a !== 'hadd').map(([, v]) => v));

describe.each(['male', 'female'] as Sex[])('jointTorques (%s)', (sex) => {
  const skel = createSkeleton(rig, sex);
  const run = (p: Pose, loads: Load[], supports: Support[]) => {
    const g = bodyGeometry(skel, p, segs, 70, sex);
    const st = solveSupports(g, loads, supports);
    return { g, st, T: jointTorques(g, [...gravityForces(g), ...loadForces(g, loads), ...st.reactions], rig.joints) };
  };

  it('axis directions match the FK (jointRotation) on both sides, at a non-zero pose', () => {
    const p = pose({
      shoulder_l: { flex: 60, abd: 20, rot: 10 }, shoulder_r: { flex: 60, abd: 20, rot: 10 },
      elbow_l: { flex: 70, pron: 30 }, elbow_r: { flex: 70, pron: 30 }, hip_l: { flex: 40, abd: 10, rot: 15 },
      hip_r: { flex: 40, abd: 10, rot: 15 }, knee_l: { flex: 30 }, ankle_r: { flex: 10, inv: 5 },
      lumbar: { flex: 20, side: 5, twist: 10 }, thoracic: { flex: 10, side: 3, twist: 5 }, neck: { flex: 10, turn: 20 },
    });
    const g = bodyGeometry(skel, p, segs, 70, sex);
    const f0 = skel.fk(p);
    const axisOf = (R: M3): Vec3 => unit([R[7] - R[5], R[2] - R[6], R[3] - R[1]]);
    for (const [key, j] of Object.entries(rig.joints)) {
      if (key === 'pelvis' || j.derived) continue;
      for (const a of j.axes) {
        const q = structuredClone(p);
        q.joints[key] = { ...q.joints[key], [a]: (q.joints[key]?.[a] ?? 0) + 1e-4 };
        const i = skel.names.indexOf(j.bones[0]);
        const fk = axisOf(mul(skel.fk(q).Rw[i], tr(f0.Rw[i])));
        jointAxis(g, key, j, a).forEach((v, k) => expect(v, `${key}.${a}`).toBeCloseTo(fk[k], 5));
      }
    }
  });

  it('a hanging weight needs elbow flexion on both sides; left/right torques mirror', () => {
    const p = pose({ elbow_l: { flex: 90 }, elbow_r: { flex: 90 } });
    const { T } = run(p, [db(10, 'hands')], sup.pins.ground);
    expect(T.elbow_l.flex).toBeGreaterThan(0);
    expect(Math.abs(T.elbow_r.flex / T.elbow_l.flex - 1)).toBeLessThan(0.01); // the female rig is not exactly symmetric
  });

  it('10 kg at the hand: elbow-flex demand rises with flexion to 90°', () => {
    const demand = [0, 30, 60, 90].map((flex) =>
      run(pose({ elbow_l: { flex } }), [db(10)], sup.pins.ground).T.elbow_l.flex / (elbowFlexStrength * 70));
    expect(Math.abs(demand[0])).toBeLessThan(0.01);
    for (let i = 1; i < demand.length; i++) expect(demand[i]).toBeGreaterThan(demand[i - 1]);
  });

  it('10 kg at 90°: elbow torque = m·g·horizontal lever (load + forearm + hand) within 5%', () => {
    const { g, T } = run(pose({ elbow_l: { flex: 90 } }), [db(10)], sup.pins.ground);
    const e = g.joint('elbow_l');
    const lever = (p: Vec3) => Math.hypot(p[0] - e[0], p[2] - e[2]);
    const expected = G * (10 * lever(g.point('hand_l')) + g.bones.lowerarm_l.mass * lever(g.bones.lowerarm_l.com)
      + g.bones.hand_l.mass * lever(g.bones.hand_l.com));
    expect(Math.abs(T.elbow_l.flex - expected) / expected).toBeLessThan(0.05);
  });

  it('no support: a warning, no reactions, torques from gravity only', () => {
    const { g, st, T } = run(pose({}), [], []);
    expect(st.reactions).toEqual([]);
    expect(st.warnings.length).toBeGreaterThan(0);
    expect(st.balance.comOverFeet).toBe(false);
    const gOnly = jointTorques(g, gravityForces(g), rig.joints);
    expect(T).toEqual(gOnly);
  });

  it('seat takes the thigh weight (§2b.12): hip <= 30% of unsupported and <= 10% of feet-only; knee unchanged', () => {
    const p = pose(SEATED, 'none');
    const free = run(p, [], []).T, seat = run(p, [], sup.props.seat).T, feet = run({ ...p, pin: 'ground' }, [], sup.pins.ground).T;
    for (const k of ['hip_l', 'hip_r']) {
      expect(mag(seat[k]), k).toBeLessThanOrEqual(0.3 * mag(free[k]));
      expect(mag(seat[k]), k).toBeLessThanOrEqual(0.1 * mag(feet[k]));
    }
    for (const k of ['knee_l', 'knee_r']) expect(mag(seat[k]), k).toBeCloseTo(mag(free[k]), 9);
  });

  it('back pad lowers the lumbar moment by >= 80% (seated, leaning back)', () => {
    const p = pose({ ...SEATED, lumbar: { flex: -15 }, thoracic: { flex: -5 } }, 'none');
    const seat = run(p, [], sup.props.seat).T, pad = run(p, [], [...sup.props.seat, ...sup.props.back]).T;
    expect(mag(pad.lumbar)).toBeLessThanOrEqual(0.2 * mag(seat.lumbar));
  });

  it('shoulder raised > 45°: hadd; a load pulling the abducted arm back needs horizontal adduction', () => {
    const p = pose({ shoulder_l: { abd: 90 }, shoulder_r: { abd: 90 } });
    const back: Load = { id: 'c', kind: 'cable', kg: 5, at: 'hands', toward: [0, 0, -1] };
    const { T } = run(p, [back], sup.pins.ground);
    expect(T.shoulder_l.hadd).toBeGreaterThan(0);
    expect(Math.abs(T.shoulder_r.hadd / T.shoulder_l.hadd - 1)).toBeLessThan(0.01);
    expect(run(pose({ shoulder_l: { abd: 30 } }), [], sup.pins.ground).T.shoulder_l.hadd).toBeUndefined();
  });
});
