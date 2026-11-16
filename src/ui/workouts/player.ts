// Workouts player (R9, routes #workouts/exercises/<id>[/<variant>], #workouts/tasks/<id>[/<variant>]): plays the
// variant's two keyframes on the view sex (ping-pong, as the prototype's frame loop), with its props. Muscle effort
// comes from the engine (R4): colours from the peak levels and roles over a → b (effortOverMove, level-weighted as the
// prototype's setRoles), the muscle panel live at the current frame (≤ 10 Hz). Loads and supports from the prop and
// pin tables (setupVariant), kg per load editable. prefers-reduced-motion: no autoplay, the slider steps.
// Phone: controls in a bottom sheet, collapsed by default; the viewer frames the body above it.
import * as THREE from 'three';
import type { BodyViewer } from '../../body/scene';
import { effort, effortOverMove } from '../../engine/effort';
import { loadEngine } from '../../engine/load';
import { setupVariant, supportPin } from '../../engine/setup';
import type { EffortInput, EffortResult } from '../../engine/types';
import { fromPrototype, lerpPose, PROTO_ROOT_Y, type Pose, type ProtoPose } from '../../rig/pose';
import { mountEffortPanel, topLine, type PanelCtx } from './effort-panel';
import { fitAbove, loadLibrary, REST, ROLE_COL, TITLE, type Kind, type Variant } from './library';
import { createProps } from './props';

export { ROLE_COL } from './library'; // effort-panel.ts imports it from here

const PERIOD_S = 1.5; // one way, as the prototype
const LIVE_MS = 100; // panel updates at most 10 times a second
type Role = keyof typeof ROLE_COL;
const ROLES: [Role, string, string][] = [
  ['prime', 'Prime mover', 'does the work'], ['syn', 'Synergist', 'helps'], ['stab', 'Stabiliser', 'holds you still']];
const ROLE_OF = { work: 'prime', help: 'syn', hold: 'stab' } as const;
const LOAD_NAME: Record<string, string> = { bar: 'Bar', dbL: 'Left dumbbell', dbR: 'Right dumbbell', bucket: 'Bucket',
  bucketR: 'Bucket (right hand)', bagL: 'Left bag', bagR: 'Right bag', box: 'Box', mop: 'Mop', handle: 'Cable', legpress: 'Sled' };

const h = (tag: string, cls = '', text = ''): HTMLElement => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
};
const btn = (text: string, on: () => void, cls = ''): HTMLButtonElement => {
  const b = h('button', cls, text) as HTMLButtonElement;
  b.type = 'button';
  b.addEventListener('click', on);
  return b;
};

