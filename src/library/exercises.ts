// Exercise records (R5 R1, SPEC §5): public/data/exercises.json v2, one flat record per way of doing a lift, grouped by
// `family` for the Variation picker. Parse, check references against the engine tables and equipment.json, search.
// Pure: no three.js, no DOM.
import type { LoadsJson, SupportsJson } from '../engine/setup';
import { fromPrototype, type Pose, type ProtoPose } from '../rig/pose';

export const PATTERNS = ['curl', 'press', 'row', 'pulldown', 'squat', 'hinge', 'lunge', 'raise', 'fly', 'extension', 'rotation', 'carry', 'hold', 'flexion'] as const;
export const POSTURES = ['standing', 'seated', 'incline', 'decline', 'lying', 'kneeling', 'hanging'] as const;
export const BODY_PARTS = ['Arms', 'Shoulders', 'Chest', 'Back', 'Legs', 'Glutes', 'Core', 'Calves'] as const;
/** pattern checks a record may list (plan 2c.2); the global checks always run and are not listed */
export const FORM_CHECKS = ['kneeOverFoot', 'neutralSpine'] as const;
export type Pattern = (typeof PATTERNS)[number];
export type Posture = (typeof POSTURES)[number];
export type FormCheckId = (typeof FORM_CHECKS)[number];

export interface Placement { at?: [number, number, number]; yaw?: number; angle?: number }
export interface Exercise {
  id: string;
  name: string;
  family: string;
  aliases: string[];
  pattern: Pattern;
  posture: Posture;
  /** equipment.json ids or 'bodyweight' */
  equipment: string[];
  bodyParts: string[];
  /** engine props (loads.json / supports.json) */
  props: string[];
  placement?: Record<string, Placement>;
  /** kg by engine load id (prop name or `prop#i`) */
  loads?: Record<string, number>;
  keyframes: ProtoPose[];
  cam?: { az?: number };
  cues: string[];
  mistakes: string[];
  formChecks: { id: FormCheckId; params?: Record<string, number> }[];
  note?: string;
  sources: string[];
  reviewed: boolean;
}
export interface ExercisesJson { sources: string[]; version: 2; exercises: Exercise[] }
export interface EquipmentIds { items: { id: string }[]; objects?: { id: string }[] }
export type Filters = Partial<Record<'pattern' | 'equipment' | 'bodyPart' | 'posture', string[]>>;

export function loadExercises(json: unknown): Exercise[] {
  const j = json as Partial<ExercisesJson> | null;
  if (j?.version !== 2 || !Array.isArray(j.exercises)) throw new Error('exercises.json: expected version 2 with an exercises list');
  return j.exercises;
}

/** A record keyframe as a Pose for a body of scale s (pelvis rest height / 0.965, plan 2d.A): root x/y/z and pinAt
 * are prototype coordinates like the fixed equipment, so they scale by s and a seat fits both bodies. */
export function protoToPose(proto: ProtoPose, s: number): Pose {
  const p = fromPrototype(proto);
  const r = p.root;
  return { ...p, root: { ...r, x: r.x * s, y: r.y * s, z: r.z * s }, ...(p.pinAt ? { pinAt: p.pinAt.map((v) => v * s) as [number, number, number] } : {}) };
}

