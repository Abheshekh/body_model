import { describe, expect, it } from 'vitest';
import { armElevation, clampPose, emptyPose, fromPrototype, lerpPose, mirror, scapulaFromArm, splitSpine, type Limits, type Pose } from './pose';

const limits: Limits = { elbow_l: { flex: { min: 0, max: 150 } }, neck: { side: { min: -40, max: 40 } } };
const mk = (joints: Pose['joints'], root: Partial<Pose['root']> = {}): Pose => ({ root: { ...emptyPose().root, ...root }, joints });

describe('pose', () => {
  it('clamps axes to limits and leaves unlimited ones', () => {
    const p = clampPose(mk({ elbow_l: { flex: 200, pron: 500 }, neck: { side: -90 } }), limits);
    expect(p.joints.elbow_l.flex).toBe(150);
    expect(p.joints.elbow_l.pron).toBe(500);
    expect(p.joints.neck.side).toBe(-40);
  });
  it('lerps angles and root, missing axes count as 0', () => {
    const r = lerpPose(mk({ elbow_l: { flex: 0 } }, { y: 1 }), mk({ elbow_l: { flex: 100 }, knee_l: { flex: 60 } }, { y: 0 }), 0.25);
    expect(r.joints.elbow_l.flex).toBeCloseTo(25);
    expect(r.joints.knee_l.flex).toBeCloseTo(15);
    expect(r.root.y).toBeCloseTo(0.75);
  });
  it('mirrors: swaps sides, flips midline side/twist, root x/roll/yaw; twice is identity', () => {
    const p = mk({ shoulder_l: { flex: 10, abd: 30 }, neck: { flex: 5, side: 12, turn: 7 } }, { x: 0.1, roll: 4, yaw: 9, pitch: 3 });
    const m = mirror(p);
    expect(m.joints.shoulder_r).toEqual({ flex: 10, abd: 30 });
    expect(m.joints.shoulder_l).toBeUndefined();
    expect(m.joints.neck).toEqual({ flex: 5, side: -12, turn: -7 });
    expect(m.root).toMatchObject({ x: -0.1, roll: -4, yaw: -9, pitch: 3 });
    expect(mirror(m)).toEqual(p);
  });
  it('scapula rule', () => {
    expect(scapulaFromArm(0)).toBe(0);
    expect(scapulaFromArm(30)).toBe(0);
    expect(scapulaFromArm(90)).toBeCloseTo(20);
    expect(scapulaFromArm(180)).toBeCloseTo(50);
  });
  it('spine split 60/40', () => {
    expect(splitSpine(50)).toEqual({ lumbar: 30, thoracic: 20 });
  });
  it('fromPrototype: curl a and b (STAND = {})', () => {
    const a = fromPrototype({ elbow: 6 });
    const b = fromPrototype({ elbow: 140, shoulder: { flex: 8 } });
    expect(a.joints.elbow_l.flex).toBe(6);
    expect(a.joints.elbow_r.flex).toBe(6);
    expect(a.joints.shoulder_l).toEqual({ flex: 0, abd: 6, rot: 0 });
    expect(b.joints.elbow_l.flex).toBe(140);
    expect(b.joints.shoulder_r).toEqual({ flex: 8, abd: 6, rot: 0 });
    expect(a.root.pitch).toBe(0);
    expect(a.root.y).toBeCloseTo(0);
  });
  it('fromPrototype: SEAT', () => {
    const p = fromPrototype({ root: { y: 0.535, pitch: 0 }, hip: { flex: 90 }, knee: 90, pin: 'none', elbow: 6 });
    expect(p.root).toMatchObject({ pitch: 0 });
    expect(p.root.y).toBeCloseTo(0.535 - 0.965);
    expect(p.pin).toBe('none');
    expect(p.joints.hip_l.flex).toBe(90);
    expect(p.joints.hip_r.flex).toBe(90);
    expect(p.joints.knee_l.flex).toBe(90);
  });
  it('fromPrototype: per-side keys, spine split, derived pitch', () => {
    const p = fromPrototype({ spine: { flex: 50, twist: -10 }, elbowL: 20, elbow: 5, hip: { flex: 75 }, knee: 25, ankle: -8 });
    expect(p.joints.elbow_l.flex).toBe(20);
    expect(p.joints.elbow_r.flex).toBe(5);
    expect(p.joints.lumbar.flex).toBeCloseTo(30);
    expect(p.joints.thoracic.flex).toBeCloseTo(20);
    expect(p.joints.lumbar.twist).toBeCloseTo(-6);
    expect(p.root.pitch).toBe(75 - 25 + 8);
  });
  it('fromPrototype: calf raise ankle 36 -> flex -36, press rot 90 -> rot -90, no clamp needed', () => {
    const c = fromPrototype({ ankle: 36 });
    expect(c.joints.ankle_l.flex).toBe(-36);
    expect(c.joints.ankle_r.flex).toBe(-36);
    const pr = fromPrototype({ shoulder: { abd: 46, rot: 90 }, hipL: { rot: 20 } });
    expect(pr.joints.shoulder_l.rot).toBe(-90);
    expect(pr.joints.hip_l.rot).toBe(-20);
    const lim: Limits = { ankle_l: { flex: { min: -50, max: 30 } }, shoulder_l: { rot: { min: -100, max: 100 } } };
    expect(clampPose(c, lim).joints.ankle_l.flex).toBe(-36);
    expect(clampPose(pr, lim).joints.shoulder_l.rot).toBe(-90);
  });
  it('fromPrototype: root delta and pins', () => {
    const p = fromPrototype({ root: { y: 1.065 }, pin: 'hands', pinAt: [0.35, 2.15, 0] });
    expect(p.root.y).toBeCloseTo(0.1);
    expect(p.pin).toBe('hands');
    expect(p.pinAt).toEqual([0.35, 2.15, 0]);
    expect(fromPrototype({ pin: 'toeL' }).pin).toBeUndefined();
    expect(lerpPose(p, p, 0.5).pin).toBe('hands');
  });
  it('armElevation: angle from straight down, then scapula rule', () => {
    expect(armElevation(0, 0)).toBeCloseTo(0);
    expect(armElevation(90, 0)).toBeCloseTo(90);
    expect(armElevation(0, 170)).toBeCloseTo(170);
    expect(armElevation(90, 90)).toBeCloseTo(90);
    expect(scapulaFromArm(armElevation(0, 120))).toBeCloseTo(30);
  });
});
