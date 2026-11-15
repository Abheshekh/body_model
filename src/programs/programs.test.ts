import { describe, expect, it } from 'vitest';
import type { Profile } from '../me/profile';
import { canOpen, parseRoute, visiblePrograms, type Program } from './programs';

const mk = (id: string, audience: Program['audience']): Program => ({
  id, title: id, audience, adultOnly: false, linkedConditions: [], cautions: [], notes: [], evidence: [], items: [],
});
const all = mk('a', 'all');
const m = mk('m', 'male');
const f = mk('f', 'female');
const progs = [all, m, f];
const male: Profile = { sex: 'male', heightCm: 170, massKg: 70 };
const female: Profile = { sex: 'female', heightCm: 170, massKg: 70 };

describe('visiblePrograms / canOpen', () => {
  it('male never sees the female program', () => {
    expect(visiblePrograms(progs, male).map((p) => p.id)).toEqual(['a', 'm']);
    expect(canOpen(f, male)).toBe(false);
    expect(canOpen(m, male)).toBe(true);
  });
  it('female never sees the male program', () => {
    expect(visiblePrograms(progs, female).map((p) => p.id)).toEqual(['a', 'f']);
    expect(canOpen(m, female)).toBe(false);
    expect(canOpen(f, female)).toBe(true);
  });
  it('null profile gets nothing', () => {
    expect(visiblePrograms(progs, null)).toEqual([]);
    expect(canOpen(all, null)).toBe(false);
  });
  it('all is visible to both', () => {
    expect(canOpen(all, male)).toBe(true);
    expect(canOpen(all, female)).toBe(true);
  });
});

describe('parseRoute', () => {
  it('routes programs with an id', () => {
    expect(parseRoute('#workouts/programs/pelvic-floor')).toEqual({ screen: 'programs', programId: 'pelvic-floor' });
  });
  it('routes workouts, the programs list, me, credits', () => {
    expect(parseRoute('#workouts')).toEqual({ screen: 'workouts' });
    expect(parseRoute('#workouts/programs')).toEqual({ screen: 'programs' });
    expect(parseRoute('#workouts/programs/')).toEqual({ screen: 'programs' });
    expect(parseRoute('#me')).toEqual({ screen: 'me' });
    expect(parseRoute('#me/credits')).toEqual({ screen: 'credits' });
  });
  it('defaults to body', () => {
    expect(parseRoute('#body')).toEqual({ screen: 'body' });
    expect(parseRoute('')).toEqual({ screen: 'body' });
    expect(parseRoute('#')).toEqual({ screen: 'body' });
    expect(parseRoute('#nonsense')).toEqual({ screen: 'body' });
  });
  it('old M1 routes are unknown now', () => {
    expect(parseRoute('#programs/pelvic-floor')).toEqual({ screen: 'body' });
    expect(parseRoute('#profile')).toEqual({ screen: 'body' });
    expect(parseRoute('#credits')).toEqual({ screen: 'body' });
  });
});
