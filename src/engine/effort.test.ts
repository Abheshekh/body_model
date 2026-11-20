import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { emptyPose, type Pose } from '../rig/pose';
import { effort, effortOverMove, engineData } from './effort';
import { muscleLevels, resolveAction } from './muscles';
import { setupVariant } from './setup';
import type { Load, Sex } from './types';

const read = (f: string) => JSON.parse(readFileSync(`public/data/${f}`, 'utf8'));
const json = { rig: read('body/rig.json'), manifest: read('body/manifest.json'), segments: read('segments.json'), strengths: read('strengths.json'), actions: read('actions.json') };
const data = engineData(json);
const tables = { loads: read('loads.json'), supports: read('supports.json') };
const feet = tables.supports.pins.default;
const ids = (plain: string, side?: string) => data.parts.filter((p) => p.plain === plain && (!side || p.side === side)).map((p) => p.id);
const pose = (joints: Pose['joints']): Pose => ({ ...emptyPose(), joints, pin: 'toes' });

describe('engineData', () => {
  it('keeps muscle parts only, with both skeletons', () => {
    expect(data.parts.length).toBe(json.manifest.parts.filter((p: { kind: string }) => p.kind === 'muscle').length);
    expect(Object.keys(data.skel).sort()).toEqual(['female', 'male']);
  });
  it('throws on an action with an unknown joint axis', () => {
    const bad = { ...json, actions: { muscles: { X: { actions: [['elbow', 'twist', '+', 1] as [string, string, '+', number]] } } } };
    expect(() => engineData(bad)).toThrow(/unknown joint axis elbow.twist/);
  });
});

describe('resolveAction (§2b.1)', () => {
  it('paired joints by side; a center part acts on both', () => {
    expect(resolveAction('elbow', '+', 'left')).toEqual([['elbow_l', '+']]);
    expect(resolveAction('elbow', '-', 'right')).toEqual([['elbow_r', '-']]);
    expect(resolveAction('hip', '+', 'center')).toEqual([['hip_l', '+'], ['hip_r', '+']]);
  });
  it('ipsi = toward own side (+ = body left), contra the reverse; center ipsi both, contra none', () => {
    expect(resolveAction('lumbar', 'ipsi', 'left')).toEqual([['lumbar', '+']]);
    expect(resolveAction('lumbar', 'ipsi', 'right')).toEqual([['lumbar', '-']]);
    expect(resolveAction('neck', 'contra', 'left')).toEqual([['neck', '-']]);
    expect(resolveAction('neck', 'contra', 'right')).toEqual([['neck', '+']]);
    expect(resolveAction('neck', 'ipsi', 'center')).toEqual([['neck', '+'], ['neck', '-']]);
    expect(resolveAction('neck', 'contra', 'center')).toEqual([]);
  });
});

describe('muscleLevels', () => {
  const parts = [{ id: 1, plain: 'Long head of biceps brachii', side: 'left' as const }, { id: 2, plain: 'Nope', side: 'left' as const }];
  const none = { scapula: { left: {}, right: {} }, grip: { left: {}, right: {} }, bracing: {} };
  it('level = max over actions of demand × weight, capped at 1; reasons strongest first; unmodelled left out', () => {
    const demand = { elbow_l: { flex: { plus: 0.5, minus: 0 }, pron: { plus: 0, minus: 1 } } };
    const r = muscleLevels(parts, data.actions, demand, none, { elbow_l: 6 });
    expect(r[1].level).toBeCloseTo(0.7, 9); // pron − 1 × 0.7 beats flex + 0.5 × 1
    expect(r[1].reasons[0]).toEqual({ kind: 'joint', joint: 'elbow_l', axis: 'pron', dir: '-', demand: 1, loadKg: 6 });
    expect(r[1].weight).toBe(0.7);
    expect(r[2]).toBeUndefined();
    expect(muscleLevels(parts, data.actions, { elbow_l: { flex: { plus: 3, minus: 0 } } }, none)[1].level).toBe(1);
  });
  it('rule levels by side', () => {
    const p = [{ id: 1, plain: 'Flexor digitorum profundus', side: 'right' as const }];
    const rules = { ...none, grip: { left: { 'Flexor digitorum profundus': 0.9 }, right: { 'Flexor digitorum profundus': 0.4 } } };
    const r = muscleLevels(p, data.actions, {}, rules);
    expect(r[1].level).toBe(0.4);
    expect(r[1].reasons[0]).toEqual({ kind: 'rule', rule: 'grip', value: 0.4 });
  });
});

describe('setupVariant (loads.json, supports.json)', () => {
  it('free load from the prop table, kg override by id, default pin = flat feet', () => {
    const s = setupVariant('barbell-curl', ['bar'], undefined, tables, { bar: 30 });
    expect(s.loads).toEqual([{ id: 'bar', kind: 'free', kg: 30, at: 'hands' }]);
    expect(s.supports).toEqual(tables.supports.pins.default);
  });
  it('cable direction by variant; seat and back contacts; variantProps add floor contacts', () => {
    expect(setupVariant('lat-pulldown', ['seat', 'handle'], 'none', tables).loads[0].toward).toEqual([0, 1, 0]);
    const seat = setupVariant('seated-dumbbell-curl', ['seat', 'back', 'dbL', 'dbR'], 'none', tables);
    expect(seat.supports.map((x) => x.point)).toEqual(['pelvis', 'thigh_l', 'thigh_r', 'thoraxBack']);
    expect(seat.loads.map((l) => [l.id, l.at, l.kg])).toEqual([['dbL', 'hand_l', 8], ['dbR', 'hand_r', 8]]);
    expect(setupVariant('plank', [], 'toes', tables).supports.map((x) => x.point)).toEqual(['foot_l', 'foot_r', 'forearm_l', 'forearm_r']);
  });
  it('duplicate contacts count once; unknown prop or pin throws', () => {
    expect(setupVariant('pull-up', ['pullbar'], 'hands', tables).supports.length).toBe(2);
    expect(() => setupVariant('x', ['rocket'], undefined, tables)).toThrow(/Unknown prop/);
    expect(() => setupVariant('x', [], 'moon', tables)).toThrow(/Unknown pin/);
  });
});

