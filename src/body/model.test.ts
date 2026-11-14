import { describe, expect, it } from 'vitest';
import { flyDistance, layerOf, mixColor, parseLayersParam, searchParts, type Kind, type Part } from './model';

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
