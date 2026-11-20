// Keyframe editor logic (R5 R7): keyframe list edits (at least 2 kept), "My version" on the device only
// (localStorage bodyModel.edits.v1, keyed <kind>/<id>; the storage is injected and may throw), and the form checks of
// an edited sequence with its supports per keyframe. Pure: no three.js, no DOM.
import type { EngineData } from '../engine/effort';
import type { Load, Sex, Support } from '../engine/types';
import { lerpPose, type Pose } from '../rig/pose';
import type { EquipmentJson, Placement } from './equipment';
import type { Exercise } from './exercises';
import { formChecks, type CheckId, type CheckResult, type FormTables } from './form';

export const EDITS_KEY = 'bodyModel.edits.v1';
export const MIN_KEYS = 2;
/** a saved version: Pose keyframes, the supports of each keyframe, kg by load id */
export interface Version { keyframes: Pose[]; supports: Support[][]; kg: Record<string, number> }
export type Store = Pick<Storage, 'getItem' | 'setItem'>;

export const versionKey = (kind: string, id: string) => `${kind}/${id}`;

/** `item` inserted after index i */
export const insertKey = <T>(list: T[], i: number, item: T): T[] => [...list.slice(0, i + 1), item, ...list.slice(i + 1)];
/** index i removed; the list unchanged when that would leave fewer than 2 or i is out of range */
export const removeKey = <T>(list: T[], i: number): T[] =>
  (list.length <= MIN_KEYS || i < 0 || i >= list.length ? list : list.filter((_, j) => j !== i));
/** the entry at `from` moved to `to`; the list unchanged when either is out of range */
export function moveKey<T>(list: T[], from: number, to: number): T[] {
  if (from < 0 || to < 0 || from >= list.length || to >= list.length) return list;
  const out = [...list];
  out.splice(to, 0, ...out.splice(from, 1));
  return out;
}

const readAll = (store: Store | null): Record<string, unknown> => {
  try {
    const d: unknown = JSON.parse(store?.getItem(EDITS_KEY) ?? '{}');
    return d && typeof d === 'object' && !Array.isArray(d) ? d as Record<string, unknown> : {};
  } catch {
    return {};
  }
};
const writeAll = (store: Store | null, all: Record<string, unknown>): boolean => {
  try {
    if (!store) return false;
    store.setItem(EDITS_KEY, JSON.stringify(all));
    return true;
  } catch {
    return false; // storage off or full: the edits last this visit
  }
};

/** the saved version of key, or null (none, unreadable or malformed) */
export function loadVersion(store: Store | null, key: string): Version | null {
  const v = readAll(store)[key] as Partial<Version> | undefined;
  const ok = !!v && Array.isArray(v.keyframes) && v.keyframes.length >= MIN_KEYS && v.keyframes.every((k) => k && k.root && k.joints)
    && Array.isArray(v.supports) && v.supports.length === v.keyframes.length && v.supports.every(Array.isArray)
    && !!v.kg && typeof v.kg === 'object';
  return ok ? v as Version : null;
}
/** store the version under key; false when the storage throws (nothing saved) */
export const saveVersion = (store: Store | null, key: string, v: Version): boolean => writeAll(store, { ...readAll(store), [key]: v });
/** delete the version of key; false when the storage throws */
export function revertVersion(store: Store | null, key: string): boolean {
  const all = readAll(store);
  delete all[key];
  return writeAll(store, all);
}

/** what the editor checks besides its keyframes and supports */
export interface EditRec {
  id: string; props: string[]; loads: Load[]; equipment: string[]; placement: Placement; formChecks?: Exercise['formChecks'];
}
const ORDER: CheckId[] = ['limits', 'balance', 'contacts', 'clearance', 'kneeOverFoot', 'neutralSpine'];
const IN_BETWEEN = [0.25, 0.5, 0.75];

/**
 * Form checks of an edited sequence, one row per check at its worst frame (as formChecks). Keyframe i uses supports[i];
 * the in-betweens of i → i+1 use supports[i + 1] (lerpPose takes the next keyframe's pin, as form.ts).
 */
export function editChecks(rec: EditRec, keys: Pose[], supports: Support[][], sex: Sex, data: EngineData, tables: FormTables, eq: EquipmentJson): CheckResult[] {
  const worst = new Map<CheckId, CheckResult>();
  const over = (r: CheckResult) => (r.id === 'balance' ? r.limit - r.value : r.value - r.limit);
  const run = (pose: Pose, sup: Support[], frame: number) => {
    for (const r of formChecks({ ...rec, keyframes: [pose], supports: sup }, sex, data, tables, eq)) {
      const w = worst.get(r.id);
      if (!w || over(r) > over(w)) worst.set(r.id, { ...r, frame });
    }
  };
  keys.forEach((k, i) => {
    run(k, supports[i], i);
    if (i + 1 < keys.length) for (const t of IN_BETWEEN) run(lerpPose(k, keys[i + 1], t), supports[i + 1], i + t);
  });
  return ORDER.flatMap((id) => (worst.has(id) ? [worst.get(id)!] : []));
}
