// Plan 2d (T9a blocker decisions): scaled root (A), floor contact for feet (B), braced balance skipped (E).
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { bodyGeometry } from '../engine/geometry';
import { engineData } from '../engine/effort';
import type { Sex } from '../engine/types';
import { fromPrototype, PROTO_ROOT_Y } from '../rig/pose';
import type { EquipmentJson, Item } from './equipment';
import { protoToPose } from './exercises';
import { checkContacts, formChecks, type FrameCtx } from './form';

const read = (f: string) => JSON.parse(readFileSync(`public/data/${f}`, 'utf8'));
const data = engineData({ rig: read('body/rig.json'), manifest: read('body/manifest.json'), segments: read('segments.json'), strengths: read('strengths.json'), actions: read('actions.json') });
const tables = { loads: read('loads.json'), supports: read('supports.json'), limits: read('joints.json').joints };
const SEXES: Sex[] = ['male', 'female'];
const scale = (sex: Sex) => { const k = data.skel[sex]; return k.H[k.names.indexOf('pelvis')][1] / PROTO_ROOT_Y; };

describe('protoToPose (2d.A)', () => {
  it('scales root x/y/z offsets and pinAt by s; joints as fromPrototype', () => {
    const proto = { root: { y: 0.5, z: 0.1, pitch: 10 }, pin: 'hands', pinAt: [0.3, 2, 0], elbow: 40 };
    const p = protoToPose(proto, 0.9), q = fromPrototype(proto);
    expect(p.root.y).toBeCloseTo((0.5 - PROTO_ROOT_Y) * 0.9, 12);
    expect(p.root.z).toBeCloseTo(0.09, 12);
    expect(p.root.pitch).toBe(10);
    expect(p.pinAt).toEqual([0.3 * 0.9, 2 * 0.9, 0]);
    expect(p.joints).toEqual(q.joints);
  });
  for (const sex of SEXES) {
    it(`a seated pin-none pelvis sits at root.y × s on both bodies (${sex})`, () => {
      const s = scale(sex), g = bodyGeometry(data.skel[sex], protoToPose({ root: { y: 0.5 }, pin: 'none' }, s), data.segments, 70, sex);
      expect(g.bones.pelvis.head[1]).toBeCloseTo(data.skel[sex].H[data.skel[sex].names.indexOf('pelvis')][1] * 0.5 / PROTO_ROOT_Y, 9);
    });
  }
});

const pad = { surfaces: [{ item: 'bench', name: 'pad', points: ['foot_l', 'foot_r', 'heel_l', 'heel_r'], point: [0, 0.45, -1] as [number, number, number],
  normal: [0, 1, 0] as [number, number, number], u: [0, 0, 1] as [number, number, number], v: [1, 0, 0] as [number, number, number], extent: [0.3, 0.15] as [number, number] }], colliders: [], grips: [] };
const ctx = (sex: Sex, more: Partial<FrameCtx>): FrameCtx => ({
  sex, pose: fromPrototype({}), frame: 0, rec: { id: 't', props: [], formChecks: [] }, data, tables,
  placed: { surfaces: [], colliders: [], grips: [] }, loads: [], supports: tables.supports.pins.default, held: [], ...more,
});

describe('checkContacts floor rule (2d.B)', () => {
  for (const sex of SEXES) {
    it(`feet on the floor pass although the bench lists foot points; lifted feet fail (${sex})`, () => {
      expect(checkContacts(ctx(sex, { placed: pad }))!.ok).toBe(true);
      const up = checkContacts(ctx(sex, { placed: pad, pose: fromPrototype({ pin: 'toes', pinAt: [0, 0.1, 0] }) }))!;
      expect(up.ok).toBe(false);
      expect(up.value).toBeGreaterThan(0.03);
    });
    it(`the floor does not carry a pelvis point (${sex})`, () => {
      const r = checkContacts(ctx(sex, { placed: { ...pad, surfaces: [{ ...pad.surfaces[0], points: ['pelvis'] }] }, supports: [{ point: 'pelvis', normal: [0, 1, 0] }] }))!;
      expect(r.ok).toBe(false);
    });
  }
});

describe('braced balance (2d.E)', () => {
  const noEq: EquipmentJson = { sources: [], items: [] as Item[], objects: [], equipmentProps: {} };
  for (const sex of SEXES) {
    it(`pin none on a seat skips balance; standing and pin none without a brace keep it (${sex})`, () => {
      const seated = { id: 'x', props: ['seat'], keyframes: [{ pin: 'none', root: { y: 0.5 }, hip: { flex: 90 }, knee: 90 }, { pin: 'none', root: { y: 0.5 }, hip: { flex: 90 }, knee: 90, elbow: 90 }], formChecks: [], equipment: [] };
      expect(formChecks(seated, sex, data, tables, noEq).map((r) => r.id)).not.toContain('balance');
      expect(formChecks({ ...seated, props: [] }, sex, data, tables, noEq).find((r) => r.id === 'balance')).toMatchObject({ ok: false });
      expect(formChecks({ ...seated, keyframes: [{}, { elbow: 90 }] }, sex, data, tables, noEq).map((r) => r.id)).toContain('balance');
    });
  }
});
