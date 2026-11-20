import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { bodyGeometry } from '../engine/geometry';
import { engineData } from '../engine/effort';
import type { Sex } from '../engine/types';
import { fromPrototype, lerpPose, PROTO_ROOT_Y, type Pose } from '../rig/pose';
import type { EquipmentJson, Item } from './equipment';
import type { Exercise } from './exercises';
import { checkBalance, checkClearance, checkContacts, checkKneeOverFoot, checkLimits, checkNeutralSpine, formChecks, type FrameCtx } from './form';

const read = (f: string) => JSON.parse(readFileSync(`public/data/${f}`, 'utf8'));
const data = engineData({ rig: read('body/rig.json'), manifest: read('body/manifest.json'), segments: read('segments.json'), strengths: read('strengths.json'), actions: read('actions.json') });
const tables = { loads: read('loads.json'), supports: read('supports.json'), limits: read('joints.json').joints };
const eq: EquipmentJson = read('equipment.json'); // pass fixtures only (the migrated records use it)
const records: Exercise[] = read('exercises.json').exercises;
const record = (id: string) => records.find((e) => e.id === id)!;
const SEXES: Sex[] = ['male', 'female'];
const ids = (rows: { id: string }[]) => rows.map((r) => r.id);

// synthetic fixtures: inline poses, inline equipment
const noEq: EquipmentJson = { sources: [], items: [], objects: [], equipmentProps: {} };
const pose = (joints: Pose['joints'] = {}, root: Partial<Pose['root']> = {}, pin: Pose['pin'] = 'toes'): Pose =>
  ({ root: { x: 0, y: 0, z: 0, pitch: 0, roll: 0, yaw: 0, ...root }, joints, pin });
const ctx = (sex: Sex, p: Pose, more: Partial<FrameCtx> = {}): FrameCtx => ({
  sex, pose: p, frame: 0, rec: { id: 'test', props: [], formChecks: [] }, data, tables,
  placed: { surfaces: [], colliders: [], grips: [] }, loads: [], supports: tables.supports.pins.default, held: [], ...more,
});
const geo = (sex: Sex, p: Pose) => bodyGeometry(data.skel[sex], p, data.segments, 70, sex);
const item = (id: string, kind: Item['kind'], model: string, colliders: Item['colliders'], grip?: Item['grip']): Item =>
  ({ id, name: id, kind, parts: { model, dims: {}, source: 'test' }, at: [0, 0, 0], yaw: 0, surfaces: [], colliders, grip, source: 'test', licence: 'test' });
const synthetic = (keyframes: Exercise['keyframes'], equipment: string[] = []) =>
  ({ id: 'synthetic', props: [], keyframes, formChecks: [], equipment });

describe('formChecks on the migrated records (pass fixtures)', () => {
  for (const sex of SEXES) {
    it(`barbell-curl passes every check (${sex})`, () => {
      const rows = formChecks({ ...record('barbell-curl'), formChecks: [{ id: 'kneeOverFoot' }, { id: 'neutralSpine' }] }, sex, data, tables, eq);
      expect(ids(rows)).toEqual(['limits', 'balance', 'clearance', 'kneeOverFoot', 'neutralSpine']); // no surface carries a support: contacts left out
      for (const r of rows) expect(r.ok, `${r.id}: ${r.words}`).toBe(true);
    });
    it(`back-squat passes limits, clearance and neutralSpine (${sex})`, () => {
      // balance and knee tracking of the migrated pose are T9a's to fix (R4 bucket-style faults)
      const rows = formChecks({ ...record('back-squat'), formChecks: [{ id: 'neutralSpine' }] }, sex, data, tables, eq);
      for (const id of ['limits', 'clearance', 'neutralSpine']) expect(rows.find((r) => r.id === id)?.ok, id).toBe(true);
    });
    it(`pattern checks run only when the record lists them (${sex})`, () => {
      expect(ids(formChecks(record('barbell-curl'), sex, data, tables, eq))).toEqual(['limits', 'balance', 'clearance']);
    });
  }
});

