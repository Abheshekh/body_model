import { describe, expect, it } from 'vitest';
import type { Part as BodyPart } from './load';
import { PELVIC_FLOOR, fitDistance, flyDistance, highlightPlan, viewOffset, visibleFraction } from './model';

describe('flyDistance', () => {
  it('floors at 0.35', () => {
    expect(flyDistance(0.05, 30)).toBe(0.35);
  });
  it('scales with radius', () => {
    expect(flyDistance(1, 30)).toBeCloseTo(4.636, 3);
  });
});

describe('viewOffset', () => {
  it('phone sheet inset', () => {
    expect(viewOffset({ w: 390, h: 844 }, { top: 44, right: 0, bottom: 338, left: 0 })).toEqual({ x: 0, y: 147 });
  });
  it('desktop side panel inset', () => {
    expect(viewOffset({ w: 1280, h: 800 }, { top: 44, right: 420, bottom: 0, left: 0 })).toEqual({ x: 210, y: -22 });
  });
});

describe('visibleFraction', () => {
  it('phone sheet inset', () => {
    expect(visibleFraction({ w: 390, h: 844 }, { top: 44, right: 0, bottom: 338, left: 0 })).toBeCloseTo(462 / 844, 4);
  });
  it('desktop side panel inset', () => {
    expect(visibleFraction({ w: 1280, h: 800 }, { top: 44, right: 420, bottom: 0, left: 0 })).toBe(0.671875);
  });
  it('clamps to 0.2', () => {
    expect(visibleFraction({ w: 390, h: 844 }, { top: 44, right: 0, bottom: 900, left: 0 })).toBe(0.2);
  });
});

describe('fitDistance', () => {
  it('half fraction doubles the distance', () => {
    expect(fitDistance(0.1, 30, 0.5)).toBeCloseTo(2 * flyDistance(0.1, 30), 10);
  });
  it('fraction below 0.2 is clamped', () => {
    expect(fitDistance(0.1, 30, 0.05)).toBeCloseTo(5 * flyDistance(0.1, 30), 10);
  });
});

describe('highlightPlan', () => {
  const bp = (id: number, plain: string, kind: string, layer: number | null): BodyPart => ({
    id, name: plain, plain, side: 'center', kind, region: '', system: '', colour: '#ffffff', layer,
    sex: 'both', ext: false, simplified: false, defaultHidden: false, pack: kind,
  });
  const parts = [
    bp(0, 'Rectus abdominis muscle', 'muscle', 1),
    bp(1, 'Rectus abdominis muscle', 'muscle', 1),
    bp(2, 'Transversus abdominis muscle', 'muscle', 3),
    bp(3, 'Pubococcygeus muscle', 'muscle', 4),
    bp(4, 'Gluteus maximus muscle', 'muscle', 1),
    bp(5, 'Femur', 'bone', null),
  ];
  const z: Record<number, number | null> = { 0: 0.1, 1: 0.1, 2: 0.08, 3: 0, 4: -0.1, 5: null };
  const centreZ = (id: number) => z[id];
  it('both sides share a plain name', () => {
    const r = highlightPlan(parts, ['Rectus abdominis muscle'], centreZ);
    expect(r.ids).toEqual([0, 1]);
    expect(r.depth).toBe(1);
    expect(r.facing).toBe('front');
  });
  it('depth is the min layer of the muscle targets', () => {
    expect(highlightPlan(parts, ['Transversus abdominis muscle'], centreZ).depth).toBe(3);
    expect(highlightPlan(parts, ['Transversus abdominis muscle', 'Rectus abdominis muscle'], centreZ).depth).toBe(1);
    expect(highlightPlan(parts, ['Femur'], centreZ).depth).toBeNull();
  });
  it('posterior target faces back', () => {
    expect(highlightPlan(parts, ['Gluteus maximus muscle'], centreZ).facing).toBe('back');
  });
  it('pelvic floor list', () => {
    const r = highlightPlan(parts, PELVIC_FLOOR, centreZ);
    expect(r.pelvic).toBe(true);
    expect(r.ids).toEqual([3]);
    expect(r.missing).toEqual(['Pubo-analis muscle', 'Iliococcygeus muscle', 'Coccygeus muscle', 'External anal sphincter']);
  });
  it('a non-pelvic name in the list is not pelvic', () => {
    expect(highlightPlan(parts, ['Pubococcygeus muscle', 'Gluteus maximus muscle'], centreZ).pelvic).toBe(false);
  });
  it('empty names', () => {
    const r = highlightPlan(parts, [], centreZ);
    expect(r.ids).toEqual([]);
    expect(r.pelvic).toBe(false);
    expect(r.depth).toBeNull();
    expect(r.facing).toBe('front');
  });
  it('unknown name', () => {
    expect(highlightPlan(parts, ['nope'], centreZ).missing).toEqual(['nope']);
  });
});
