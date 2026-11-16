import { describe, expect, it } from 'vitest';
import { bracingRule } from './bracing';
import { readFileSync } from 'node:fs';

const data = (f: string) => JSON.parse(readFileSync(`public/data/${f}.json`, 'utf8'));
const muscles = data('actions').muscles as Record<string, { rules?: string[] }>;
const inRange = (r: Record<string, number>) => Object.values(r).every((v) => v >= 0 && v <= 1);
const tagged = (r: Record<string, number>, tag: string) =>
  Object.keys(r).every((k) => muscles[k]?.rules?.includes(tag));
const all = (tag: string) => Object.keys(muscles).filter((k) => muscles[k].rules?.includes(tag));

describe('bracingRule', () => {
  it('zero moment gives nothing', () => expect(bracingRule(0, 200)).toEqual({}));
  it('rises with moment', () =>
    expect(bracingRule(100, 200)['Transversus abdominis muscle']).toBeGreaterThan(bracingRule(50, 200)['Transversus abdominis muscle']));
  it('caps at 1', () => {
    const r = bracingRule(1e6, 200);
    expect(inRange(r)).toBe(true);
    expect(r['Transversus abdominis muscle']).toBe(1);
  });
  it('rejects strength <= 0', () => expect(() => bracingRule(10, 0)).toThrow(/lumbarStrengthNm/));
  it('keys match actions.json bracing tag exactly', () => {
    const r = bracingRule(100, 200);
    expect(tagged(r, 'bracing')).toBe(true);
    expect(Object.keys(r).sort()).toEqual(all('bracing').sort());
  });
});
