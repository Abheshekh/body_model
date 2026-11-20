// Workouts library (R5 R5, route #workouts/exercises): search (name + aliases), filter chips (pattern, equipment, body
// part, posture; AND across groups, OR within), the records grouped by pattern, an empty-result message. Each row opens
// the player (player.ts). Data: public/data/exercises.json v2 (flat records). Tasks live in the task builder.
import type { Inset } from '../../body/model';
import type { BodyViewer } from '../../body/scene';
import { loadExercises, search, type Exercise, type Filters } from '../../library/exercises';

/** Muscle colours by engine role (work / help / hold), prototype C_ROLE; REST = a muscle with no effort (C_REST). */
export const ROLE_COL = { prime: '#c2302a', syn: '#e58a17', stab: '#2c6cb0' } as const;
export const REST = '#c9988a';

export async function fetchJson(name: string): Promise<unknown> {
  const res = await fetch(`${import.meta.env.BASE_URL}data/${name}.json`);
  if (!res.ok) throw new Error(`${name}.json ${res.status}`);
  return res.json();
}
export const loadRecords = async (): Promise<Exercise[]> => loadExercises(await fetchJson('exercises'));

/** Keep the viewer framing the body in the canvas area not under the nav or `sheet` (phone: above the sheet).
 * Same measure as src/ui/programs.ts and move.ts applyInset. Returns [measure now, cleanup]. */
export function fitAbove(viewer: BodyViewer | null, sheet: HTMLElement): [() => void, () => void] {
  const apply = () => {
    const canvas = document.querySelector('.body-stage canvas');
    if (!viewer || !canvas) return;
    const c = canvas.getBoundingClientRect();
    const inset: Inset = { top: 0, right: 0, bottom: 0, left: 0 };
    for (const el of [...document.querySelectorAll<HTMLElement>('.nav'), sheet]) {
      if (getComputedStyle(el).display === 'none' || el.closest('[hidden]')) continue;
      const r = el.getBoundingClientRect();
      if (r.bottom <= c.top || r.top >= c.bottom || r.right <= c.left || r.left >= c.right) continue;
      if (r.left > c.left + 1) inset.right = Math.max(inset.right, c.right - r.left); // side panel
      else if (r.top <= c.top) inset.top = Math.max(inset.top, r.bottom - c.top);
      else inset.bottom = Math.max(inset.bottom, c.bottom - r.top);
    }
    viewer.setViewInset(inset);
  };
  const ro = new ResizeObserver(apply);
  ro.observe(sheet);
  addEventListener('resize', apply);
  apply();
  return [apply, () => {
    ro.disconnect();
    removeEventListener('resize', apply);
    viewer?.setViewInset({ top: 0, right: 0, bottom: 0, left: 0 });
  }];
}

const h = (tag: string, cls = '', text = ''): HTMLElement => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
};

const GROUPS: [keyof Filters, string, (e: Exercise) => string[]][] = [
  ['pattern', 'Pattern', (e) => [e.pattern]], ['equipment', 'Equipment', (e) => e.equipment],
  ['bodyPart', 'Body part', (e) => e.bodyParts], ['posture', 'Posture', (e) => [e.posture]],
];
const words = (id: string) => (id.charAt(0).toUpperCase() + id.slice(1)).replace(/-/g, ' ');

export function mountLibrary(root: HTMLElement, viewer: BodyViewer | null): () => void {
  let disposed = false;
  const sheet = h('section', 'sheet programs peek'); // peek: 40vh on phone, so the whole body fits above it
  sheet.setAttribute('aria-label', 'Exercises');
  const back = h('a', 'back', '← Workouts') as HTMLAnchorElement;
  back.href = '#workouts';
  const body = h('div', '', 'Loading…');
  sheet.append(back, h('h1', '', 'Exercises'), body);
  root.replaceChildren(sheet);
  const [fit, unfit] = fitAbove(viewer, sheet);

  void loadRecords().then((list) => {
    if (disposed) return;
    let q = '';
    const filters: Filters = {};
    const input = h('input', 'lib-search') as HTMLInputElement;
    Object.assign(input, { type: 'search', placeholder: 'Search exercises', autocomplete: 'off' });
    input.setAttribute('aria-label', 'Search exercises');
    const results = h('div');
    results.setAttribute('aria-live', 'polite');
    const count = h('span');
    const chips = new Map<string, HTMLButtonElement>();
    const det = h('details', 'lib-filters');
    det.append(h('summary', '', 'Filters'));
    for (const [key, name, of] of GROUPS) {
      const row = h('div', 'lib-chips');
      row.setAttribute('role', 'group');
      row.setAttribute('aria-label', name);
      for (const v of [...new Set(list.flatMap(of))].sort()) {
        const b = h('button', 'lib-chip', words(v)) as HTMLButtonElement;
        b.type = 'button';
        b.setAttribute('aria-pressed', 'false');
        b.addEventListener('click', () => {
          const on = !filters[key]?.includes(v);
          filters[key] = on ? [...(filters[key] ?? []), v] : filters[key]!.filter((x) => x !== v);
          b.setAttribute('aria-pressed', String(on));
          draw();
        });
        chips.set(`${key}:${v}`, b);
        row.append(b);
      }
      det.append(h('h2', '', name), row);
    }
    const clear = h('button', '', 'Clear search and filters') as HTMLButtonElement;
    clear.type = 'button';
    clear.addEventListener('click', () => {
      q = input.value = '';
      for (const k of Object.keys(filters) as (keyof Filters)[]) delete filters[k];
      for (const b of chips.values()) b.setAttribute('aria-pressed', 'false');
      draw();
    });
    const draw = () => {
      const hits = search(list, q, filters);
      const n = Object.values(filters).reduce((a, v) => a + v.length, 0);
      det.querySelector('summary')!.textContent = n ? `Filters (${n})` : 'Filters';
      count.textContent = `${hits.length} of ${list.length} exercises`;
      if (!hits.length) {
        results.replaceChildren(h('p', 'notice', q ? `No exercise matches "${q}" with these filters.` : 'No exercise matches these filters.'), clear);
        return;
      }
      const out: HTMLElement[] = [];
      for (const pat of new Set(hits.map((e) => e.pattern))) {
        const ul = h('ul', 'program-list');
        for (const e of hits.filter((x) => x.pattern === pat)) {
          const a = h('a', 'program-row') as HTMLAnchorElement;
          a.href = `#workouts/exercises/${e.id}`;
          a.append(h('span', 'item-name', e.name), h('span', 'muted', e.equipment.map(words).join(', ')));
          const li = h('li');
          li.append(a);
          ul.append(li);
        }
        out.push(h('h2', '', words(pat)), ul);
      }
      results.replaceChildren(...out);
    };
    input.addEventListener('input', () => { q = input.value; draw(); });
    draw();
    body.replaceChildren(input, det, h('p', 'muted'), results);
    body.children[2].append(count);
    fit();
    viewer?.frameIds(viewer.parts.filter((p) => p.kind === 'skin').map((p) => p.id)); // the whole body above the list
  }).catch((e: unknown) => {
    if (!disposed) body.textContent = `Could not load exercises: ${e instanceof Error ? e.message : String(e)}`;
  });

  return () => {
    disposed = true;
    unfit();
    root.replaceChildren();
  };
}