export function mountPlayer(root: HTMLElement, viewer: BodyViewer | null, kind: Kind, itemId: string, variantId?: string): () => void {
  let disposed = false;
  const cleanup: (() => void)[] = [];
  const sheet = h('section', 'sheet player');
  sheet.setAttribute('aria-label', TITLE[kind]);
  const back = h('a', 'back', `← ${TITLE[kind]}`) as HTMLAnchorElement;
  back.href = `#workouts/${kind}`;
  const body = h('div', '', 'Loading…');
  sheet.append(back, body);
  root.replaceChildren(sheet);
  const [fit, unfit] = fitAbove(viewer, sheet);
  cleanup.push(unfit);

  void (async () => {
    const [list, engine] = await Promise.all([loadLibrary(kind), viewer ? loadEngine(viewer.manifest) : null]);
    if (disposed) return;
    const entry = list.find((e) => e.id === itemId);
    if (!entry) return body.replaceChildren(h('p', 'notice', `No ${kind === 'exercises' ? 'exercise' : 'task'} "${itemId}".`));
    // ponytail: an unknown variant id plays the first variant, as the prototype
    const v: Variant = entry.variants.find((x) => x.id === variantId) ?? entry.variants[0];

    // ---- sheet: title, variant, transport, legend and the top-muscles line (always shown); the rest under the handle on phone ----
    const handle = btn('', () => {
      const open = sheet.classList.toggle('open');
      handle.setAttribute('aria-expanded', String(open));
      handle.setAttribute('aria-label', open ? 'Show less' : 'Show more');
      fit();
      viewer?.frameIds(viewer.parts.filter((p) => p.kind === 'skin').map((p) => p.id)); // whole body above the sheet
    }, 'sheet-handle');
    handle.setAttribute('aria-expanded', 'false');
    handle.setAttribute('aria-label', 'Show more');

    const head: HTMLElement[] = [h('h1', '', entry.name)];
    if (entry.variants.length > 1) {
      const sel = h('select') as HTMLSelectElement;
      sel.id = 'player-variant';
      sel.append(...entry.variants.map((x) => Object.assign(document.createElement('option'), { value: x.id, textContent: x.name, selected: x === v })));
      sel.addEventListener('change', () => { location.hash = `#workouts/${kind}/${entry.id}/${sel.value}`; });
      const label = h('label', 'sr-only', 'Way to do it') as HTMLLabelElement;
      label.htmlFor = sel.id;
      const row = h('div', 'player-variant');
      row.append(label, sel);
      head.push(row);
    } else head.push(h('p', 'muted', v.name));

    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    let playing = !reduce, t = 0, dir = 1;
    const play = btn('', () => { playing = !playing; syncPlay(); });
    const range = h('input') as HTMLInputElement;
    // reduced motion: 5 positions to step through instead of a continuous scrub
    Object.assign(range, { type: 'range', min: '0', max: '100', step: reduce ? '25' : '1', value: '0' });
    range.setAttribute('aria-label', 'Position in the movement');
    range.addEventListener('input', () => { playing = false; syncPlay(); t = +range.value / 100; show(t); });
    const syncPlay = () => {
      play.textContent = playing ? 'Pause' : 'Play';
      range.setAttribute('aria-valuetext', `${range.value}%`);
    };
    const transport = h('div', 'player-transport');
    transport.append(play, range);

    const legend = h('div', 'legend');
    legend.setAttribute('aria-label', 'Muscle colours');
    for (const [r, name, what] of ROLES) {
      const it = h('span', '', name);
      it.title = what;
      const sw = h('i', 'sw');
      sw.style.background = ROLE_COL[r];
      it.prepend(sw);
      legend.append(it);
    }

    // one line (ellipsis), there from the start, so the collapsed sheet keeps its height while the frame plays
    const top = h('p', 'notice effort-top', '\u00a0');
    const more = h('div', 'more');
    if (v.note) more.append(h('p', '', v.note));
    const fx = h('div');
    more.append(fx, h('h2', '', 'Form'));
    const cues = h('ul', 'cues');
    for (const c of entry.cues) cues.append(h('li', '', c));
    for (const c of entry.avoid) cues.append(h('li', '', `Avoid: ${c.charAt(0).toLowerCase()}${c.slice(1)}`));
    more.append(cues, h('p', 'muted', 'Education only, not medical advice. Muscle levels are estimates from a static model.'));

    body.replaceChildren(handle, ...head, transport, legend, top, more);
    syncPlay();
    fit();
    if (!viewer || !engine) top.hidden = true;
    if (!viewer || !engine) return void more.prepend(h('p', 'notice', 'The body could not be loaded, so the animation and muscle effort are off.'));

    // ---- muscle colours (prototype setRoles): every muscle rests in one muted colour; a role muscle mixes its role
    // colour in by level. ponytail: the viewer has one highlight colour, so the colours go into the parts' natural
    // colours (natural colour mode) and are put back on leave; a per-part colour API if another screen needs it
    const snapshot = viewer.state;
    cleanup.push(() => viewer.setState(snapshot)); // runs after the colours are back (cleanup runs in reverse)
    const own = new Map<number, string>();
    for (const p of viewer.parts) if (p.kind === 'muscle') own.set(p.id, p.colour);
    cleanup.push(() => { for (const p of viewer.parts) if (own.has(p.id)) p.colour = own.get(p.id)!; });
    const col = new THREE.Color();
    const colour = (r: EffortResult) => {
      for (const p of viewer.parts) {
        if (!own.has(p.id)) continue;
        const m = r.muscle[p.id];
        p.colour = !m || m.role === 'none' || !(m.level > 0) ? REST
          : '#' + col.set(REST).lerp(new THREE.Color(ROLE_COL[ROLE_OF[m.role]]), 0.4 + 0.6 * m.level).getHexString();
      }
    };
    viewer.setState({ colour: 'natural', depth: 1, isolate: null, seeThrough: false });

    // ---- pose and props ----
    const sex = viewer.state.sex, { data, tables } = engine;
    const skel = data.skel[sex];
    // pinAt is a prototype coordinate like the fixed props (pull-up bar, steps): scale it by the body as props.ts does
    const s = skel.H[skel.names.indexOf('pelvis')][1] / PROTO_ROOT_Y;
    const conv = (k: ProtoPose): Pose => {
      const p = fromPrototype(k);
      return p.pinAt ? { ...p, pinAt: p.pinAt.map((x) => x * s) as [number, number, number] } : p;
    };
    const a = conv(v.proto.a), b = conv(v.proto.b);
    const props = createProps(viewer, v.props, skel);
    cleanup.push(() => props.dispose());
    let cur = a, curE = 0, dirty = true;
    const show = (u: number) => {
      const e = u * u * (3 - 2 * u); // smoothstep, as the prototype
      const p = lerpPose(a, b, e);
      void viewer.setPose(p);
      props.update(skel.posed(p));
      [cur, curE, dirty] = [p, e, true];
    };

    // ---- effort: peak colours over a → b; kg per load; the panel and the top line live at the current frame ----
    const kg: Record<string, number> = {};
    let input: Omit<EffortInput, 'pose' | 'poseB'>;
    const recompute = () => {
      input = { sex, ...setupVariant(entry.id, v.id, v.props, supportPin(v.proto.a), tables, kg) };
      colour(effortOverMove(a, b, input, data));
      viewer.setState({}); // writes the new part colours
      dirty = true;
    };
    recompute();
    const loadsBox = h('div');
    for (const l of input!.loads) {
      const id = `player-kg-${l.id}`;
      const label = h('label', '', `${LOAD_NAME[l.id.split('#')[0]] ?? l.id} (kg)`) as HTMLLabelElement;
      label.htmlFor = id;
      const num = h('input') as HTMLInputElement;
      Object.assign(num, { id, type: 'number', min: '0', max: '500', step: '0.5', inputMode: 'decimal', value: String(l.kg) });
      num.addEventListener('change', () => {
        const x = num.valueAsNumber;
        if (Number.isFinite(x) && x >= 0 && x <= 500) { kg[l.id] = x; recompute(); } else num.value = String(kg[l.id] ?? l.kg);
      });
      const row = h('div', 'axis');
      row.append(label, h('span'), num);
      loadsBox.append(row);
    }
    if (loadsBox.childElementCount) fx.append(h('h2', '', 'Load'), loadsBox);
    fx.append(h('h2', '', 'Muscles'));
    const panel = mountEffortPanel(fx, { sources: engine.sources });
    cleanup.push(() => panel.dispose());
    const ctx: PanelCtx = { parts: new Map(data.parts.map((p) => [p.id, { plain: p.plain, side: p.side }])), sources: engine.sources };
    const live = () => {
      if (!dirty) return;
      dirty = false;
      // roles from the a → b motion: poseB − pose = b − a on every axis (poseB is only compared, never posed)
      const r = effort({ ...input, pose: cur, poseB: lerpPose(a, b, curE + 1) }, data);
      panel.update(r, ctx);
      top.textContent = topLine(r, ctx);
    };
    const tick = setInterval(live, LIVE_MS);
    cleanup.push(() => clearInterval(tick));
    await viewer.setPose(a); // loads rig and weights
    if (disposed) return;
    // frame the body mid-movement, from the variant's camera azimuth (prototype default 26°)
    viewer.setView('front');
    const az = (v.cam?.az ?? 26) * (Math.PI / 180);
    const c = viewer.camera.position, r = Math.hypot(c.x, c.z);
    c.set(Math.sin(az) * r, c.y, Math.cos(az) * r);
    show(0.5);
    viewer.frameIds(viewer.parts.filter((p) => p.kind === 'skin').map((p) => p.id));
    await new Promise(requestAnimationFrame); // frameIds measures in a microtask: keep the mid pose until then
    if (disposed) return;
    show(t);

    let last = 0, raf = 0;
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.05, (now - last) / 1000 || 0);
      last = now;
      if (!playing) return;
      t += (dir * dt) / PERIOD_S;
      if (t >= 1) { t = 1; dir = -1; } else if (t <= 0) { t = 0; dir = 1; }
      range.value = String(Math.round(t * 100));
      show(t);
    };
    raf = requestAnimationFrame(frame);
    cleanup.push(() => cancelAnimationFrame(raf));
  })().catch((e: unknown) => {
    if (!disposed) body.replaceChildren(h('p', 'notice', `Could not load the player: ${e instanceof Error ? e.message : String(e)}`));
  });

  return () => {
    disposed = true;
    cleanup.splice(0).reverse().forEach((f) => f());
    void viewer?.setPose(null); // §2b.20: leaving the player puts the body back at rest
    root.replaceChildren();
  };
}
