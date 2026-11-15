// Body page part list (R5, T6b), as the sample's renderList: tabs by kind, muscles and bones grouped by
// region, others by system, search across all kinds, peeled muscle rows dimmed. One row per plain name.
import { LAYER_COL } from '../../body/materials';
import type { Part } from '../../body/load';
import type { BodyViewer } from '../../body/scene';

const TABS: [string, string][] = [
  ['muscle', 'Muscles'], ['organ', 'Organs'], ['bone', 'Bones'], ['vessel', 'Vessels'],
  ['nerve', 'Nerves'], ['lymph', 'Lymph'], ['joint', 'Ligaments'],
];
const REGIONS = ['Head', 'Neck', 'Chest', 'Abdomen', 'Back', 'Arm', 'Hand', 'Pelvis', 'Leg', 'Foot', 'Other'];
const soft = (p: Part) => p.kind === 'muscle' || p.kind === 'tendon';
const tabOf = (p: Part) => (p.kind === 'tendon' ? 'muscle' : p.kind);
const groupOf = (p: Part) => (soft(p) || p.kind === 'bone' ? p.region : p.system);
const regionRank = (g: string) => (REGIONS.indexOf(g) + 99) % 99; // unknown regions last

const h = (tag: string, cls = '', text = ''): HTMLElement => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
};

export interface PartList {
  el: HTMLElement;
  search: HTMLInputElement;
  sync(selected: string | null): void;
}

export function createList(viewer: BodyViewer, onPick: (plain: string) => void): PartList {
  // parts per plain name (left + right, §2b.4); skin is not listed
  const byPlain = new Map<string, Part[]>();
  for (const p of viewer.parts) {
    if (p.kind === 'skin') continue;
    const g = byPlain.get(p.plain);
    if (g) g.push(p);
    else byPlain.set(p.plain, [p]);
  }
  let tab = 'muscle', built = '', depthKey = '';

  const el = h('section', 'body-list');
  const tabs = h('div', 'chips');
  tabs.setAttribute('role', 'group');
  tabs.setAttribute('aria-label', 'Part kind');
  const tabBtns = TABS.map(([k, name]) => {
    const b = h('button', '', name) as HTMLButtonElement;
    b.type = 'button';
    b.addEventListener('click', () => { tab = k; sync(selected); });
    tabs.append(b);
    return b;
  });
  const search = h('input') as HTMLInputElement;
  Object.assign(search, { type: 'search', placeholder: 'Find a muscle, bone or organ' });
  search.setAttribute('aria-label', 'Find a part');
  search.addEventListener('input', () => sync(selected));
  const rows = h('div', 'list-rows');
  rows.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('.row');
    if (b?.dataset.plain) onPick(b.dataset.plain);
  });
  el.append(tabs, search, rows);

  let selected: string | null = null;
  // ponytail: rows are plain DOM (≤ 1,554 with an empty-tab search); groups use content-visibility:auto so
  // only on-screen groups lay out and paint. Swap to a windowed list if a phone still stutters.
  const build = () => {
    const sex = viewer.state.sex, q = search.value.trim().toLowerCase();
    const list = [...byPlain].map(([plain, ps]) => ({ plain, p: ps.find((x) => x.sex === 'both' || x.sex === sex) }))
      .filter((r): r is { plain: string; p: Part } => !!r.p && (q ? r.plain.toLowerCase().includes(q) : tabOf(r.p) === tab));
    const groups = new Map<string, typeof list>();
    for (const r of list) {
      const g = groups.get(groupOf(r.p));
      if (g) g.push(r);
      else groups.set(groupOf(r.p), [r]);
    }
    const names = [...groups.keys()].sort((a, b) => regionRank(a) - regionRank(b) || a.localeCompare(b));
    rows.replaceChildren(...names.map((g) => {
      const box = h('div', 'list-group');
      box.append(h('h3', '', g));
      const rs = groups.get(g)!.sort((a, b) => (a.p.layer ?? 0) - (b.p.layer ?? 0) || a.plain.localeCompare(b.plain));
      for (const { plain, p } of rs) {
        const b = h('button', 'row') as HTMLButtonElement;
        b.type = 'button';
        b.dataset.plain = plain;
        if (soft(p)) b.dataset.layer = String(p.layer ?? 1);
        const dot = h('i', 'dot');
        dot.style.background = soft(p) ? LAYER_COL[Math.min(p.layer ?? 1, 6)] : p.colour;
        b.append(dot, h('span', '', plain));
        box.append(b);
      }
      return box;
    }));
    if (!names.length) rows.append(h('p', 'muted', 'Nothing matches. Try part of the name, like "delt" or "liver".'));
    depthKey = '';
  };

  const sync = (sel: string | null) => {
    selected = sel;
    const key = `${tab}|${search.value}|${viewer.state.sex}`;
    if (key !== built) { built = key; build(); }
    tabBtns.forEach((b, i) => b.setAttribute('aria-pressed', String(!search.value.trim() && TABS[i][0] === tab)));
    const d = viewer.state.depth;
    if (String(d) !== depthKey) {
      depthKey = String(d);
      for (const r of rows.querySelectorAll<HTMLElement>('.row[data-layer]')) {
        r.classList.toggle('peeled', d === 'bones' || (typeof d === 'number' && +r.dataset.layer! < d));
      }
    }
    for (const r of rows.querySelectorAll<HTMLElement>('.row')) {
      const on = r.dataset.plain === sel;
      r.classList.toggle('sel', on);
      if (on) r.setAttribute('aria-current', 'true');
      else r.removeAttribute('aria-current');
    }
  };
  return { el, search, sync };
}
