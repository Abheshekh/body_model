import { describe, expect, it } from 'vitest';
import { scapulaRule } from './scapula';
import { readFileSync } from 'node:fs';

const data = (f: string) => JSON.parse(readFileSync(`public/data/${f}.json`, 'utf8'));
const muscles = data('actions').muscles as Record<string, { rules?: string[] }>;
const inRange = (r: Record<string, number>) => Object.values(r).every((v) => v >= 0 && v <= 1);
const tagged = (r: Record<string, number>, tag: string) =>
  Object.keys(r).every((k) => muscles[k]?.rules?.includes(tag));
const all = (tag: string) => Object.keys(muscles).filter((k) => muscles[k].rules?.includes(tag));

describe('scapulaRule', () => {
  it('zero input gives nothing', () => expect(scapulaRule(0, 0, 'left')).toEqual({}));
  it('rises with elevation and with load', () => {
    const m = 'Serratus anterior muscle';
    expect(scapulaRule(120, 0, 'left')[m]).toBeGreaterThan(scapulaRule(60, 0, 'left')[m]);
    const l = 'Levator scapulae';
    expect(scapulaRule(0, 200, 'left')[l]).toBeGreaterThan(scapulaRule(0, 100, 'left')[l]);
  });
  it('caps at 1', () => {
    const r = scapulaRule(1000, 1e6, 'right');
    expect(inRange(r)).toBe(true);
    expect(Math.max(...Object.values(r))).toBe(1);
  });
  it('same on both sides', () => expect(scapulaRule(90, 50, 'left')).toEqual(scapulaRule(90, 50, 'right')));
  it('keys match actions.json scapula tag exactly', () => {
    const r = scapulaRule(90, 50, 'left');
    expect(tagged(r, 'scapula')).toBe(true);
    expect(Object.keys(r).sort()).toEqual(all('scapula').sort());
  });
});

