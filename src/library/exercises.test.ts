import { describe, expect, it } from 'vitest';
import { legacyId, loadExercises, search, validateExercises, type Exercise } from './exercises';

const rec = (id: string, o: Partial<Exercise> = {}): Exercise => ({
  id, name: id, family: id, aliases: [], pattern: 'curl', posture: 'standing', equipment: ['bodyweight'], bodyParts: ['Arms'],
  props: [], keyframes: [{}, {}], cues: [], mistakes: [], formChecks: [], sources: ['test'], reviewed: false, ...o,
});
const list = [
  rec('barbell-curl', { name: 'Barbell curl', aliases: ['Biceps curl'], equipment: ['barbell'] }),
  rec('hammer-curl', { name: 'Hammer curl', equipment: ['dumbbell'] }),
  rec('overhead-press', { name: 'Overhead press', aliases: ['Développé militaire'], pattern: 'press', bodyParts: ['Shoulders'], equipment: ['barbell'] }),
  rec('seated-dumbbell-press', { name: 'Seated dumbbell press', pattern: 'press', posture: 'seated', bodyParts: ['Shoulders', 'Arms'], equipment: ['dumbbell', 'bench'] }),
];
const ids = (l: Exercise[]) => l.map((e) => e.id);

describe('search', () => {
  it('matches name and alias, case and accent insensitive', () => {
    expect(ids(search(list, 'BICEPS'))).toEqual(['barbell-curl']);
    expect(ids(search(list, 'developpe'))).toEqual(['overhead-press']);
    expect(ids(search(list, '  curl '))).toEqual(['barbell-curl', 'hammer-curl']);
    expect(ids(search(list, ''))).toEqual(ids(list));
  });
  it('filters: OR within a group, AND across groups', () => {
    expect(ids(search(list, '', { equipment: ['barbell', 'bench'] }))).toEqual(['barbell-curl', 'overhead-press', 'seated-dumbbell-press']);
    expect(ids(search(list, '', { pattern: ['press'], equipment: ['dumbbell'] }))).toEqual(['seated-dumbbell-press']);
    expect(ids(search(list, '', { bodyPart: ['Arms'], posture: ['standing'] }))).toEqual(['barbell-curl', 'hammer-curl']);
    expect(ids(search(list, 'press', { pattern: [] }))).toEqual(['overhead-press', 'seated-dumbbell-press']);
  });
  it('empty result', () => {
    expect(search(list, 'zzz')).toEqual([]);
    expect(search(list, 'curl', { posture: ['hanging'] })).toEqual([]);
  });
});

describe('legacyId', () => {
  it('maps old exercise/variant links (2b.1); no variant = the family first way', () => {
    expect(legacyId('curl', 'seat')).toBe('seated-dumbbell-curl');
    expect(legacyId('plank', 'front')).toBe('plank');
    expect(legacyId('curl')).toBe('barbell-curl');
    expect(legacyId('rocket', 'x')).toBeUndefined();
  });
});

describe('loadExercises / validateExercises', () => {
  const tables = {
    loads: { props: { bar: [{ at: 'hands' as const, kind: 'free' as const, kg: 20 }], handle: [{ at: 'hands' as const, kind: 'cable' as const, kg: 10 }, { at: 'hands' as const, kind: 'cable' as const, kg: 10 }] }, none: ['seat'] },
    supports: { pins: {}, props: { seat: [] }, none: [] },
  };
  const equipment = { items: [{ id: 'barbell' }, { id: 'bench' }], objects: [{ id: 'chair' }] };
  const json = (...exercises: Exercise[]) => ({ sources: ['test'], version: 2, exercises });

  it('loadExercises rejects a v1 file', () => {
    expect(() => loadExercises({ sources: [], exercises: [] })).toThrow(/version 2/);
    expect(loadExercises(json(rec('a')))).toHaveLength(1);
  });
  it('a valid record passes', () => {
    expect(validateExercises(json(rec('a', { equipment: ['barbell', 'bench'], props: ['bar', 'seat'], loads: { bar: 30 },
      formChecks: [{ id: 'neutralSpine', params: { maxLumbarFlex: 20 } }] })), tables, equipment)).toEqual([]);
  });
  it('unknown prop, pattern, posture, equipment, load id, form check each fail', () => {
    const bad = (o: object) => validateExercises(json(rec('x', o as Partial<Exercise>)), tables, equipment);
    expect(bad({ props: ['rocket'] })).toEqual(['x: unknown prop "rocket"']);
    expect(bad({ pattern: 'juggle' })).toEqual(['x: unknown pattern "juggle"']);
    expect(bad({ posture: 'upside-down' })).toEqual(['x: unknown posture "upside-down"']);
    expect(bad({ equipment: ['treadmill'] })).toEqual(['x: unknown equipment "treadmill"']);
    expect(bad({ props: ['handle'], loads: { handle: 5 } })).toEqual(['x: unknown load "handle"']); // two entries: handle#0, handle#1
    expect(bad({ props: ['handle'], loads: { 'handle#1': 5 } })).toEqual([]);
    expect(bad({ formChecks: [{ id: 'kneesUp' }] })).toEqual(['x: unknown form check "kneesUp"']);
    expect(bad({ keyframes: [{}] })).toEqual(['x: fewer than 2 keyframes']);
    expect(validateExercises(json(rec('a'), rec('a')), tables, equipment)).toEqual(['a: duplicate id']);
  });
});
