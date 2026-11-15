import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createSkeleton, euler, jointRotation, mul, mv, zeroDir, type M3, type Rig } from './skeleton';
import { emptyPose, fromPrototype, type Limits, type Pose } from './pose';
import type { Vec3 } from './ik';

const rig: Rig = JSON.parse(readFileSync('public/data/body/rig.json', 'utf8'));
const fixture: { cases: { pose: string; sex: 'male' | 'female'; input: Pose; ground: Vec3; heads: Vec3[]; tails: Vec3[] }[] } =
  JSON.parse(readFileSync('src/rig/fixtures/fk_rigpy.json', 'utf8'));
const limits: Limits = JSON.parse(readFileSync('public/data/joints.json', 'utf8')).joints;
const sk = createSkeleton(rig, 'male');
const bi = (b: string) => sk.names.indexOf(b);
const mk = (joints: Pose['joints'], root: Partial<Pose['root']> = {}): Pose => ({ root: { ...emptyPose().root, ...root }, joints });
const world = (joints: Pose['joints'], root?: Partial<Pose['root']>) => sk.fk(mk(joints, root)).Rw;
// posed local vector v, or the bone's segment: its zero direction, else (fitted zero) its bind direction
const seg = (b: string): Vec3 => zeroDir(b) ?? ((i) => { const d = [0, 1, 2].map((k) => sk.T[i][k] - sk.H[i][k]); const n = Math.hypot(...d); return d.map((x) => x / n) as Vec3; })(bi(b));
const dir = (Rw: M3[], b: string, v?: Vec3) => mv(Rw[bi(b)], v ?? seg(b));
const close = (a: number[], b: number[], tol: number) => a.forEach((x, i) => expect(Math.abs(x - b[i])).toBeLessThan(tol));
const I3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];

