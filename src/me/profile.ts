export type Profile = { sex: 'male' | 'female'; heightCm: number; massKg: number };

const PROFILE_KEY = 'bodyModel.profile.v1';
const ADULT_KEY = 'bodyModel.adult.v1';

const inRange = (v: unknown, lo: number, hi: number): v is number =>
  typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;
const isSex = (v: unknown): v is Profile['sex'] => v === 'male' || v === 'female';

export function validateProfile(p: unknown): Profile | null {
  if (typeof p !== 'object' || p === null) return null;
  const { sex, heightCm, massKg } = p as Record<string, unknown>;
  if (!isSex(sex) || !inRange(heightCm, 100, 250) || !inRange(massKg, 25, 300)) return null;
  return { sex, heightCm, massKg };
}

export function loadProfile(s?: Storage): Profile | null {
  try {
    const raw = (s ?? globalThis.localStorage).getItem(PROFILE_KEY);
    return raw === null ? null : validateProfile(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function saveProfile(p: Profile, s?: Storage): boolean {
  const v = validateProfile(p);
  if (!v) return false;
  try {
    (s ?? globalThis.localStorage).setItem(PROFILE_KEY, JSON.stringify(v));
    return true;
  } catch {
    return false;
  }
}

export function profileErrors(v: { sex?: string; heightCm?: unknown; massKg?: unknown }): {
  sex?: string;
  height?: string;
  mass?: string;
} {
  const e: { sex?: string; height?: string; mass?: string } = {};
  if (!isSex(v.sex)) e.sex = 'Choose male or female.';
  if (!inRange(v.heightCm, 100, 250)) e.height = 'Height must be a number from 100 to 250 cm.';
  if (!inRange(v.massKg, 25, 300)) e.mass = 'Body mass must be a number from 25 to 300 kg.';
  return e;
}

export function isAdultConfirmed(s?: Storage): boolean {
  try {
    return (s ?? globalThis.localStorage).getItem(ADULT_KEY) === '1';
  } catch {
    return false;
  }
}

export function confirmAdult(s?: Storage): boolean {
  try {
    (s ?? globalThis.localStorage).setItem(ADULT_KEY, '1');
    return true;
  } catch {
    return false;
  }
}
