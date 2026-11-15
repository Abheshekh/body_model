import { describe, expect, it } from 'vitest';
import type { Manifest, Part } from './load';
import { BodyState, defaultState, idsOfPlain, packsNeeded, revealFor, systemOf, visibility } from './state';

let n = 0;
const P = (o: Partial<Part>): Part => ({
  id: n++, name: 'x', plain: 'x', side: 'center', kind: 'muscle', region: 'r', system: 'Muscles', colour: '#fff', layer: 1, sex: 'both',
  ext: false, simplified: false, defaultHidden: false, pack: 'muscle', ...o,
});
const skin = P({ kind: 'skin', system: 'Skin', layer: null, pack: 'skin' });
const m1 = P({ layer: 1 });
const m3 = P({ layer: 3 });
const tendon = P({ kind: 'tendon', layer: 2, pack: 'tendon' });
const bone = P({ kind: 'bone', system: 'Skeleton', layer: null, pack: 'bone' });
const organ = P({ kind: 'organ', system: 'Digestive', layer: null, pack: 'organ' });
const heartOrgan = P({ kind: 'organ', system: 'Heart', layer: null, pack: 'organ' });
const vessel = P({ kind: 'vessel', system: 'Arteries', layer: null, pack: 'vessel' });
const nerve = P({ kind: 'nerve', system: 'Nerves', layer: null, pack: 'nerve' });
const penis = P({ kind: 'organ', system: 'Reproductive', layer: null, pack: 'organ', sex: 'male', ext: true });
const uterus = P({ kind: 'organ', system: 'Reproductive', layer: null, pack: 'organ', sex: 'female' });
const omentum = P({ kind: 'organ', system: 'Digestive', layer: null, pack: 'organ', defaultHidden: true });
const parts = [skin, m1, m3, tendon, bone, organ, heartOrgan, vessel, nerve, penis, uterus, omentum];
const packNames = ['skin', 'muscle', 'tendon', 'bone', 'organ', 'vessel', 'nerve', 'joint'];
const M = { parts, packs: packNames.map((name) => ({ name })) } as Manifest;
const st = (o: Partial<BodyState> = {}): BodyState => ({ ...defaultState(M, 'male'), ...o });

