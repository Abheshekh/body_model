// Body page top bar (T6a), as the sample's `.top`: sex, skin tone, see-through, ghost, colour mode with
// legend, labels, list, Show hidden. Phone: compact, scrolls sideways, no title. Every control reads viewer.state
// in sync().
import { LAYER_COL, SKIN_TONES, SYS_COL, type SkinTone } from '../../body/materials';
import type { BodyViewer } from '../../body/scene';
import type { BodyState } from '../../body/state';

type Colour = BodyState['colour'];
const COLOURS: Colour[] = ['natural', 'layer', 'system'];
const COLOUR_NAME: Record<Colour, string> = { natural: 'natural', layer: 'by layer', system: 'by system' };
const SYS_LEGEND: [string, string][] = [
  ['Muscle', SYS_COL.muscle], ['Tendon', SYS_COL.tendon], ['Bone', SYS_COL.bone], ['Organ', SYS_COL.organ],
  ['Vessel', SYS_COL.vessel], ['Nerve', SYS_COL.nerve], ['Lymph', SYS_COL.lymph], ['Ligament', SYS_COL.joint],
];

export const layerName = (l: number) => (l === 1 ? 'Superficial' : l === 2 ? 'Intermediate' : l === 3 ? 'Deep' : `Deep ${l - 2}`);

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
const press = (b: HTMLElement, on: boolean) => b.setAttribute('aria-pressed', String(on));

// the legend and the phone's Show hidden are built here and placed by the page, under the depth slider
export function createTopBar(viewer: BodyViewer, onList: () => void): { el: HTMLElement; legend: HTMLElement; unhide: HTMLElement; sync(): void } {
  let tone: SkinTone = 'medium';
  let labels = true;
  const el = h('div', 'body-top');
  const row = h('div', 'body-top-row');

  const seg = h('div', 'seg');
  seg.setAttribute('role', 'group');
  seg.setAttribute('aria-label', 'Body');
  const male = button('Male', () => viewer.setState({ sex: 'male' }));
  const female = button('Female', () => viewer.setState({ sex: 'female' }));
  seg.append(male, female);

  const tones = h('div', 'tones');
  tones.setAttribute('role', 'group');
  tones.setAttribute('aria-label', 'Skin tone');
  const toneBtns = (Object.keys(SKIN_TONES) as SkinTone[]).map((t) => {
    const b = button('', () => { tone = t; viewer.setSkinTone(t); sync(); });
    b.className = 'tone';
    b.style.setProperty('--c', SKIN_TONES[t]);
    b.setAttribute('aria-label', `${t[0].toUpperCase()}${t.slice(1)} skin tone`);
    tones.append(b);
    return b;
  });

  const see = button('See-through skin', () => viewer.setState({ seeThrough: !viewer.state.seeThrough }));
  const ghost = button('Ghost peeled', () => viewer.setState({ ghost: !viewer.state.ghost }));
  const colour = button('', () => viewer.setState({ colour: COLOURS[(COLOURS.indexOf(viewer.state.colour) + 1) % 3] }));
  const lab = button('Labels', () => { labels = !labels; viewer.setLabels(labels); sync(); });
  const list = button('List', onList);
  // user-hidden parts come back; default-hidden ones (omentum, pleura…) stay hidden. Top bar on wide, sheet on
  // phone (CSS picks one)
  const defaults = new Set(viewer.parts.filter((p) => p.defaultHidden).map((p) => p.id));
  const unhideAll = () => viewer.setState({ hidden: new Set([...viewer.state.hidden].filter((i) => defaults.has(i))) });
  const unhide = [button('', unhideAll), button('', unhideAll)];
  unhide.forEach((b) => b.classList.add('unhide'));
  row.append(h('h1', '', 'Body'), seg, tones, see, ghost, colour, lab, list, unhide[0]);

  const legend = h('div', 'legend');
  legend.setAttribute('aria-label', 'Colour legend');
  el.append(row);

  const sync = () => {
    const s = viewer.state;
    press(male, s.sex === 'male');
    press(female, s.sex === 'female');
    toneBtns.forEach((b, i) => press(b, Object.keys(SKIN_TONES)[i] === tone));
    press(see, s.seeThrough);
    press(ghost, s.ghost);
    press(lab, labels);
    colour.textContent = `Colour: ${COLOUR_NAME[s.colour]}`;
    const n = new Set(viewer.parts.filter((p) => s.hidden.has(p.id) && !defaults.has(p.id)).map((p) => p.plain)).size;
    for (const b of unhide) {
      b.hidden = !n;
      b.textContent = `Show hidden (${n})`;
    }
    const items: [string, string][] = s.colour === 'layer' ? LAYER_COL.slice(1).map((c, i) => [layerName(i + 1), c])
      : s.colour === 'system' ? SYS_LEGEND : [];
    legend.hidden = !items.length;
    legend.replaceChildren(...items.map(([name, c]) => {
      const it = h('span', '', name);
      const sw = h('i', 'sw');
      sw.style.background = c;
      it.prepend(sw);
      return it;
    }));
  };
  return { el, legend, unhide: unhide[1], sync };
}
