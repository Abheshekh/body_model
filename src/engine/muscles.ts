// Joint demand → muscle levels (PLAN R3, §2b.1; SPEC §4 steps 7-8). Keyed by part id; the action table (actions.json)
// is keyed by the manifest `plain` name with sideless joints, resolved here by the part's side. Pure.
import type { Reason } from './types';

export type Side = 'left' | 'right' | 'center';
export type Dir = '+' | '-' | 'ipsi' | 'contra';
export interface MusclePart { id: number; plain: string; side: Side }
export type Actions = Record<string, { actions: [string, string, Dir, number][]; rules?: string[] }>;
export type Demand = Record<string, Record<string, { plus: number; minus: number }>>;
/** Rule levels by muscle plain name: scapula and grip per body side, bracing for the whole trunk. */
export interface RuleLevels { scapula: Record<'left' | 'right', Record<string, number>>; grip: Record<'left' | 'right', Record<string, number>>; bracing: Record<string, number> }

export const MIDLINE = new Set(['lumbar', 'thoracic', 'neck', 'head']);
const SFX = { left: ['_l'], right: ['_r'], center: ['_l', '_r'] };

/**
 * Joint keys and pose directions one action of a muscle on `side` works. Paired joints resolve by side (a center part:
 * both). Midline `ipsi` = toward the muscle's own side (+ = body left), `contra` the reverse; a center part's ipsi
 * is both directions and its contra nothing.
 */
export function resolveAction(joint: string, dir: Dir, side: Side): [string, '+' | '-'][] {
  const keys = MIDLINE.has(joint) ? [joint] : SFX[side].map((s) => joint + s);
  const dirs: ('+' | '-')[] = dir === '+' || dir === '-' ? [dir]
    : side === 'center' ? (dir === 'ipsi' ? ['+', '-'] : [])
    : (dir === 'ipsi') === (side === 'left') ? ['+'] : ['-'];
  return keys.flatMap((k) => dirs.map((d): [string, '+' | '-'] => [k, d]));
}

export interface MuscleLevel { level: number; reasons: Reason[]; weight: number }

/**
 * Level = min(1, max over matching actions of demand × weight, and over rule levels). Reasons sorted strongest first
 * (top 3); `weight` = the strongest reason's action weight (1 for a rule). Unmodelled parts are left out.
 */
export function muscleLevels(parts: MusclePart[], actions: Actions, demand: Demand, rules: RuleLevels,
  loadKg: Record<string, number> = {}): Record<number, MuscleLevel> {
  const out: Record<number, MuscleLevel> = {};
  for (const p of parts) {
    const m = actions[p.plain];
    if (!m) continue;
    const cand: { v: number; w: number; r: Reason }[] = [];
    for (const [joint, axis, dir, weight] of m.actions) {
      for (const [k, d] of resolveAction(joint, dir, p.side)) {
        const dm = demand[k]?.[axis]?.[d === '+' ? 'plus' : 'minus'] ?? 0;
        if (dm * weight <= 0) continue;
        const r: Reason = { kind: 'joint', joint: k, axis, dir: d, demand: dm };
        if (loadKg[k]) r.loadKg = loadKg[k];
        cand.push({ v: dm * weight, w: weight, r });
      }
    }
    for (const rule of m.rules ?? []) {
      const sides = p.side === 'center' ? ['left', 'right'] as const : [p.side];
      const v = rule === 'bracing' ? rules.bracing[p.plain] ?? 0
        : Math.max(0, ...sides.map((s) => rules[rule as 'scapula' | 'grip'][s][p.plain] ?? 0));
      if (v > 0) cand.push({ v, w: 1, r: { kind: 'rule', rule: rule as 'scapula' | 'grip' | 'bracing', value: v } });
    }
    cand.sort((a, b) => b.v - a.v);
    out[p.id] = { level: Math.min(1, cand[0]?.v ?? 0), reasons: cand.slice(0, 3).map((c) => c.r), weight: cand[0]?.w ?? 0 };
  }
  return out;
}
