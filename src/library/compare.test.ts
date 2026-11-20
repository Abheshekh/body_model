import { describe, expect, it } from 'vitest';
import type { EffortResult } from '../engine/types';
import { compareWords, type PartNames } from './compare';

const parts: PartNames = new Map([[1, { plain: 'Quadriceps', side: 'left' }], [2, { plain: 'Rectus abdominis', side: 'center' }]]);
const res = (levels: Record<number, number>, nm = 50, over = true): EffortResult => ({
  jointDemand: {}, warnings: [], lowerBack: { momentNm: nm, level: 0 }, balance: { comOverFeet: over, margin: 0 },
  muscle: Object.fromEntries(Object.entries(levels).map(([k, v]) => [k, { level: v, role: 'work' as const, reasons: [] }])),
});

describe('compareWords', () => {
  it('rise and fall with sides', () => {
    expect(compareWords(res({ 1: 0.1 }), res({ 1: 0.7 }), parts)[0]).toBe('Quadriceps (left) rises from low to high');
    expect(compareWords(res({ 2: 0.6 }), res({ 2: 0.2 }), parts)[0]).toBe('Rectus abdominis falls from high to low');
  });
  it('no change', () => {
    expect(compareWords(res({ 1: 0.3 }), res({ 1: 0.35 }), parts)).toEqual(['No muscle changes by more than 10%']);
  });
  it('lumbar line', () => {
    expect(compareWords(res({}, 62), res({}, 31), parts)).toContain('Lower back: 62 → 31 Nm (−50%)');
  });
  it('balance line', () => {
    expect(compareWords(res({}), res({}, 50, false), parts).some((l) => l.startsWith('Balance'))).toBe(true);
  });
});
