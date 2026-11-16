// Loads and supports for an exercise/task variant from the prop and pin tables (loads.json, supports.json; PLAN §2b.3,
// 2b.4, 2b.12). Data only: no per-exercise logic beyond the tables' own `towardByVariant` and `variantProps`. Pure.
import type { ProtoPose } from '../rig/pose';
import type { BodyPoint, Load, Support, Vec3 } from './types';

/** Pin for supports: the prototype keyframe's own pin, undefined when absent (→ `default`, flat feet; §2b.12).
 * Never fromPrototype's pin, which defaults to `toes` for grounding only. */
export const supportPin = (proto: ProtoPose): string | undefined => (typeof proto.pin === 'string' ? proto.pin : undefined);

interface LoadEntry { at: BodyPoint; kind: Load['kind']; kg: number; toward?: Vec3; track?: Vec3; towardByVariant?: Record<string, Vec3> }
export interface LoadsJson { props: Record<string, LoadEntry[]>; none: string[] }
export interface SupportsJson { pins: Record<string, Support[]>; props: Record<string, Support[]>; none: string[]; variantProps?: Record<string, string[]> }

/**
 * Loads and supports for `exercise/variant` with its props and the prototype pin (undefined = `default`, flat feet).
 * `kg` overrides a load's mass by its id (the prop name). Duplicate contacts (pin `hands` + prop `pullbar`) count once.
 */
export function setupVariant(
  exercise: string, variant: string, props: string[], pin: string | undefined,
  tables: { loads: LoadsJson; supports: SupportsJson }, kg: Record<string, number> = {},
): { loads: Load[]; supports: Support[] } {
  const key = `${exercise}/${variant}`;
  const { loads: L, supports: S } = tables;
  const loads = props.flatMap((p) => {
    if (!L.props[p] && !L.none.includes(p) && !S.props[p] && !S.none.includes(p)) throw new Error(`Unknown prop "${p}"`);
    return (L.props[p] ?? []).map((e, i): Load => {
      const id = L.props[p].length > 1 ? `${p}#${i}` : p;
      const l: Load = { id, kind: e.kind, kg: kg[id] ?? e.kg, at: e.at };
      const toward = e.towardByVariant?.[key] ?? e.toward;
      if (toward) l.toward = toward;
      if (e.track) l.track = e.track;
      return l;
    });
  });
  const pinSupports = S.pins[pin ?? 'default'];
  if (!pinSupports) throw new Error(`Unknown pin "${pin}"`);
  const seen = new Set<string>();
  const supports = [...pinSupports, ...[...props, ...(S.variantProps?.[key] ?? [])].flatMap((p) => S.props[p] ?? [])]
    .filter((s) => { const k = s.point + s.normal.join(); return !seen.has(k) && !!seen.add(k); });
  return { loads, supports };
}