describe('skeleton (rig.py mirror)', () => {
  it('zero pose is anatomical zero; skin takes each bind segment onto its zero direction', () => {
    const f = sk.fk(emptyPose());
    f.Rw.forEach((R) => close(R, I3, 1e-12));
    sk.names.forEach((b, i) => {
      const z = zeroDir(b);
      if (!z) return close(f.Rs[i], I3, 1e-12);
      const d = mv(f.Rs[i], [sk.T[i][0] - sk.H[i][0], sk.T[i][1] - sk.H[i][1], sk.T[i][2] - sk.H[i][2]]);
      const n = Math.hypot(...d);
      close(d.map((x) => x / n), z, 1e-9);
    });
  });

  it('euler order is Z, then X, then Y', () => {
    close(euler(30, 40, 50), mul(mul(euler(30), euler(0, 40)), euler(0, 0, 50)), 1e-12);
  });

  it('semantic signs per side (§2b.4)', () => {
    const F: Vec3 = [0, 0, 1], U: Vec3 = [0, -1, 0];
    const checks: [Pose['joints'], string, Vec3 | undefined, number, number][] = [
      [{ shoulder_l: { flex: 30 } }, 'upperarm_l', undefined, 2, 1], [{ shoulder_r: { flex: 30 } }, 'upperarm_r', undefined, 2, 1],
      [{ shoulder_l: { abd: 30 } }, 'upperarm_l', undefined, 0, 1], [{ shoulder_r: { abd: 30 } }, 'upperarm_r', undefined, 0, -1],
      [{ shoulder_l: { rot: 30 } }, 'upperarm_l', F, 0, -1], [{ shoulder_r: { rot: 30 } }, 'upperarm_r', F, 0, 1],
      [{ hip_l: { flex: 30 } }, 'thigh_l', undefined, 2, 1], [{ hip_r: { abd: 30 } }, 'thigh_r', undefined, 0, -1],
      [{ hip_l: { rot: 30 } }, 'thigh_l', F, 0, -1], [{ hip_r: { rot: 30 } }, 'thigh_r', F, 0, 1],
      [{ elbow_l: { flex: 30 } }, 'lowerarm_l', undefined, 2, 1], [{ elbow_r: { pron: 30 } }, 'lowerarm_r', F, 0, 1],
      [{ knee_r: { flex: 30 } }, 'calf_r', undefined, 2, -1], [{ ankle_l: { flex: 15 } }, 'foot_l', F, 1, 1],
      [{ ankle_l: { inv: 15 } }, 'foot_l', U, 0, -1], [{ ankle_r: { inv: 15 } }, 'foot_r', U, 0, 1],
      [{ wrist_l: { flex: 30 } }, 'hand_l', undefined, 2, 1], [{ wrist_l: { dev: 15 } }, 'hand_l', undefined, 0, 1],
      [{ wrist_r: { dev: 15 } }, 'hand_r', undefined, 0, -1],
      [{ lumbar: { flex: 20 } }, 'spine_01', undefined, 2, 1], [{ lumbar: { side: 20 } }, 'spine_01', undefined, 0, 1],
      [{ thoracic: { twist: 20 } }, 'spine_03', F, 0, 1], [{ neck: { turn: 20 } }, 'neck_01', F, 0, 1],
      [{ head: { flex: 20 } }, 'head', undefined, 2, 1],
    ];
    for (const [joints, b, v, c, sign] of checks) expect(Math.sign(dir(world(joints), b, v)[c]), JSON.stringify(joints)).toBe(sign);
    const Rw = world({}, { pitch: 10, roll: 10, yaw: 10 });
    expect(dir(Rw, 'pelvis', [0, 1, 0])[2]).toBeGreaterThan(0); // top forward
    expect(mv(Rw[0], [-1, 0, 0])[1]).toBeGreaterThan(0); // right hip up
    expect(mv(Rw[0], F)[0]).toBeGreaterThan(0); // turns left
  });

  it('thoracic splits half over spine_02 and spine_03', () => {
    const Rw = world({ thoracic: { flex: 30 } });
    close(Rw[bi('spine_02')], euler(0, 15), 1e-12);
    close(Rw[bi('spine_03')], euler(0, 30), 1e-12);
  });

  it('scapula follows elevation; the arm keeps its commanded direction (§2b.13)', () => {
    const cases: ['l' | 'r', Record<string, number>][] = [['l', { abd: 120 }], ['r', { flex: 150, abd: 20, rot: 10 }], ['l', { abd: 20 }]];
    for (const [s, sh] of cases) {
      const Rw = world({ [`shoulder_${s}`]: sh, [`scapula_${s}`]: { elev: 40 } });
      const want = jointRotation(`shoulder_${s}`, sh);
      close(Rw[bi(`upperarm_${s}`)], want, 1e-12);
      const e = Math.acos(want[4]) * 180 / Math.PI;
      const c = dir(Rw, `clavicle_${s}`), r = seg(`clavicle_${s}`); // elevation = rotation about frame Z from rest
      expect((Math.atan2(c[1], Math.abs(c[0])) - Math.atan2(r[1], Math.abs(r[0]))) * 180 / Math.PI).toBeCloseTo(Math.max(0, e - 30) / 3, 9);
    }
  });

  it('root is a delta; ground pins the lowest foot point (§2b.5)', () => {
    const p = mk({}, { y: 0.1, x: 0.02 });
    const f = sk.fk(p);
    close(sk.jointPosition(f, 'pelvis'), [sk.H[0][0] + 0.02, sk.H[0][1] + 0.1, sk.H[0][2]], 1e-12);
    const feet = ['foot_l', 'foot_r', 'ball_l', 'ball_r'].map(bi);
    const low = Math.min(...feet.flatMap((i) => [sk.H, sk.T].map((X) => mv(f.Rs[i], X[i])[1] + f.ts[i][1])));
    close(sk.ground({ ...p, pin: 'ground' }, f), [0, -low, 0], 5e-13);
    close(sk.ground({ ...p, pin: 'flat', pinAt: [0, 0.3, 0] }, f), [0, 0.3 - low, 0], 5e-13);
    expect(sk.ground(p, f)).toEqual([0, 0, 0]);
    const g = sk.posed({ ...p, pin: 'toeL' });
    expect(Math.min(...[sk.H, sk.T].map((X) => mv(g.Rs[bi('ball_l')], X[bi('ball_l')])[1] + g.ts[bi('ball_l')][1]))).toBeCloseTo(0, 12);
  });

  it('hands + pinAt hangs the left wrist (hand_l head) at pinAt', () => {
    const p: Pose = { ...mk({ shoulder_l: { abd: 165 }, shoulder_r: { abd: 165 } }), pin: 'hands', pinAt: [0.35, 2.15, 0] };
    close(sk.jointPosition(sk.posed(p), 'wrist_l'), [0.35, 2.15, 0], 1e-12);
  });

  it('fromPrototype passes toeL/toeR pins through', () => {
    expect(fromPrototype({ pin: 'toeL' }).pin).toBe('toeL');
    expect(fromPrototype({ pin: 'toeR' }).pin).toBe('toeR');
  });

  it('matches rig.py fk + ground within 1 mm (acceptance poses; hands, toes, toeL pins), both sexes', () => {
    expect(fixture.cases.map((c) => c.input.pin ?? 'none')).toEqual(expect.arrayContaining(['hands', 'toes', 'toeL']));
    expect(fixture.cases.length).toBe(12);
    for (const c of fixture.cases) {
      const s = createSkeleton(rig, c.sex);
      const f = s.posed(c.input);
      close(s.ground(c.input, s.fk(c.input)), c.ground, 5e-6);
      s.names.forEach((_, i) => {
        close(mv(f.Rs[i], s.H[i]).map((v, k) => v + f.ts[i][k]), c.heads[i], 1e-3);
        close(mv(f.Rs[i], s.T[i]).map((v, k) => v + f.ts[i][k]), c.tails[i], 1e-3);
      });
    }
  });

  it('solveLimb reaches a reachable wrist/ankle target within 1 mm, bends the right way', () => {
    for (const sex of ['male', 'female'] as const) {
      const s = createSkeleton(rig, sex);
      const goals: [Pose, 'arm_l' | 'arm_r' | 'leg_l' | 'leg_r', string, string][] = [
        [mk({ shoulder_l: { flex: 40, abd: 20, rot: 0 }, elbow_l: { flex: 60 } }), 'arm_l', 'wrist_l', 'elbow_l'],
        [mk({ shoulder_r: { flex: 20, abd: 10, rot: 0 }, elbow_r: { flex: 70 } }), 'arm_r', 'wrist_r', 'elbow_r'],
        [mk({ hip_l: { flex: 60, abd: 5, rot: 0 }, knee_l: { flex: 80 } }), 'leg_l', 'ankle_l', 'knee_l'],
        [mk({ hip_r: { flex: 30, abd: 0, rot: 0 }, knee_r: { flex: 45 } }), 'leg_r', 'ankle_r', 'knee_r'],
      ];
      for (const [goal, limb, endKey, midKey] of goals) {
        const target = s.jointPosition(s.fk(goal), endKey);
        const out = s.solveLimb(emptyPose(), limb, target, limits);
        close(s.jointPosition(s.fk(out), endKey), target, 1e-3);
        expect(out.joints[midKey].flex).toBeCloseTo(goal.joints[midKey].flex, 1);
      }
    }
  });

  it('solveLimb clamps an unreachable target to a straight limb along the target line', () => {
    const shoulder = sk.jointPosition(sk.fk(emptyPose()), 'hip_l');
    const out = sk.solveLimb(emptyPose(), 'leg_l', [shoulder[0], shoulder[1] - 3, shoulder[2] + 0.5], limits);
    expect(out.joints.knee_l.flex).toBeCloseTo(0, 6);
    expect(out.joints.hip_l.flex).toBeGreaterThan(0);
  });

});
