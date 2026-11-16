// Workouts library (R9): the exercise and task lists, grouped by part (routes #workouts/exercises, #workouts/tasks).
// Each row opens the player (player.ts). Data: public/data/exercises.json, tasks.json (prototype port, T6).
import type { Inset } from '../../body/model';
import type { BodyViewer } from '../../body/scene';
import type { ProtoPose } from '../../rig/pose';

export type Kind = 'exercises' | 'tasks';
/** Muscle colours by engine role (work / help / hold), prototype C_ROLE; REST = a muscle with no effort (C_REST). */
export const ROLE_COL = { prime: '#c2302a', syn: '#e58a17', stab: '#2c6cb0' } as const;
export const REST = '#c9988a';
export type Variant = {
  id: string;
  name: string;
  props: string[];
  proto: { a: ProtoPose; b: ProtoPose };
  moving: string[];
  held: string[];
  note?: string;
  cam?: { az?: number }; // prototype camera azimuth, degrees
};
export type Entry = { id: string; name: string; part: string; cues: string[]; avoid: string[]; variants: Variant[] };

export const TITLE: Record<Kind, string> = { exercises: 'Exercises', tasks: 'Tasks' };

export async function loadLibrary(kind: Kind): Promise<Entry[]> {
  const res = await fetch(`${import.meta.env.BASE_URL}data/${kind}.json`);
  if (!res.ok) throw new Error(`${kind}.json ${res.status}`);
  return ((await res.json()) as Record<Kind, Entry[]>)[kind];
}

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

export function mountLibrary(root: HTMLElement, viewer: BodyViewer | null, kind: Kind): () => void {
  let disposed = false;
  const sheet = h('section', 'sheet programs peek'); // peek: 40vh on phone, so the whole body fits above it
  sheet.setAttribute('aria-label', TITLE[kind]);
  const back = h('a', 'back', '← Workouts') as HTMLAnchorElement;
  back.href = '#workouts';
  const body = h('div', '', 'Loading…');
  sheet.append(back, h('h1', '', TITLE[kind]), body);
  root.replaceChildren(sheet);
  const [fit, unfit] = fitAbove(viewer, sheet);

  void loadLibrary(kind).then((list) => {
    if (disposed) return;
    const out: HTMLElement[] = [h('p', 'muted', kind === 'exercises'
      ? 'Pick an exercise to watch it on the body. The same lift uses different muscles when the support changes.'
      : 'Pick an everyday task to watch it on the body.')];
    for (const part of new Set(list.map((e) => e.part))) {
      const ul = h('ul', 'program-list');
      for (const e of list.filter((x) => x.part === part)) {
        const a = h('a', 'program-row') as HTMLAnchorElement;
        a.href = `#workouts/${kind}/${e.id}`;
        const n = e.variants.length;
        a.append(h('span', 'item-name', e.name), h('span', 'muted', n === 1 ? '1 way' : `${n} ways`));
        const li = h('li');
        li.append(a);
        ul.append(li);
      }
      out.push(h('h2', '', part), ul);
    }
    body.replaceChildren(...out);
    fit();
    viewer?.frameIds(viewer.parts.filter((p) => p.kind === 'skin').map((p) => p.id)); // the whole body above the list
  }).catch((e: unknown) => {
    if (!disposed) body.textContent = `Could not load ${kind}: ${e instanceof Error ? e.message : String(e)}`;
  });

  return () => {
    disposed = true;
    unfit();
    root.replaceChildren();
  };
}
