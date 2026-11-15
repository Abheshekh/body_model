// Body page part card (R5, R6, T6b), as the sample's card: name, kind, region, side, layer or system,
// "simplified" note, facts with sources (facts.json, keyed by plain name), Isolate, Hide, Zoom to it. Show
// hidden lives in the page controls (the card closes on Hide). Every action covers all ids of the plain name
// for the viewed sex (§2b.4).
import { LAYER_COL } from '../../body/materials';
import type { Part } from '../../body/load';
import type { BodyViewer } from '../../body/scene';
import { layerName } from './topbar';

type Fact = { text: string; source: { title: string; url: string } };
let facts: Promise<Record<string, Fact[]>> | null = null;
const loadFacts = () => (facts ??= fetch(`${import.meta.env.BASE_URL}data/facts.json`)
  .then((r) => (r.ok ? r.json() : { facts: {} }))
  .then((j: { facts: Record<string, Fact[]> }) => j.facts)
  .catch(() => ({}))); // ponytail: no facts file → the card shows the name only, as for parts without facts

const KIND: Record<string, string> = {
  muscle: 'Muscle', tendon: 'Tendon or fascia', bone: 'Bone', organ: 'Organ', vessel: 'Heart or vessel',
  nerve: 'Nervous system', lymph: 'Lymphatic', joint: 'Ligament or cartilage', skin: 'Skin',
};

const h = (tag: string, cls = '', text = ''): HTMLElement => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
};
const button = (text: string, onClick: () => void): HTMLButtonElement => {
  const b = h('button', '', text) as HTMLButtonElement;
  b.type = 'button';
  b.addEventListener('click', onClick);
  return b;
};

export interface Card {
  el: HTMLElement;
  show(plain: string | null): void;
}

export function createCard(viewer: BodyViewer, select: (plain: string | null) => void): Card {
  const el = h('section', 'body-card');
  el.setAttribute('aria-live', 'polite');
  el.hidden = true;
  let current: string | null = null;

  const render = (plain: string, all: Record<string, Fact[]> | null) => {
    const s = viewer.state;
    const ps = viewer.parts.filter((p) => p.plain === plain && (p.sex === 'both' || p.sex === s.sex));
    const ids = ps.map((p) => p.id), p: Part | undefined = ps[0];
    if (!p) { el.hidden = true; return el.replaceChildren(); } // not on the viewed sex
    const soft = p.kind === 'muscle' || p.kind === 'tendon';
    const sides = ps.some((x) => x.side === 'left') && ps.some((x) => x.side === 'right') ? 'Left and right'
      : p.side === 'left' ? 'Left' : p.side === 'right' ? 'Right' : 'Midline';
    const meta = h('p', 'meta', `${KIND[p.kind] ?? p.kind} · ${p.region} · ${sides} · `);
    if (soft) {
      const sw = h('i', 'sw');
      sw.style.background = LAYER_COL[Math.min(p.layer ?? 1, 6)];
      meta.append(sw, `${layerName(p.layer ?? 1)} layer`);
    } else meta.append(p.system);
    const close = button('×', () => select(null));
    close.className = 'card-x';
    close.setAttribute('aria-label', 'Close');
    const kids: HTMLElement[] = [close, h('h2', '', plain), meta];
    if (p.simplified) kids.push(h('p', 'meta', 'Simplified shape (no free anatomical model yet)'));

    const list = all?.[plain] ?? [];
    if (list.length) {
      const ul = h('ul', 'facts');
      for (const f of list) {
        const li = h('li', '', `${f.text} `);
        const a = h('a', '', f.source.title) as HTMLAnchorElement;
        Object.assign(a, { href: f.source.url, target: '_blank', rel: 'noopener' });
        li.append(a);
        ul.append(li);
      }
      kids.push(ul, h('p', 'meta', 'Education only — not medical advice.'));
    }

    const acts = h('div', 'acts');
    if (p.kind !== 'skin') {
      const isolated = !!s.isolate?.has(p.id);
      acts.append(
        button(isolated ? 'Show all' : 'Isolate', () => viewer.setState({ isolate: isolated ? null : new Set(ids) })),
        button('Hide', () => {
          viewer.setState({ hidden: new Set([...s.hidden, ...ids]) });
          select(null);
        }),
        button('Zoom to it', () => viewer.frameIds(ids)),
      );
    }
    kids.push(acts);
    el.replaceChildren(...kids);
  };

  let all: Record<string, Fact[]> | null = null;
  return {
    el,
    show(plain) {
      current = plain;
      el.hidden = !plain;
      if (!plain) return el.replaceChildren();
      render(plain, all);
      if (!all) void loadFacts().then((f) => { all = f; if (current) render(current, all); });
    },
  };
}
