import { describe, expect, it } from 'vitest';
import { GRIP_N_PER_KG, gripRule } from './grip';
import { readFileSync } from 'node:fs';

const data = (f: string) => JSON.parse(readFileSync(`public/data/${f}.json`, 'utf8'));
const muscles = data('actions').muscles as Record<string, { rules?: string[] }>;
const inRange = (r: Record<string, number>) => Object.values(r).every((v) => v >= 0 && v <= 1);
const tagged = (r: Record<string, number>, tag: string) =>
  Object.keys(r).every((k) => muscles[k]?.rules?.includes(tag));
const all = (tag: string) => Object.keys(muscles).filter((k) => muscles[k].rules?.includes(tag));

describe('gripRule', () => {
  it('constant matches strengths.json', () => expect(GRIP_N_PER_KG).toBe(data('strengths').grip.NperKg));
  it('zero force gives nothing', () => expect(gripRule(0, 70, 'left')).toEqual({}));
  it('rises with force, falls with mass', () => {
    const m = 'Flexor carpi radialis';
    expect(gripRule(200, 70, 'left')[m]).toBeGreaterThan(gripRule(100, 70, 'left')[m]);
    expect(gripRule(200, 90, 'left')[m]).toBeLessThan(gripRule(200, 70, 'left')[m]);
    expect(gripRule(175, 70, 'left')[m]).toBeCloseTo(0.5, 6);
  });
  it('caps at 1', () => {
    const r = gripRule(1e6, 70, 'right');
    expect(inRange(r)).toBe(true);
    expect(r['Flexor carpi radialis']).toBe(1);
  });
  it('same on both sides, rejects mass <= 0', () => {
    expect(gripRule(100, 70, 'left')).toEqual(gripRule(100, 70, 'right'));
    expect(() => gripRule(100, 0, 'left')).toThrow(/massKg/);
  });
  it('keys match actions.json grip tag exactly', () => {
    const r = gripRule(100, 70, 'left');
    expect(tagged(r, 'grip')).toBe(true);
    expect(Object.keys(r).sort()).toEqual(all('grip').sort());
  });
});

