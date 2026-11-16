// Muscle panel (R4 T6a): top 8 muscles with level bar, role and reason, lower-back moment, balance and engine
// warnings, limits. Pure DOM; fixed row count and textContent updates so the sheet never shifts.
import { explain, explainBalance } from '../../engine/explain';
import type { EffortResult, MuscleResult } from '../../engine/types';
import { ROLE_COL } from './library';

export type Side = 'left' | 'right' | 'center';
export interface PanelCtx { parts: Map<number, { plain: string; side: Side }>; sources: string[] }
export interface PanelRow { name: string; level: number; role: 'work' | 'help' | 'hold'; roleWords: string; reason: string }

const ROW_COUNT = 8;
const ROLE_WORDS = { work: 'does the work', help: 'helps', hold: 'holds you still' } as const;
const ROLE_RANK = { work: 0, help: 1, hold: 2 } as const;
const ROLE_KEY = { work: 'prime', help: 'syn', hold: 'stab' } as const;
export const LIMITS = 'Estimates from a static model: speed, momentum, fatigue and individual differences are ignored. '
  + "Light, moderate and strong are this app's own scale (not a clinical measure). Education only, not medical advice.";

/** Word for a 0..1 level. */
export const levelWord = (l: number): string => (l < 0.34 ? 'light' : l < 0.67 ? 'moderate' : 'strong');

/** Collapse equal left/right pairs into "both sides", sort by level (ties work > help > hold), keep the top 8. */
export function panelRows(result: EffortResult, ctx: PanelCtx): PanelRow[] {
  type Item = { plain: string; side: Side; m: MuscleResult };
  const items: Item[] = [];
  for (const [id, m] of Object.entries(result.muscle)) {
    const p = ctx.parts.get(+id);
    if (p && m.role !== 'none' && m.level > 0) items.push({ plain: p.plain, side: p.side, m });
  }
  const rows: (PanelRow & { rank: number })[] = [];
  const used = new Set<Item>();
  for (const it of items) {
    if (used.has(it)) continue;
    used.add(it);
    let both = false;
    if (it.side !== 'center') {
      const twin = items.find((o) => !used.has(o) && o.plain === it.plain && o.side !== it.side && o.side !== 'center' && o.m.level === it.m.level && o.m.role === it.m.role);
      if (twin) { used.add(twin); both = true; }
    }
    const role = it.m.role as 'work' | 'help' | 'hold';
    const r = it.m.reasons[0];
    rows.push({
      name: `${it.plain} (${both ? 'both sides' : it.side})`.replace(' (center)', ''),
      level: it.m.level, role, roleWords: ROLE_WORDS[role], rank: ROLE_RANK[role],
      reason: r ? explain(r, both ? 'center' : it.side) : '',
    });
  }
  rows.sort((a, b) => b.level - a.level || a.rank - b.rank);
  return rows.slice(0, ROW_COUNT);
}

/** Notices under the rows: every engine warning, then the balance line. With no support at all (margin −∞) the
 * engine's no-support warning stands alone instead of "the centre of mass is beyond the feet". */
export function panelNotices(result: EffortResult): string[] {
  const b = result.balance;
  const msg = Number.isFinite(b.margin) && !b.comOverFeet && b.margin < -0.02 ? explainBalance(b) : null;
  return [...result.warnings, ...(msg ? [msg] : [])];
}

/** One-line summary for the collapsed sheet: the top three muscles. */
export function topLine(result: EffortResult, ctx: PanelCtx): string {
  const names = panelRows(result, ctx).slice(0, 3).map((r) => r.name);
  return names.length ? `Most effort: ${names.join(', ')}` : 'No muscle effort in this pose';
}

const h = (tag: string, cls = '', text = ''): HTMLElement => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
};

export function mountEffortPanel(host: HTMLElement, opts: { sources?: string[] } = {}): { update(result: EffortResult, ctx: PanelCtx): void; dispose(): void } {
  const root = h('div', 'effort');
  const list = h('ul', 'effort-rows');
  const cells = Array.from({ length: ROW_COUNT }, () => {
    const li = h('li', 'effort-row');
    const name = h('span', 'effort-name');
    const bar = h('span', 'effort-bar');
    bar.setAttribute('role', 'meter');
    bar.setAttribute('aria-valuemin', '0');
    bar.setAttribute('aria-valuemax', '100');
    const fill = h('i');
    bar.append(fill);
    const role = h('span', 'effort-role');
    const why = h('span', 'effort-why');
    li.append(name, bar, role, why);
    list.append(li);
    return { li, name, bar, fill, role, why };
  });
  const back = h('p', 'effort-back');
  const balance = h('div', 'effort-balance');
  const limits = h('p', 'effort-limits', LIMITS);
  const sources = h('p', 'effort-sources');
  root.append(list, back, balance, limits, sources);
  host.append(root);
  let srcText = opts.sources;

  return {
    update(result, ctx) {
      const rows = panelRows(result, ctx);
      cells.forEach((c, i) => {
        const r = rows[i];
        c.li.style.visibility = r ? 'visible' : 'hidden';
        c.name.textContent = r?.name ?? '';
        c.role.textContent = r?.roleWords ?? '';
        c.why.textContent = r?.reason ?? '';
        const pct = r ? Math.round(r.level * 100) : 0;
        c.bar.setAttribute('aria-valuenow', String(pct));
        c.fill.style.width = pct + '%';
        c.fill.style.background = r ? ROLE_COL[ROLE_KEY[r.role]] : '';
      });
      const lb = result.lowerBack;
      back.textContent = `Lower back: ${Math.round(lb.momentNm)} Nm (${levelWord(lb.level)})`;
      balance.replaceChildren(...panelNotices(result).map((t) => h('p', 'notice', t)));
      srcText = ctx.sources ?? srcText;
      sources.textContent = srcText?.length ? 'Sources: ' + srcText.join('; ') : '';
    },
    dispose() { root.remove(); },
  };
}