describe('formChecks rows', () => {
  for (const sex of SEXES) {
    it(`one row per check, at its worst frame (${sex})`, () => {
      const max = tables.limits.elbow_l.flex.max;
      const rows = formChecks(synthetic([{ elbow: 6 }, { elbow: max + 20 }]), sex, data, tables, noEq);
      expect(new Set(ids(rows)).size).toBe(rows.length);
      const lim = rows.find((r) => r.id === 'limits')!;
      expect(lim).toMatchObject({ ok: false, frame: 1, limit: 0.5 });
      expect(lim.value).toBeCloseTo(20, 6);
      expect(lim.words).toMatch(/elbow/);
    });
    it(`in-betweens are checked: a block only the mid-swing hand reaches fails at frame 0.5 (${sex})`, () => {
      const a = { shoulder: { flex: 0 } }, b = { shoulder: { flex: 160 } };
      const skel = data.skel[sex], s = skel.H[skel.names.indexOf('pelvis')][1] / PROTO_ROOT_Y;
      const hand = geo(sex, lerpPose(fromPrototype(a), fromPrototype(b), 0.5)).point('hand_l');
      const block = item('block', 'fixed', 'x', [{ name: 'box', box: { center: hand.map((x) => x / s) as [number, number, number], size: [0.1, 0.1, 0.1] } }]);
      const r = formChecks(synthetic([a, b], ['block']), sex, data, tables, { ...noEq, items: [block] }).find((x) => x.id === 'clearance')!;
      expect(r).toMatchObject({ ok: false, frame: 0.5 });
      expect(r.words).toMatch(/block box/);
    });
    it(`a resolved record brings its own supports (${sex})`, () => {
      const rows = formChecks({ keyframes: [pose(), pose()], props: [], loads: [], supports: [] }, sex, data, tables, noEq);
      expect(rows.find((r) => r.id === 'balance')).toMatchObject({ ok: false, words: 'Nothing supports the body here.' });
    });
    it(`a fixed inline item through the body fails clearance (${sex})`, () => {
      const wall = item('wall', 'fixed', 'x', [{ name: 'slab', box: { center: [0, 1.2, 0], size: [1, 0.2, 1] } }]);
      const rows = formChecks(synthetic([{}, {}], ['wall']), sex, data, tables, { ...noEq, items: [wall] });
      expect(rows.find((r) => r.id === 'clearance')).toMatchObject({ ok: false, limit: 0.02 });
      expect(rows.find((r) => r.id === 'clearance')!.words).toMatch(/wall slab/);
    });
    for (const model of ['barbell', 'dumbbell']) {
      it(`a hand-held ${model} follows the hands: big plates hit the floor, small ones clear it (${sex})`, () => {
        const held = (r: number) => ({ ...noEq, items: [item('weight', 'handheld', model, [{ name: 'plate', capsule: { a: [-0.2, 0, 0], b: [0.2, 0, 0], r } }],
          [{ name: 'hand_l', point: [0.2, 0, 0] }, { name: 'hand_r', point: [-0.2, 0, 0] }])] });
        const big = formChecks(synthetic([{}, {}], ['weight']), sex, data, tables, held(1.2)).find((r) => r.id === 'clearance')!;
        expect(big).toMatchObject({ ok: false, limit: 0.01 });
        expect(big.words).toMatch(/weight plate .* below the floor/);
        expect(formChecks(synthetic([{}, {}], ['weight']), sex, data, tables, held(0.1)).find((r) => r.id === 'clearance')!.ok).toBe(true);
      });
    }
  }
});

describe('checkLimits', () => {
  for (const sex of SEXES) {
    it(`pass inside the range and within 0.5° past it; fail beyond (${sex})`, () => {
      const max = tables.limits.elbow_l.flex.max;
      expect(checkLimits(ctx(sex, pose({ elbow_l: { flex: 90 } })))!.ok).toBe(true);
      expect(checkLimits(ctx(sex, pose({ elbow_l: { flex: max + 0.4 } })))!.ok).toBe(true);
      const r = checkLimits(ctx(sex, pose({ elbow_l: { flex: max + 5 } })))!;
      expect(r.ok).toBe(false);
      expect(r.value).toBeCloseTo(5, 6);
      expect(r.words).toMatch(/left elbow flex/);
    });
    it(`root pitch is checked against pelvis (${sex})`, () => {
      expect(checkLimits(ctx(sex, pose({}, { pitch: tables.limits.pelvis.pitch.max + 10 })))!.ok).toBe(false);
    });
  }
});

describe('checkBalance', () => {
  for (const sex of SEXES) {
    it(`pass standing; fail with 40 kg held at arm's length (${sex})`, () => {
      const r = checkBalance(ctx(sex, pose()));
      expect(r.ok).toBe(true);
      expect(r.value).toBeGreaterThan(0);
      const arms = pose({ shoulder_l: { flex: 90 }, shoulder_r: { flex: 90 } });
      const f = checkBalance(ctx(sex, arms, { loads: [{ id: 'x', kind: 'free', kg: 40, at: 'hands' }] }));
      expect(f).toMatchObject({ ok: false, limit: -0.02 });
      expect(f.value).toBeLessThan(-0.02);
      expect(f.words).toMatch(/outside the supports/);
    });
  }
});