/** Every broken reference or field in exercises.json, as one line each; [] = valid. */
export function validateExercises(json: unknown, tables: { loads: LoadsJson; supports: SupportsJson }, equipment: EquipmentIds): string[] {
  const j = json as Partial<ExercisesJson> | null;
  if (j?.version !== 2 || !Array.isArray(j.exercises)) return ['exercises.json: expected version 2 with an exercises list'];
  const err: string[] = [];
  if (!j.sources?.length) err.push('exercises.json: no sources');
  const { loads: L, supports: S } = tables;
  const known = new Set(['bodyweight', ...equipment.items.map((i) => i.id), ...(equipment.objects ?? []).map((i) => i.id)]);
  const ids = new Set<string>();
  for (const e of j.exercises) {
    const at = (m: string) => err.push(`${e.id}: ${m}`);
    if (ids.has(e.id)) at('duplicate id');
    ids.add(e.id);
    if (!e.name || !e.family) at('no name or family');
    if (!(PATTERNS as readonly string[]).includes(e.pattern)) at(`unknown pattern "${e.pattern}"`);
    if (!(POSTURES as readonly string[]).includes(e.posture)) at(`unknown posture "${e.posture}"`);
    for (const b of e.bodyParts ?? []) if (!(BODY_PARTS as readonly string[]).includes(b)) at(`unknown body part "${b}"`);
    for (const q of e.equipment ?? []) if (!known.has(q)) at(`unknown equipment "${q}"`);
    const loadIds = new Set<string>();
    for (const p of e.props ?? []) {
      if (!L.props[p] && !L.none.includes(p) && !S.props[p] && !S.none.includes(p)) at(`unknown prop "${p}"`);
      (L.props[p] ?? []).forEach((_, i, a) => loadIds.add(a.length > 1 ? `${p}#${i}` : p));
    }
    for (const id of Object.keys(e.loads ?? {})) if (!loadIds.has(id)) at(`unknown load "${id}"`);
    for (const c of e.formChecks ?? []) {
      if (!(FORM_CHECKS as readonly string[]).includes(c.id)) at(`unknown form check "${c.id}"`);
      if (c.id === 'neutralSpine' && c.params && typeof c.params.maxLumbarFlex !== 'number') at('neutralSpine needs a number maxLumbarFlex');
    }
    if (!Array.isArray(e.keyframes) || e.keyframes.length < 2) at('fewer than 2 keyframes');
    if (!e.sources?.length) at('no sources');
    if (typeof e.reviewed !== 'boolean') at('reviewed is not a boolean');
  }
  return err;
}

/** lower case, accents off: "Développé" matches "developpe" */
const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
const FACET: Record<keyof Filters, (e: Exercise) => string[]> = {
  pattern: (e) => [e.pattern], equipment: (e) => e.equipment, bodyPart: (e) => e.bodyParts, posture: (e) => [e.posture],
};

/** Name and alias search (case and accent insensitive); filters AND across groups, OR within a group. */
export function search(list: Exercise[], q: string, filters: Filters = {}): Exercise[] {
  const needle = fold(q.trim());
  return list.filter((e) => (!needle || [e.name, ...e.aliases].some((n) => fold(n).includes(needle)))
    && (Object.entries(filters) as [keyof Filters, string[] | undefined][]).every(([k, vs]) => !vs?.length || FACET[k](e).some((v) => vs.includes(v))));
}

/** Old exercise/variant ids (R4 links #workouts/exercises/<old>/<variant>) → record id (plan 2b.1). */
const LEGACY: Record<string, string> = {
  'curl/stand': 'barbell-curl', 'curl/seat': 'seated-dumbbell-curl', 'curl/preacher': 'preacher-curl',
  'ohp/stand': 'overhead-press', 'ohp/seat': 'seated-dumbbell-press', 'press/bench': 'bench-press', 'press/pushup': 'push-up',
  'row/bent': 'bent-over-row', 'row/cable': 'seated-cable-row', 'pull/pullup': 'pull-up', 'pull/pulldown': 'lat-pulldown',
  'squat/back': 'back-squat', 'squat/legpress': 'leg-press', 'deadlift/conv': 'deadlift', 'deadlift/rdl': 'romanian-deadlift',
  'lateral/stand': 'lateral-raise', 'lateral/seat': 'seated-lateral-raise', 'triceps/pushdown': 'triceps-pushdown',
  'triceps/overhead': 'overhead-triceps-extension', 'plank/front': 'plank', 'calf/stand': 'standing-calf-raise', 'calf/seat': 'seated-calf-raise',
};

/** Record id for an old link; without a variant, the family's first way (as the old player played variants[0]). */
export const legacyId = (old: string, variant?: string): string | undefined =>
  (variant && LEGACY[`${old}/${variant}`]) || Object.entries(LEGACY).find(([k]) => k.startsWith(`${old}/`))?.[1];
