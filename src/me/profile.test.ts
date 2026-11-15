import { describe, expect, it } from 'vitest';
import {
  confirmAdult,
  isAdultConfirmed,
  loadProfile,
  profileErrors,
  saveProfile,
  validateProfile,
} from './profile';

const fake = (): Storage => {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
  } as unknown as Storage;
};
const bad = {
  getItem: () => {
    throw new Error('no');
  },
  setItem: () => {
    throw new Error('no');
  },
} as unknown as Storage;
const ok = { sex: 'male', heightCm: 170, massKg: 70 } as const;

describe('validateProfile', () => {
  it('accepts valid and decimals', () => {
    expect(validateProfile(ok)).toEqual(ok);
    expect(validateProfile({ ...ok, heightCm: 170.5, massKg: 70.2 })).not.toBeNull();
  });
  it.each([99, 251, NaN, Infinity, -Infinity, '170'])('rejects height %s', (h) => {
    expect(validateProfile({ ...ok, heightCm: h })).toBeNull();
  });
  it.each([100, 250])('accepts height %s', (h) => {
    expect(validateProfile({ ...ok, heightCm: h })).not.toBeNull();
  });
  it.each([24, 301, NaN, Infinity, '70'])('rejects mass %s', (m) => {
    expect(validateProfile({ ...ok, massKg: m })).toBeNull();
  });
  it.each([25, 300])('accepts mass %s', (m) => {
    expect(validateProfile({ ...ok, massKg: m })).not.toBeNull();
  });
  it('rejects bad sex and non-objects', () => {
    expect(validateProfile({ ...ok, sex: 'other' })).toBeNull();
    expect(validateProfile({ ...ok, sex: undefined })).toBeNull();
    expect(validateProfile(null)).toBeNull();
    expect(validateProfile('x')).toBeNull();
  });
});

describe('load and save', () => {
  it('round trips', () => {
    const s = fake();
    expect(loadProfile(s)).toBeNull();
    expect(saveProfile(ok, s)).toBe(true);
    expect(loadProfile(s)).toEqual(ok);
  });
  it('invalid JSON or invalid stored values give null', () => {
    const s = fake();
    s.setItem('bodyModel.profile.v1', '{nope');
    expect(loadProfile(s)).toBeNull();
    s.setItem('bodyModel.profile.v1', JSON.stringify({ ...ok, heightCm: 5 }));
    expect(loadProfile(s)).toBeNull();
  });
  it('save refuses invalid profile', () => {
    const s = fake();
    expect(saveProfile({ ...ok, heightCm: 99 }, s)).toBe(false);
    expect(loadProfile(s)).toBeNull();
  });
  it('throwing storage: load null, save false', () => {
    expect(loadProfile(bad)).toBeNull();
    expect(saveProfile(ok, bad)).toBe(false);
  });
  it('default storage missing (node) does not throw', () => {
    expect(loadProfile()).toBeNull();
    expect(saveProfile(ok)).toBe(false);
  });
});

describe('profileErrors', () => {
  it('empty when valid', () => {
    expect(profileErrors(ok)).toEqual({});
  });
  it('one message per bad field', () => {
    const e = profileErrors({ sex: 'x', heightCm: 99, massKg: 301 });
    expect(e.sex).toBeTruthy();
    expect(e.height).toBeTruthy();
    expect(e.mass).toBeTruthy();
    expect(profileErrors({ ...ok, heightCm: 'abc' })).toEqual({ height: expect.any(String) });
    expect(profileErrors({ ...ok, massKg: NaN })).toEqual({ mass: expect.any(String) });
    expect(profileErrors({ heightCm: 170, massKg: 70 })).toEqual({ sex: expect.any(String) });
  });
});

describe('adult flag', () => {
  it('false until confirmed, then true', () => {
    const s = fake();
    expect(isAdultConfirmed(s)).toBe(false);
    expect(confirmAdult(s)).toBe(true);
    expect(isAdultConfirmed(s)).toBe(true);
    expect(s.getItem('bodyModel.adult.v1')).toBe('1');
  });
  it('throwing storage', () => {
    expect(isAdultConfirmed(bad)).toBe(false);
    expect(confirmAdult(bad)).toBe(false);
  });
  it('saving a profile does not reset the flag', () => {
    const s = fake();
    confirmAdult(s);
    saveProfile({ ...ok, sex: 'female' }, s);
    expect(isAdultConfirmed(s)).toBe(true);
  });
});
