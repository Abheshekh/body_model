import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { engineData } from '../engine/effort';
import type { Support } from '../engine/types';
import type { Pose } from '../rig/pose';
import type { EquipmentJson } from './equipment';
import { editChecks, EDITS_KEY, insertKey, loadVersion, moveKey, removeKey, revertVersion, saveVersion, versionKey, type Store, type Version } from './edits';

const pose = (flex = 0): Pose => ({ root: { x: 0, y: 0, z: 0, pitch: 0, roll: 0, yaw: 0 }, joints: { elbow_l: { flex } } });
const memory = (): Store & { data: Map<string, string> } => {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
};
const broken: Store = { getItem: () => { throw new Error('SecurityError'); }, setItem: () => { throw new Error('QuotaExceededError'); } };
const version = (): Version => ({ keyframes: [pose(0), pose(90)], supports: [[], []], kg: { bar: 20 } });

describe('keyframe list edits', () => {
  it('insertKey puts the new keyframe after the current one', () => {
    expect(insertKey(['a', 'b'], 0, 'x')).toEqual(['a', 'x', 'b']);
    expect(insertKey(['a', 'b'], 1, 'x')).toEqual(['a', 'b', 'x']);
  });
  it('removeKey keeps at least 2 keyframes', () => {
    expect(removeKey(['a', 'b', 'c'], 1)).toEqual(['a', 'c']);
    const two = ['a', 'b'];
    expect(removeKey(two, 0)).toBe(two);
    expect(removeKey(['a', 'b', 'c'], 5)).toEqual(['a', 'b', 'c']);
  });
  it('moveKey reorders; out of range leaves the list as it is', () => {
    expect(moveKey(['a', 'b', 'c'], 0, 2)).toEqual(['b', 'c', 'a']);
    expect(moveKey(['a', 'b', 'c'], 2, 1)).toEqual(['a', 'c', 'b']);
    const l = ['a', 'b'];
    expect(moveKey(l, 1, 2)).toBe(l);
    expect(moveKey(l, -1, 0)).toBe(l);
  });
  it('does not change the list it was given', () => {
    const l = ['a', 'b', 'c'];
    insertKey(l, 0, 'x');
    removeKey(l, 0);
    moveKey(l, 0, 2);
    expect(l).toEqual(['a', 'b', 'c']);
  });
});

describe('My version (bodyModel.edits.v1)', () => {
  it('save, load and revert by <kind>/<id>', () => {
    const s = memory(), key = versionKey('exercises', 'bench-press');
    expect(key).toBe('exercises/bench-press');
    expect(loadVersion(s, key)).toBeNull();
    expect(saveVersion(s, key, version())).toBe(true);
    expect(saveVersion(s, 'tasks/custom', { ...version(), kg: {} })).toBe(true);
    expect(Object.keys(JSON.parse(s.data.get(EDITS_KEY)!))).toEqual([key, 'tasks/custom']);
    expect(loadVersion(s, key)).toEqual(version());
    expect(revertVersion(s, key)).toBe(true);
    expect(loadVersion(s, key)).toBeNull();
    expect(loadVersion(s, 'tasks/custom')).not.toBeNull(); // other versions stay
  });
  it('a storage that throws: nothing saved, nothing loaded, no exception', () => {
    expect(saveVersion(broken, 'exercises/x', version())).toBe(false);
    expect(loadVersion(broken, 'exercises/x')).toBeNull();
    expect(revertVersion(broken, 'exercises/x')).toBe(false);
    expect(saveVersion(null, 'exercises/x', version())).toBe(false);
    expect(loadVersion(null, 'exercises/x')).toBeNull();
  });
  it('unreadable or malformed entries load as null', () => {
    const s = memory();
    s.setItem(EDITS_KEY, '{not json');
    expect(loadVersion(s, 'exercises/x')).toBeNull();
    for (const bad of [{ ...version(), keyframes: [pose()] }, { ...version(), supports: [[]] }, { ...version(), keyframes: [pose(), {}] }, { keyframes: [pose(), pose()], supports: [[], []] }]) {
      s.setItem(EDITS_KEY, JSON.stringify({ 'exercises/x': bad }));
      expect(loadVersion(s, 'exercises/x')).toBeNull();
    }
  });
});

describe('editChecks: supports per keyframe', () => {
  const read = (f: string) => JSON.parse(readFileSync(`public/data/${f}`, 'utf8'));
  const data = engineData({ rig: read('body/rig.json'), manifest: read('body/manifest.json'), segments: read('segments.json'), strengths: read('strengths.json'), actions: read('actions.json') });
  const tables = { loads: read('loads.json'), supports: read('supports.json'), limits: read('joints.json').joints };
  const noEq: EquipmentJson = { sources: [], items: [], objects: [], equipmentProps: {} };
  const feet: Support[] = tables.supports.pins.default;
  const rec = { id: 'test', props: [], loads: [], equipment: [], placement: {} };
  const keys = [pose(10), pose(60)];

  it('both keyframes on the feet: balance passes', () => {
    const rows = editChecks(rec, keys, [feet, feet], 'male', data, tables, noEq);
    expect(rows.map((r) => r.id)).toEqual(['limits', 'balance', 'clearance']);
    expect(rows.find((r) => r.id === 'balance')!.ok).toBe(true);
  });
  it('keyframe 0 without supports fails balance at frame 0 only (in-betweens use keyframe 1\'s supports)', () => {
    const b = editChecks(rec, keys, [[], feet], 'female', data, tables, noEq).find((r) => r.id === 'balance')!;
    expect(b).toMatchObject({ ok: false, frame: 0 });
  });
  it('keyframe 1 without supports: the in-betweens fail too, the first failing frame is reported', () => {
    const b = editChecks(rec, keys, [feet, []], 'male', data, tables, noEq).find((r) => r.id === 'balance')!;
    expect(b).toMatchObject({ ok: false, frame: 0.25 });
  });
});
