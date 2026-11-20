// Compare words (R5 2b.7): top muscle level changes between version A and B, lower-back moment, balance. Pure.
import type { EffortResult } from '../engine/types';

export type PartNames = Map<number, { plain: string; side: 'left' | 'right' | 'center' }>;

const band = (l: number): string => (l < 0.25 ? 'low' : l < 0.5 ? 'medium' : 'high');
const MAX_LINES = 6;
const MIN_DELTA = 0.1;

export function compareWords(a: EffortResult, b: EffortResult, parts: PartNames): string[] {
  const rows: { delta: number; line: string }[] = [];
  for (const id of new Set([...Object.keys(a.muscle), ...Object.keys(b.muscle)].map(Number))) {
    const p = parts.get(id);
    if (!p) continue;
    const la = a.muscle[id]?.level ?? 0;
    const lb = b.muscle[id]?.level ?? 0;
    const delta = lb - la;
    if (Math.abs(delta) < MIN_DELTA) continue;
    const name = p.side === 'center' ? p.plain : `${p.plain} (${p.side})`;
    const same = band(la) === band(lb);
    const verb = delta > 0 ? 'rises' : 'falls';
    rows.push({ delta, line: `${name} ${verb} from ${band(la)} to ${band(lb)}${same ? ` (${la.toFixed(2)} → ${lb.toFixed(2)})` : ''}` });
  }
  rows.sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta));
  const lines = rows.slice(0, MAX_LINES).map((r) => r.line);
  if (!lines.length) lines.push('No muscle changes by more than 10%');
  const na = Math.round(a.lowerBack.momentNm), nb = Math.round(b.lowerBack.momentNm);
  if (na !== nb) {
    const pct = na ? Math.round(((nb - na) / na) * 100) : null;
    lines.push(`Lower back: ${na} → ${nb} Nm${pct === null ? '' : ` (${pct > 0 ? '+' : '−'}${Math.abs(pct)}%)`}`);
  }
  if (a.balance.comOverFeet !== b.balance.comOverFeet) {
    lines.push(b.balance.comOverFeet ? 'Balance: the centre of mass is over the feet again' : 'Balance: the centre of mass is now beyond the feet');
  }
  return lines;
}
