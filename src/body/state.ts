// Pure body state rules (no three.js). Part/Manifest come from load.ts.
import type { Manifest, Part } from './load';

export type Depth = 'skin' | 1 | 2 | 3 | 4 | 5 | 6 | 'bones';
export type SystemKey = 'organs' | 'heart' | 'nerves' | 'lymph' | 'joints' | 'skeleton';
export interface BodyState {
  sex: 'male' | 'female';
  depth: Depth;
  systems: Set<SystemKey>;
  hidden: Set<number>;
  isolate: Set<number> | null;
  seeThrough: boolean;
  ghost: boolean;
  colour: 'natural' | 'layer' | 'system';
}
export type Vis = 'shown' | 'ghost' | 'hidden';

export function systemOf(p: Part): SystemKey | 'muscle' | 'skin' {
  switch (p.kind) {
    case 'organ': return p.system === 'Heart' ? 'heart' : 'organs';
    case 'vessel': return 'heart';
    case 'nerve': return 'nerves';
    case 'lymph': return 'lymph';
    case 'joint': return 'joints';
    case 'bone': return 'skeleton';
    case 'skin': return 'skin';
    default: return 'muscle'; // muscle, tendon
  }
}

export function defaultState(m: Manifest, sex: 'male' | 'female'): BodyState {
  return {
    sex,
    depth: 'skin',
    systems: new Set<SystemKey>(['organs', 'skeleton']),
    hidden: new Set(m.parts.filter((p) => p.defaultHidden).map((p) => p.id)),
    isolate: null,
    seeThrough: false,
    ghost: true,
    colour: 'natural',
  };
}

export function visibility(p: Part, s: BodyState): Vis {
  if (p.sex !== 'both' && p.sex !== s.sex) return 'hidden';
  if (s.isolate !== null) return s.isolate.has(p.id) || (p.kind === 'bone' && s.systems.has('skeleton')) ? 'shown' : 'hidden';
  if (s.hidden.has(p.id)) return 'hidden';
  const skinOpaque = s.depth === 'skin' && !s.seeThrough;
  if (p.kind === 'skin') return s.depth === 'skin' || s.seeThrough ? 'shown' : 'hidden';
  if (skinOpaque) return 'hidden'; // also covers p.ext
  if (p.kind === 'muscle' || p.kind === 'tendon') {
    if (s.depth === 'bones') return s.ghost ? 'ghost' : 'hidden';
    const d = s.depth === 'skin' ? 1 : s.depth;
    if ((p.layer ?? 1) >= d) return 'shown';
    return s.ghost ? 'ghost' : 'hidden';
  }
  const sys = systemOf(p);
  return sys !== 'muscle' && sys !== 'skin' && s.systems.has(sys) ? 'shown' : 'hidden';
}

export function idsOfPlain(m: Manifest, plain: string): number[] {
  return m.parts.filter((p) => p.plain === plain).map((p) => p.id);
}

export function packsNeeded(s: BodyState, m: Manifest): string[] {
  const need = new Set<string>();
  for (const p of m.parts) if (visibility(p, s) !== 'hidden') need.add(p.pack);
  return m.packs.map((k) => k.name).filter((n) => need.has(n));
}

export function revealFor(p: Part, s: BodyState): BodyState {
  const r: BodyState = { ...s, systems: new Set(s.systems), hidden: new Set(s.hidden) };
  r.hidden.delete(p.id);
  if (r.isolate !== null && !r.isolate.has(p.id)) r.isolate = null;
  const sys = systemOf(p);
  if (sys === 'muscle') r.depth = (p.layer ?? 1) as Depth;
  else {
    if (sys !== 'skin') r.systems.add(sys);
    if (r.depth === 'skin') r.depth = 1; // "Outer"
  }
  return r;
}