describe('checkContacts', () => {
  for (const sex of SEXES) {
    const stool = (dy: number) => {
      const P = geo(sex, pose()).point('pelvis');
      return { surfaces: [{ item: 'stool', name: 'top', points: ['pelvis'], point: [P[0], P[1] + dy, P[2]] as [number, number, number],
        normal: [0, 1, 0] as [number, number, number], u: [0, 0, 1] as [number, number, number], v: [1, 0, 0] as [number, number, number], extent: [0.2, 0.2] as [number, number] }], colliders: [], grips: [] };
    };
    const sit = [{ point: 'pelvis' as const, normal: [0, 1, 0] as [number, number, number] }];
    it(`pass on the surface, fail 10 cm off it (${sex})`, () => {
      const r = checkContacts(ctx(sex, pose(), { placed: stool(0), supports: sit }))!;
      expect(r.ok).toBe(true);
      expect(r.value).toBeCloseTo(0, 6);
      const f = checkContacts(ctx(sex, pose(), { placed: stool(-0.1), supports: sit }))!;
      expect(f).toMatchObject({ ok: false, limit: 0.03 });
      expect(f.value).toBeCloseTo(0.1, 6);
      expect(f.words).toMatch(/pelvis is 10 cm off the stool top/);
    });
    it(`left out when no surface carries a support point (${sex})`, () => {
      expect(checkContacts(ctx(sex, pose(), { placed: stool(0) }))).toBeNull(); // supports = feet
    });
  }
});

describe('checkClearance', () => {
  for (const sex of SEXES) {
    it(`pass standing clear; fail inside a collider, below the floor, or a held item below the floor (${sex})`, () => {
      expect(checkClearance(ctx(sex, pose())).ok).toBe(true);
      const chest = geo(sex, pose()).bones.spine_03.head;
      const box = { item: 'block', name: 'box', box: { center: chest, half: [0.1, 0.1, 0.1] as [number, number, number], axes: [[1, 0, 0], [0, 1, 0], [0, 0, 1]] as [[number, number, number], [number, number, number], [number, number, number]] } };
      const inside = checkClearance(ctx(sex, pose(), { placed: { surfaces: [], colliders: [box], grips: [] } }));
      expect(inside).toMatchObject({ ok: false, limit: 0.02 });
      expect(inside.value).toBeCloseTo(0.1, 6);
      const sunk = checkClearance(ctx(sex, pose({}, { y: -0.1 }, 'none')));
      expect(sunk).toMatchObject({ ok: false, limit: 0.01 });
      expect(sunk.words).toMatch(/below the floor/);
      const held = { item: 'bucket', name: 'body', capsule: { a: [0, 0, 0] as [number, number, number], b: [0, 0, 0] as [number, number, number], r: 0.05 } };
      const r = checkClearance(ctx(sex, pose(), { held: [held] }));
      expect(r).toMatchObject({ ok: false, limit: 0.01 });
      expect(r.value).toBeCloseTo(0.05, 6);
      expect(r.words).toMatch(/bucket body is 5 cm below the floor/);
    });
  }
});

describe('checkKneeOverFoot', () => {
  for (const sex of SEXES) {
    it(`pass standing and in a straight squat; fail when the shin swings out under the knee (${sex})`, () => {
      expect(checkKneeOverFoot(ctx(sex, pose())).ok).toBe(true);
      const squat = pose({ hip_l: { flex: 90 }, hip_r: { flex: 90 }, knee_l: { flex: 90 }, knee_r: { flex: 90 } }, { pitch: 0 });
      expect(checkKneeOverFoot(ctx(sex, squat)).ok).toBe(true);
      const f = checkKneeOverFoot(ctx(sex, pose({ hip_l: { flex: 60, rot: 30 }, knee_l: { flex: 90 } })));
      expect(f).toMatchObject({ ok: false, limit: 0.03 });
      expect(f.value).toBeGreaterThan(0.03);
      expect(f.words).toMatch(/left knee/);
    });
  }
});

describe('checkNeutralSpine', () => {
  for (const sex of SEXES) {
    it(`pass at 10°, fail at 30° (default 20°), pass at 30° with maxLumbarFlex 35 (${sex})`, () => {
      expect(checkNeutralSpine(ctx(sex, pose({ lumbar: { flex: 10 } }))).ok).toBe(true);
      expect(checkNeutralSpine(ctx(sex, pose({ lumbar: { flex: 30 } })))).toMatchObject({ ok: false, value: 30, limit: 20 });
      expect(checkNeutralSpine(ctx(sex, pose({ lumbar: { flex: 30 } })), { maxLumbarFlex: 35 })).toMatchObject({ ok: true, limit: 35 });
    });
  }
});
