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
export type Route = { screen: 'explore' | 'profile' | 'credits' | 'programs'; programId?: string };

export const canOpen = (prog: Program, p: Profile | null): boolean =>
  p !== null && (prog.audience === 'all' || prog.audience === p.sex);

export const visiblePrograms = (ps: Program[], p: Profile | null): Program[] => ps.filter((x) => canOpen(x, p));

export function parseRoute(hash: string): Route {
  const h = hash.replace(/^#/, '');
  if (h === 'profile') return { screen: 'profile' };
  if (h === 'credits') return { screen: 'credits' };
  if (h === 'programs' || h === 'programs/') return { screen: 'programs' };
  if (h.startsWith('programs/')) return { screen: 'programs', programId: h.slice(9) };
  return { screen: 'explore' };
}
