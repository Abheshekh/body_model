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
