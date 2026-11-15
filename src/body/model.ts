// Pure data helpers. No three.js here.
export type Kind = 'muscle' | 'tendon' | 'bone' | 'cartilage' | 'organ' | 'skin';
export type LayerKey = 'skin' | 'superficialMuscles' | 'deepMuscles' | 'skeleton' | 'organs';

export interface Part {
  id: string;
  name: string;
  plainName: string;
  kind: Kind;
  side: 'left' | 'right' | 'center';
  layer: 'superficial' | 'deep' | null;
  muscleKey: string | null;
  triangles: number;
  center: [number, number, number];
}

export const LAYER_KEYS: LayerKey[] = ['skin', 'superficialMuscles', 'deepMuscles', 'skeleton', 'organs'];

export function layerOf(p: Part): LayerKey {
  switch (p.kind) {
    case 'skin': return 'skin';
    case 'organ': return 'organs';
    case 'bone':
    case 'cartilage': return 'skeleton';
    default: return p.layer === 'superficial' ? 'superficialMuscles' : 'deepMuscles';
  }
}

export function searchParts(parts: Part[], query: string, limit = 20): Part[] {
  const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!tokens.length) return [];
  const q = tokens.join(' ');
  const isMuscle = (p: Part) => p.kind === 'muscle' || p.kind === 'tendon';
  const starts = (p: Part) => p.name.startsWith(q) || p.plainName.toLowerCase().startsWith(q);
  return parts
    .filter((p) => {
      if (p.kind === 'skin') return false;
      const hay = p.name + ' ' + p.plainName.toLowerCase();
      return tokens.every((t) => hay.includes(t));
    })
    .sort((a, b) =>
      Number(isMuscle(b)) - Number(isMuscle(a)) ||
      Number(starts(b)) - Number(starts(a)) ||
      (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
    .slice(0, limit);
}

export function mixColor(base: number, target: number, level: number): number {
  const t = Math.min(1, Math.max(0, level));
  let out = 0;
  for (const shift of [16, 8, 0]) {
    const a = (base >> shift) & 255;
    const b = (target >> shift) & 255;
    out |= Math.round(a + (b - a) * t) << shift;
  }
  return out;
}

export function flyDistance(radius: number, fovDeg: number): number {
  return Math.max(0.35, (1.2 * radius) / Math.sin((fovDeg * Math.PI) / 360));
}

export function parseLayersParam(v: string | null): Set<LayerKey> | null {
  if (v === null) return null;
  return new Set(v.split(',').filter((k): k is LayerKey => (LAYER_KEYS as string[]).includes(k)));
}

export function partIdsByName(parts: Part[], names: string[]): { ids: string[]; missing: string[] } {
  const ids: string[] = [];
  const missing: string[] = [];
  for (const n of names) {
    const hit = parts.filter((p) => p.name === n || p.name === `left ${n}` || p.name === `right ${n}`);
    if (hit.length) ids.push(...hit.map((p) => p.id));
    else missing.push(n);
  }
  return { ids, missing };
}

export const PELVIC_FLOOR = ['pubococcygeus', 'puborectalis', 'iliococcygeus', 'coccygeus', 'external anal sphincter'];

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

export function highlightPlan(parts: Part[], names: string[]): {
  ids: string[]; missing: string[]; pelvic: boolean; layers: LayerKey[]; seeThroughSuperficial: boolean; facing: 'front' | 'back';
} {
  const { ids, missing } = partIdsByName(parts, names);
  const pelvic = ids.length > 0 && names.every((n) => PELVIC_FLOOR.includes(n));
  const hit = parts.filter((p) => ids.includes(p.id));
  const used = new Set(hit.map(layerOf));
  const layers = LAYER_KEYS.filter((k) => used.has(k));
  const mean = (a: Part[]) => (a.length ? a.reduce((s, p) => s + p.center[2], 0) / a.length : 0);
  const midZ = mean(parts.filter((p) => p.kind === 'muscle'));
  return {
    ids, missing, pelvic, layers,
    seeThroughSuperficial: !pelvic && layers.includes('deepMuscles'),
    facing: ids.length > 0 && mean(hit) < midZ ? 'back' : 'front',
  };
}
