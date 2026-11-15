// Body page (R5, T6a, T6b): top bar, depth slider, systems, part list and card. Wide: side panel; phone:
// bottom sheet collapsed to the depth slider. `root` already holds `.body-stage` with the viewer's canvas.
import type { BodyViewer } from '../../body/scene';
import { revealFor, type Depth, type SystemKey } from '../../body/state';
import { createCard } from './card';
import { createList } from './list';
import { createSheet, SHEET_MQ } from './sheet';
import { createTopBar, layerName } from './topbar';

const DEPTHS: Depth[] = ['skin', 1, 2, 3, 4, 5, 6, 'bones'];
const TICKS = ['Skin', 'Outer', '2', '3', '4', '5', '6', 'Bones'];
const SYSTEMS: [SystemKey, string][] = [
  ['organs', 'Organs'], ['heart', 'Heart and vessels'], ['nerves', 'Brain and nerves'],
  ['lymph', 'Lymphatic'], ['joints', 'Ligaments and cartilage'], ['skeleton', 'Skeleton'],
];

const h = (tag: string, cls = '', text = ''): HTMLElement => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
};

const depthText = (d: Depth) => (d === 'skin' ? 'Skin' : d === 'bones' ? 'Skeleton and organs' : `${layerName(d)} muscles and deeper`);

export function mountBodyPage(root: HTMLElement, viewer: BodyViewer): void {
  root.classList.add('body-page');
  const sheet = createSheet(root);
  const openList = () => {
    sheet.setOpen(true);
    list.el.scrollIntoView({ block: 'start' });
  };
  const top = createTopBar(viewer, openList);

  // the selected plain name; labels and programs call viewer.select directly, so it is tracked here
  let selected: string | null = null;
  const byId = new Map(viewer.parts.map((p) => [p.id, p]));
  const viewerSelect = viewer.select.bind(viewer);
  // Programs draw on the body while the shell marks this page `behind` (V-1): taps and labels don't select
  // there, and the page's selection glow is parked, then comes back with the page
  const behind = () => root.classList.contains('behind');
  viewer.select = (id) => {
    if (behind()) return;
    selected = id === null ? null : byId.get(id)?.plain ?? null;
    viewerSelect(id);
  };
  const idsFor = (plain: string) => viewer.parts
    .filter((p) => p.plain === plain && (p.sex === 'both' || p.sex === viewer.state.sex)).map((p) => p.id);
  let parked = behind();
  new MutationObserver(() => {
    if (parked === behind()) return;
    parked = !parked;
    viewerSelect(parked || !selected ? null : idsFor(selected)[0] ?? null);
  }).observe(root, { attributeFilter: ['class'] });
  const select = (plain: string | null) => viewer.select(plain ? idsFor(plain)[0] ?? null : null);
  // from the list: peel to the part's layer or turn its system on, then zoom (phone: collapse to see it)
  const pickFromList = (plain: string) => {
    const ids = idsFor(plain);
    if (!ids.length) return;
    const next = revealFor(byId.get(ids[0])!, viewer.state);
    for (const i of ids) next.hidden.delete(i);
    viewer.setState(next);
    viewer.select(ids[0]);
    viewer.frameIds(ids);
    if (matchMedia(SHEET_MQ).matches) sheet.setOpen(false);
  };
  const list = createList(viewer, pickFromList);
  const card = createCard(viewer, select);
  sheet.card.append(card.el);

  const depth = h('section', 'depth');
  const head = h('h2');
  const label = h('label', '', 'Depth') as HTMLLabelElement;
  label.htmlFor = 'body-depth';
  const now = h('span', 'depth-now');
  head.append(label, now);
  const slider = h('input') as HTMLInputElement;
  Object.assign(slider, { id: 'body-depth', type: 'range', min: '0', max: String(DEPTHS.length - 1), step: '1' });
  // the slider peels; an isolate would hide the result, so it ends (as the sample)
  slider.addEventListener('input', () => viewer.setState({ depth: DEPTHS[+slider.value], isolate: null }));
  const ticks = h('div', 'ticks');
  ticks.setAttribute('aria-hidden', 'true');
  ticks.append(...TICKS.map((t) => h('span', '', t)));
  depth.append(head, slider, ticks, top.legend, top.unhide);
  sheet.peek.append(depth);

  const systems = h('section');
  const chips = h('div', 'chips');
  chips.setAttribute('role', 'group');
  chips.setAttribute('aria-labelledby', 'body-show');
  const show = h('h2', '', 'Show');
  show.id = 'body-show';
  const sysBtns = SYSTEMS.map(([key, name]) => {
    const b = h('button', '', name) as HTMLButtonElement;
    b.type = 'button';
    b.addEventListener('click', () => {
      const next = new Set(viewer.state.systems);
      if (!next.delete(key)) next.add(key);
      viewer.setState({ systems: next });
    });
    chips.append(b);
    return b;
  });
  systems.append(show, chips);
  sheet.more.append(systems, list.el);

  // tap on the body selects (a drag rotates the camera instead), tap on the backdrop clears
  const canvas = root.querySelector<HTMLCanvasElement>('.body-stage canvas');
  let down: [number, number] | null = null;
  canvas?.addEventListener('pointerdown', (e) => { down = [e.clientX, e.clientY]; });
  canvas?.addEventListener('pointerup', (e) => {
    if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 6) return;
    down = null;
    viewer.select(viewer.pick(e.clientX, e.clientY));
  });

  root.append(top.el, sheet.el);

  const sync = () => {
    const s = viewer.state;
    const i = DEPTHS.indexOf(s.depth);
    slider.value = String(i);
    slider.setAttribute('aria-valuetext', TICKS[i]);
    now.textContent = s.isolate ? 'Isolated' : depthText(s.depth);
    sysBtns.forEach((b, k) => b.setAttribute('aria-pressed', String(s.systems.has(SYSTEMS[k][0]))));
    if (selected && !idsFor(selected).length) return select(null); // sex switch: the part is not on this body
    top.sync();
    list.sync(selected);
    card.show(selected);
  };
  viewer.onChange(sync);
  sync();

  // DEV hooks (§2b.11): ?part=<plain name> selects as from the list; ?open=list|card opens it
  if (import.meta.env.DEV) {
    const q = new URLSearchParams(location.search), part = q.get('part'), open = q.get('open');
    if (part) pickFromList(part);
    if (open === 'list') openList();
  }
}
