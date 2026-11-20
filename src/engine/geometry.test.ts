import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createSkeleton, type Rig } from '../rig/skeleton';
import { emptyPose } from '../rig/pose';
import { bodyGeometry, norm, pointBone, sub } from './geometry';
import type { Segments, Sex } from './types';

const read = (f: string) => JSON.parse(readFileSync(`public/data/${f}`, 'utf8'));
const rig: Rig = read('body/rig.json');
const segs: Segments = read('segments.json').segments;

describe.each(['male', 'female'] as Sex[])('bodyGeometry (%s)', (sex) => {
  const skel = createSkeleton(rig, sex);
  const g = bodyGeometry(skel, { ...emptyPose(), pin: 'ground' }, segs, 70, sex);

  it('segment masses sum to body mass; every segment mass sits on one of its bones', () => {
    expect(Object.values(g.bones).reduce((a, b) => a + b.mass, 0)).toBeCloseTo(70, 9);
    for (const s of Object.values(segs)) expect(s.bones.some((b) => g.bones[b].mass > 0)).toBe(true);
    expect(g.bones.clavicle_l.mass).toBe(0);
  });

  it('mass <= 0 and unknown joints throw', () => {
    expect(() => bodyGeometry(skel, emptyPose(), segs, 0, sex)).toThrow(/mass/);
    expect(() => bodyGeometry(skel, emptyPose(), segs, -5, sex)).toThrow(/mass/);
    expect(() => g.distal('knuckle_l')).toThrow(/Unknown joint/);
  });

  it('distal sets: own bone first; shoulder excludes the clavicle; thoracic carries head and arms', () => {
    expect(g.distal('elbow_l')).toEqual(['lowerarm_l', 'hand_l']);
    expect(g.distal('shoulder_r')).toEqual(['upperarm_r', 'lowerarm_r', 'hand_r']);
    expect(g.distal('ankle_l')).toEqual(['foot_l', 'ball_l']);
    const th = g.distal('thoracic');
    expect(th[0]).toBe('spine_02');
    for (const b of ['spine_03', 'head', 'clavicle_l', 'hand_r']) expect(th).toContain(b);
    expect(th).not.toContain('spine_01');
    expect(g.distal('lumbar')[0]).toBe('spine_01');
  });

  it('joint centres: first bone head (thoracic = spine_02 head)', () => {
    expect(g.joint('thoracic')).toEqual(g.bones.spine_02.head);
    expect(g.joint('elbow_r')).toEqual(g.bones.lowerarm_r.head);
  });

  it('body points (2b.3)', () => {
    const s = skel.H[skel.names.indexOf('pelvis')][1] / 0.965;
    const h = g.bones.hand_l;
    expect(norm(sub(g.point('hand_l'), h.head))).toBeCloseTo(0.06 * s, 9);
    const hands = g.point('hands'), l = g.point('hand_l'), r = g.point('hand_r');
    hands.forEach((v, i) => expect(v).toBeCloseTo((l[i] + r[i]) / 2, 12));
    expect(g.point('foot_r')).toEqual(g.bones.ball_r.head);
    expect(g.point('shoulder_l')).toEqual(g.bones.upperarm_l.head);
    expect(g.point('pelvis')[1]).toBeCloseTo(g.bones.pelvis.head[1] - 0.08, 9);
    expect(g.point('thoraxBack')[2]).toBeLessThan(g.bones.spine_03.head[2]); // behind the spine
    const heel = g.point('heel_l');
    expect(heel[2]).toBeLessThan(g.bones.foot_l.head[2]); // behind the ankle
    expect(heel[1]).toBe(g.bones.ball_l.head[1]);
    // 2b.5 points: offsets in the bone frame (+z forward)
    const off = (p: Parameters<typeof g.point>[0], bone: string, from: number[], z: number) => {
      const d = sub(g.point(p), from as [number, number, number]);
      const R = g.bones[bone].Rw;
      expect(d[0] * R[2] + d[1] * R[5] + d[2] * R[8]).toBeCloseTo(z, 9); // along the bone's z
      expect(norm(d)).toBeCloseTo(Math.abs(z), 9);
    };
    const sp = g.bones.spine_03, spMid = sp.head.map((v, i) => (v + sp.tail[i]) / 2);
    off('hipsFront', 'pelvis', g.bones.pelvis.head, 0.1);
    // pelvisBack (R5 2d.C): 8 cm along the pelvis' -z and 4 cm down its -y
    const pb = sub(g.point('pelvisBack'), g.bones.pelvis.head), P = g.bones.pelvis.Rw;
    expect(pb[0] * P[2] + pb[1] * P[5] + pb[2] * P[8]).toBeCloseTo(-0.08, 9);
    expect(pb[0] * P[1] + pb[1] * P[4] + pb[2] * P[7]).toBeCloseTo(-0.04, 9);
    expect(pointBone('pelvisBack')).toBe('pelvis');
    off('chest', 'spine_03', spMid, 0.12);
    off('shoulderBack', 'spine_03', sp.head, -0.12);
    for (const k of ['l', 'r']) {
      off(`knee_${k}` as 'knee_l', `calf_${k}`, g.bones[`calf_${k}`].head, 0.05);
      expect(g.point(`elbow_${k}` as 'elbow_l')).toEqual(g.joint(`elbow_${k}`));
    }
    // grounded: the lowest foot point at y = 0
    expect(Math.min(g.bones.ball_l.head[1], g.bones.ball_l.tail[1], g.bones.foot_l.head[1], g.bones.foot_l.tail[1])).toBeCloseTo(0, 9);
  });
});