describe('defaults', () => {
  it('match the plan', () => {
    const s = defaultState(M, 'female');
    expect(s).toMatchObject({ sex: 'female', depth: 'skin', seeThrough: false, ghost: true, colour: 'natural', isolate: null });
    expect([...s.systems].sort()).toEqual(['organs', 'skeleton']);
    expect([...s.hidden]).toEqual([omentum.id]);
  });
});
describe('systemOf', () => {
  it('maps kinds', () => {
    expect(parts.map(systemOf)).toEqual(['skin', 'muscle', 'muscle', 'muscle', 'skeleton', 'organs', 'heart', 'heart', 'nerves', 'organs', 'organs', 'organs']);
  });
});
describe('visibility rules', () => {
  it('1 wrong sex hidden', () => {
    expect(visibility(penis, st({ depth: 1, sex: 'female' }))).toBe('hidden');
    expect(visibility(uterus, st({ depth: 1, sex: 'male' }))).toBe('hidden');
    expect(visibility(uterus, st({ depth: 1, sex: 'female' }))).toBe('shown');
  });
  it('2 isolate set wins over everything, bones stay as context', () => {
    const s = st({ depth: 1, isolate: new Set([m1.id]), hidden: new Set([m1.id]) });
    expect(visibility(m1, s)).toBe('shown');
    expect(visibility(m3, s)).toBe('hidden');
    expect(visibility(skin, s)).toBe('hidden');
    expect(visibility(bone, s)).toBe('shown');
    expect(visibility(bone, { ...s, systems: new Set() })).toBe('hidden');
    expect(visibility(organ, s)).toBe('hidden');
    expect(visibility(penis, st({ isolate: new Set([penis.id]), sex: 'female' }))).toBe('hidden');
  });
  it('3 hidden set', () => {
    expect(visibility(m1, st({ depth: 1, hidden: new Set([m1.id]) }))).toBe('hidden');
  });
  it('4 skin shown at skin or see-through, else hidden', () => {
    expect(visibility(skin, st())).toBe('shown');
    expect(visibility(skin, st({ depth: 3 }))).toBe('hidden');
    expect(visibility(skin, st({ depth: 3, seeThrough: true }))).toBe('shown');
  });
  it('5 opaque skin hides everything else', () => {
    for (const p of [m1, tendon, bone, organ, vessel]) expect(visibility(p, st({ systems: new Set(['organs', 'heart', 'skeleton']) }))).toBe('hidden');
  });
  it('6 external genitalia under opaque skin', () => {
    expect(visibility(penis, st())).toBe('hidden');
    expect(visibility(penis, st({ depth: 1 }))).toBe('shown');
  });
  it('7 muscle layers, ghost, see-through, bones', () => {
    expect(visibility(m3, st({ depth: 3 }))).toBe('shown');
    expect(visibility(m1, st({ depth: 3 }))).toBe('ghost');
    expect(visibility(m1, st({ depth: 3, ghost: false }))).toBe('hidden');
    expect(visibility(m1, st({ seeThrough: true }))).toBe('shown');
    expect(visibility(m3, st({ depth: 'bones' }))).toBe('ghost');
    expect(visibility(m3, st({ depth: 'bones', ghost: false }))).toBe('hidden');
    expect(visibility(tendon, st({ depth: 3 }))).toBe('ghost');
  });
  it('8 other kinds follow systems', () => {
    expect(visibility(organ, st({ depth: 1 }))).toBe('shown');
    expect(visibility(bone, st({ depth: 1 }))).toBe('shown');
    expect(visibility(bone, st({ depth: 1, systems: new Set() }))).toBe('hidden');
    expect(visibility(heartOrgan, st({ depth: 1 }))).toBe('hidden');
    expect(visibility(heartOrgan, st({ depth: 1, systems: new Set(['heart']) }))).toBe('shown');
    expect(visibility(nerve, st({ depth: 1, systems: new Set(['nerves']) }))).toBe('shown');
  });
  it('default-hidden omentum stays hidden', () => {
    expect(visibility(omentum, st({ depth: 1 }))).toBe('hidden');
  });
});
describe('packsNeeded', () => {
  it('skin only at defaults', () => {
    expect(packsNeeded(st(), M)).toEqual(['skin']);
  });
  it('nerves off then on', () => {
    expect(packsNeeded(st({ depth: 1 }), M)).not.toContain('nerve');
    expect(packsNeeded(st({ depth: 1, systems: new Set(['organs', 'skeleton', 'nerves']) }), M)).toContain('nerve');
  });
});
describe('revealFor', () => {
  it('layer-3 muscle sets depth 3 and unhides', () => {
    const r = revealFor(m3, st({ depth: 'skin', hidden: new Set([m3.id]) }));
    expect(r.depth).toBe(3);
    expect(r.hidden.has(m3.id)).toBe(false);
    expect(visibility(m3, r)).toBe('shown');
  });
  it('nerve turns its system on and leaves skin', () => {
    const s = st();
    const r = revealFor(nerve, s);
    expect(r.systems.has('nerves')).toBe(true);
    expect(r.depth).toBe(1);
    expect(visibility(nerve, r)).toBe('shown');
    expect(s.systems.has('nerves')).toBe(false); // input not mutated
  });
});
describe('isolate and idsOfPlain', () => {
  it('revealFor keeps an isolate that holds the part, clears otherwise', () => {
    expect(revealFor(m1, st({ isolate: new Set([m1.id, m3.id]) })).isolate).toEqual(new Set([m1.id, m3.id]));
    expect(revealFor(m1, st({ isolate: new Set([m3.id]) })).isolate).toBeNull();
  });
  it('idsOfPlain returns every id sharing the name', () => {
    const l = P({ plain: 'Biceps' }), r = P({ plain: 'Biceps' }), o = P({ plain: 'Triceps' });
    const mm = { parts: [l, r, o], packs: [] } as unknown as Manifest;
    expect(idsOfPlain(mm, 'Biceps')).toEqual([l.id, r.id]);
    expect(idsOfPlain(mm, 'none')).toEqual([]);
  });
});
