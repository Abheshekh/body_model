import { describe, expect, it } from 'vitest';
import { PELVIC_FLOOR, fitDistance, flyDistance, highlightPlan, layerOf, mixColor, parseLayersParam, partIdsByName, searchParts, viewOffset, visibleFraction, type Kind, type Part } from './model';

const mk = (id: string, name: string, plainName: string, kind: Kind, layer: Part['layer'] = null): Part => ({
  id, name, plainName, kind, side: 'center', layer, muscleKey: null, triangles: 1, center: [0, 0, 0],
});

describe('layerOf', () => {
  it('maps every kind', () => {
    expect(layerOf(mk('a', 'skin', 'Skin', 'skin'))).toBe('skin');
    expect(layerOf(mk('a', 'liver', 'Liver', 'organ'))).toBe('organs');
    expect(layerOf(mk('a', 'femur', 'Femur', 'bone'))).toBe('skeleton');
    expect(layerOf(mk('a', 'x cartilage', 'X', 'cartilage'))).toBe('skeleton');
    expect(layerOf(mk('a', 'm', 'M', 'muscle', 'superficial'))).toBe('superficialMuscles');
    expect(layerOf(mk('a', 'm', 'M', 'muscle', 'deep'))).toBe('deepMuscles');
    expect(layerOf(mk('a', 't', 'T', 'tendon', 'superficial'))).toBe('superficialMuscles');
    expect(layerOf(mk('a', 't', 'T', 'tendon', 'deep'))).toBe('deepMuscles');
  });
});

describe('searchParts', () => {
  const parts = [
    mk('1', 'left femur', 'Thigh bone (femur), left', 'bone'),
    mk('2', 'left biceps brachii', 'Biceps, left', 'muscle', 'superficial'),
    mk('3', 'right biceps brachii', 'Biceps, right', 'muscle', 'superficial'),
    mk('4', 'biceps femoris tendon', 'Hamstrings (biceps femoris) tendon', 'tendon', 'deep'),
    mk('5', 'skin', 'Skin', 'skin'),
    mk('6', 'biceps bone', 'Biceps bone', 'bone'),
  ];
  it('empty query returns nothing', () => {
    expect(searchParts(parts, '')).toEqual([]);
    expect(searchParts(parts, '   ')).toEqual([]);
  });
  it('puts muscles first and finds both sides', () => {
    const r = searchParts(parts, 'biceps');
    expect(r.map((p) => p.id)).toEqual(['4', '2', '3', '6']);
  });
  it('matches multiple tokens', () => {
    expect(searchParts(parts, 'brachii left').map((p) => p.id)).toEqual(['2']);
  });
  it('never returns skin', () => {
    expect(searchParts(parts, 'skin')).toEqual([]);
  });
  it('respects the limit', () => {
    expect(searchParts(parts, 'biceps', 2)).toHaveLength(2);
  });
  it('returns [] when nothing matches', () => {
    expect(searchParts(parts, 'zzz')).toEqual([]);
  });
});

describe('mixColor', () => {
  it('level 0 gives base and 1 gives target', () => {
    expect(mixColor(0x102030, 0xffffff, 0)).toBe(0x102030);
    expect(mixColor(0x102030, 0xffffff, 1)).toBe(0xffffff);
  });
  it('mixes at the midpoint with rounding', () => {
    expect(mixColor(0x000000, 0x010101, 0.5)).toBe(0x010101);
    expect(mixColor(0x000000, 0xff0000, 0.5)).toBe(0x800000);
  });
  it('clamps the level', () => {
    expect(mixColor(0x102030, 0xffffff, -1)).toBe(0x102030);
    expect(mixColor(0x102030, 0xffffff, 2)).toBe(0xffffff);
  });
});

describe('parseLayersParam', () => {
  it('null gives null', () => {
    expect(parseLayersParam(null)).toBeNull();
  });
  it('keeps only known keys', () => {
    expect(parseLayersParam('skin,bogus')).toEqual(new Set(['skin']));
  });
});

describe('flyDistance', () => {
  it('floors at 0.35', () => {
    expect(flyDistance(0.05, 30)).toBe(0.35);
  });
  it('scales with radius', () => {
    expect(flyDistance(1, 30)).toBeCloseTo(4.636, 3);
  });
});

describe('partIdsByName', () => {
  const parts = [
    mk('1', 'left coccygeus', 'Coccygeus, left', 'muscle', 'deep'),
    mk('2', 'right coccygeus', 'Coccygeus, right', 'muscle', 'deep'),
    mk('3', 'external anal sphincter', 'External anal sphincter', 'muscle', 'deep'),
    mk('4', 'coccygeus tendon', 'Other', 'tendon', 'deep'),
  ];
  it('matches both sides', () => {
    expect(partIdsByName(parts, ['coccygeus']).ids).toEqual(['1', '2']);
  });
  it('matches an exact name', () => {
    expect(partIdsByName(parts, ['external anal sphincter']).ids).toEqual(['3']);
  });
  it('reports unknown names as missing', () => {
    expect(partIdsByName(parts, ['coccygeus', 'nope'])).toEqual({ ids: ['1', '2'], missing: ['nope'] });
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
  const at = (p: Part, z: number): Part => ({ ...p, center: [0, 0, z] });
  const parts = [
    at(mk('a', 'left rectus abdominis', 'Abs', 'muscle', 'superficial'), 0.1),
    at(mk('b', 'transversus abdominis', 'TA', 'muscle', 'deep'), 0.08),
    at(mk('c', 'pubococcygeus', 'PC', 'muscle', 'deep'), 0),
    at(mk('d', 'left gluteus maximus', 'Glute', 'muscle', 'superficial'), -0.1),
    at(mk('e', 'left femur', 'Femur', 'bone'), 0),
  ];
  it('deep only target sees through superficial', () => {
    const r = highlightPlan(parts, ['transversus abdominis']);
    expect(r.layers).toEqual(['deepMuscles']);
    expect(r.seeThroughSuperficial).toBe(true);
    expect(r.pelvic).toBe(false);
  });
  it('superficial front target', () => {
    const r = highlightPlan(parts, ['rectus abdominis']);
    expect(r.ids).toEqual(['a']);
    expect(r.seeThroughSuperficial).toBe(false);
    expect(r.facing).toBe('front');
  });
  it('posterior target faces back', () => {
    expect(highlightPlan(parts, ['gluteus maximus']).facing).toBe('back');
  });
  it('pelvic floor list', () => {
    const r = highlightPlan(parts, PELVIC_FLOOR);
    expect(r.pelvic).toBe(true);
    expect(r.seeThroughSuperficial).toBe(false);
    expect(r.missing).toEqual(['puborectalis', 'iliococcygeus', 'coccygeus', 'external anal sphincter']);
  });
  it('empty names', () => {
    const r = highlightPlan(parts, []);
    expect(r.ids).toEqual([]);
    expect(r.pelvic).toBe(false);
    expect(r.facing).toBe('front');
  });
  it('unknown name', () => {
    expect(highlightPlan(parts, ['nope']).missing).toEqual(['nope']);
  });
});