describe.each(['male', 'female'] as Sex[])('effort (%s)', (sex) => {
  const curl = pose({ elbow_l: { flex: 90 }, elbow_r: { flex: 90 } });
  const bar: Load[] = [{ id: 'bar', kind: 'free', kg: 20, at: 'hands' }];

  it('result shape: part-id keys, levels 0..1, both sides equal on a symmetric pose', () => {
    const r = effort({ pose: curl, sex, loads: bar, supports: feet }, data);
    for (const m of Object.values(r.muscle)) expect(m.level >= 0 && m.level <= 1).toBe(true);
    const [l] = ids('Brachialis muscle', 'left'), [rt] = ids('Brachialis muscle', 'right');
    expect(r.muscle[l].level).toBeGreaterThan(0.2);
    expect(r.muscle[l].level).toBeCloseTo(r.muscle[rt].level, 2); // the female rig is not exactly mirror-symmetric
    expect(r.muscle[l].level).toBeCloseTo(Math.min(1, r.jointDemand.elbow_l.flex.plus), 9);
    expect(r.warnings).toEqual([]);
  });
  it('demand = torque / strength; lower back level = moment / lumbar extension strength', () => {
    const r = effort({ pose: curl, sex, massKg: 80, loads: bar, supports: feet }, data);
    expect(r.lowerBack.level).toBeCloseTo(r.lowerBack.momentNm / (json.strengths.strengths.lumbar.flex['-'] * 80), 9);
    const heavier = effort({ pose: curl, sex, massKg: 80, loads: [{ ...bar[0], kg: 40 }], supports: feet }, data);
    expect(heavier.jointDemand.elbow_l.flex.plus).toBeGreaterThan(r.jointDemand.elbow_l.flex.plus);
  });
  it('mass ≤ 0 throws; no support is a warning', () => {
    expect(() => effort({ pose: curl, sex, massKg: 0, loads: [], supports: feet }, data)).toThrow(/mass/);
    const r = effort({ pose: curl, sex, loads: [], supports: [] }, data);
    expect(r.warnings.length).toBe(1);
    expect(r.balance.comOverFeet).toBe(false);
  });
  it('grip and scapula rules fire from the hand load; bracing from the lumbar moment', () => {
    const r = effort({ pose: curl, sex, loads: bar, supports: feet }, data);
    const level = (p: string) => Math.max(...ids(p).map((i) => r.muscle[i].level));
    expect(level('Flexor digitorum profundus')).toBeGreaterThan(0);
    expect(level('Levator scapulae')).toBeGreaterThan(0);
    expect(level('Transversus abdominis muscle')).toBeGreaterThan(0);
    const empty = effort({ pose: pose({}), sex, loads: [], supports: feet }, data);
    expect(Math.max(...ids('Flexor digitorum profundus').map((i) => empty.muscle[i].level))).toBeCloseTo(0, 9); // no grip; wrist gravity ~0
  });
  it('load words on a pose that names no joints (Move rest pose)', () => {
    const r = effort({ pose: pose({}), sex, loads: [{ id: 'hands', kind: 'free', kg: 10, at: 'hands' }], supports: feet }, data);
    const kg = Object.values(r.muscle).flatMap((m) => m.reasons).find((x) => x.kind === 'joint' && x.joint === 'elbow_l');
    expect(kg && kg.kind === 'joint' && kg.loadKg).toBeCloseTo(5, 9);
  });
  it('effortOverMove: peak levels over 9 samples are ≥ either end', () => {
    const a = pose({ elbow_l: { flex: 0 }, elbow_r: { flex: 0 } }), b = pose({ elbow_l: { flex: 140 }, elbow_r: { flex: 140 } });
    const input = { sex, loads: bar, supports: feet };
    const m = effortOverMove(a, b, input, data);
    const [id] = ids('Brachialis muscle', 'left');
    const ra = effort({ ...input, pose: a }, data), rb = effort({ ...input, pose: b }, data);
    const mid = effort({ ...input, pose: pose({ elbow_l: { flex: 87.5 }, elbow_r: { flex: 87.5 } }) }, data);
    expect(m.muscle[id].level).toBeGreaterThanOrEqual(Math.max(ra.muscle[id].level, rb.muscle[id].level, mid.muscle[id].level) - 1e-12);
    expect(m.muscle[id].role).toBe('work');
    expect(m.lowerBack.momentNm).toBeGreaterThanOrEqual(Math.max(ra.lowerBack.momentNm, rb.lowerBack.momentNm));
    expect(() => effortOverMove(a, b, input, data, 0)).toThrow(/samples/);
  });
});
