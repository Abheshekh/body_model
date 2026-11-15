import type { Profile } from '../me/profile';

export type Strength = 'strong' | 'moderate' | 'weak' | 'convention';
export type Claim = { id: string; claim: string; strength: Strength; source: { title: string; url: string | null } };
export type Dose = {
  sets?: number;
  reps?: number;
  holdSeconds?: number;
  frequency: string;
  source: { title: string; url: string };
};
export type Item = {
  id: string;
  name: string;
  component?: string;
  cues: string[];
  animated: false;
  targets: { from: 'record' | 'provisional'; provisional: boolean; parts: string[] };
  dose: Dose | null;
  evidence: string[];
};
export type Program = {
  id: string;
  title: string;
  audience: 'all' | 'male' | 'female';
  adultOnly: boolean;
  linkedConditions: string[];
  cautions: string[];
  notes: string[];
  evidence: Claim[];
  items: Item[];
};
export type ProgramsFile = { sources: { name: string; url: string }[]; programs: Program[] };
export type Route = {
  screen: 'body' | 'workouts' | 'programs' | 'move' | 'exercises' | 'tasks' | 'me' | 'credits';
  programId?: string;
  itemId?: string;
  variantId?: string;
};

export const canOpen = (prog: Program, p: Profile | null): boolean =>
  p !== null && (prog.audience === 'all' || prog.audience === p.sex);

export const visiblePrograms = (ps: Program[], p: Profile | null): Program[] => ps.filter((x) => canOpen(x, p));

export function parseRoute(hash: string): Route {
  const h = hash.replace(/^#/, '').replace(/\/$/, '');
  if (h === 'workouts') return { screen: 'workouts' };
  if (h === 'workouts/programs') return { screen: 'programs' };
  if (h === 'workouts/move') return { screen: 'move' };
  if (h.startsWith('workouts/programs/')) return { screen: 'programs', programId: h.slice(18) };
  // #workouts/exercises[/<id>[/<variant>]], same for tasks
  const lib = /^workouts\/(exercises|tasks)(?:\/([^/]+)(?:\/([^/]+))?)?$/.exec(h);
  if (lib) {
    const r: Route = { screen: lib[1] as 'exercises' | 'tasks' };
    if (lib[2]) r.itemId = lib[2];
    if (lib[3]) r.variantId = lib[3];
    return r;
  }
  if (h === 'me') return { screen: 'me' };
  if (h === 'me/credits') return { screen: 'credits' };
  return { screen: 'body' };
}
