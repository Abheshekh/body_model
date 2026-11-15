// Pure data helpers. No three.js here.
import type { Part } from './load';

export function flyDistance(radius: number, fovDeg: number): number {
  return Math.max(0.35, (1.2 * radius) / Math.sin((fovDeg * Math.PI) / 360));
}

// puborectalis → Pubo-analis muscle: the closest Z-Anatomy part of the levator ani (§2b.14)
export const PELVIC_FLOOR = ['Pubococcygeus muscle', 'Pubo-analis muscle', 'Iliococcygeus muscle', 'Coccygeus muscle', 'External anal sphincter'];

export interface Inset { top: number; right: number; bottom: number; left: number }
type Vp = { w: number; h: number };

export function viewOffset(_vp: Vp, inset: Inset): { x: number; y: number } {
  return { x: (inset.right - inset.left) / 2, y: (inset.bottom - inset.top) / 2 };
}

export function visibleFraction(vp: Vp, inset: Inset): number {
  return Math.max(0.2, Math.min((vp.w - inset.left - inset.right) / vp.w, (vp.h - inset.top - inset.bottom) / vp.h));
}

export function fitDistance(radius: number, fovDeg: number, fraction: number): number {
  return flyDistance(radius, fovDeg) / Math.max(0.2, fraction);
}

// Programs (R9): targets are manifest plain names (both sides). depth = min layer of the muscle targets
// (null when none); facing compares the targets' mean centre z with the muscles' mean (centreZ from the viewer's bounds).
export function highlightPlan(parts: Part[], names: string[], centreZ: (id: number) => number | null): {
  ids: number[]; missing: string[]; pelvic: boolean; depth: number | null; facing: 'front' | 'back';
} {
  const hit = parts.filter((p) => names.includes(p.plain));
  const found = new Set(hit.map((p) => p.plain));
  const ids = hit.map((p) => p.id);
  const pelvic = ids.length > 0 && names.every((n) => PELVIC_FLOOR.includes(n));
  const layers = hit.filter((p) => (p.kind === 'muscle' || p.kind === 'tendon') && p.layer !== null).map((p) => p.layer as number);
  const meanZ = (a: Part[]) => {
    const zs = a.map((p) => centreZ(p.id)).filter((z): z is number => z !== null);
    return zs.length ? zs.reduce((s, z) => s + z, 0) / zs.length : 0;
  };
  return {
    ids,
    missing: names.filter((n) => !found.has(n)),
    pelvic,
    depth: layers.length ? Math.min(...layers) : null,
    facing: ids.length > 0 && meanZ(hit) < meanZ(parts.filter((p) => p.kind === 'muscle')) ? 'back' : 'front',
  };
}
