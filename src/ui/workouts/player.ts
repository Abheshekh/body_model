// Workouts player (R9, routes #workouts/exercises/<id>[/<variant>], #workouts/tasks/<id>[/<variant>]): plays the
// variant's two keyframes on the view sex (ping-pong, as the prototype's frame loop), with its props. Muscles are
// coloured by role (prime / synergist / stabiliser, level-weighted as the prototype's setRoles) from the provisional
// lists (provisional_muscles.json, §2b.16 side suffixes). prefers-reduced-motion: no autoplay, the slider steps.
// Phone: controls in a bottom sheet, collapsed by default; the viewer frames the body above it.
import * as THREE from 'three';
import { loadRig } from '../../body/load';
import type { BodyViewer } from '../../body/scene';
import { fromPrototype, lerpPose, PROTO_ROOT_Y, type Pose, type ProtoPose } from '../../rig/pose';
import { createSkeleton } from '../../rig/skeleton';
import { fitAbove, loadLibrary, TITLE, type Kind, type RoleEntry, type Variant } from './library';
import { createProps } from './props';

const PERIOD_S = 1.5; // one way, as the prototype
const PROVISIONAL = 'Muscle lists are provisional until the effort engine (R4).';
type Role = 'prime' | 'syn' | 'stab';
const ROLES: [Role, string, string][] = [
  ['prime', 'Prime mover', 'does the work'], ['syn', 'Synergist', 'helps'], ['stab', 'Stabiliser', 'holds you still']];
export const ROLE_COL: Record<Role, string> = { prime: '#c2302a', syn: '#e58a17', stab: '#2c6cb0' }; // prototype C_ROLE
const REST = '#c9988a'; // prototype C_REST: a muscle with no role

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
    const [list, groups, rig] = await Promise.all([
      loadLibrary(kind),
      fetch(`${import.meta.env.BASE_URL}data/provisional_muscles.json`).then((r) => {
        if (!r.ok) throw new Error(`provisional_muscles.json ${r.status}`);
        return r.json() as Promise<{ groups: Record<string, string[]> }>;
      }).then((d) => d.groups),
      viewer ? loadRig(viewer.manifest) : null,
    ]);
    if (disposed) return;
    const entry = list.find((e) => e.id === itemId);
    if (!entry) return body.replaceChildren(h('p', 'notice', `No ${kind === 'exercises' ? 'exercise' : 'task'} "${itemId}".`));
    // ponytail: an unknown variant id plays the first variant, as the prototype
    const v: Variant = entry.variants.find((x) => x.id === variantId) ?? entry.variants[0];

    // ---- sheet: title, variant, transport, legend and the provisional notice (always shown); the rest under the handle on phone ----
    const handle = btn('', () => {
      const open = sheet.classList.toggle('open');
      handle.setAttribute('aria-expanded', String(open));
      handle.setAttribute('aria-label', open ? 'Show less' : 'Show more');
      fit();
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

    const notice = h('p', 'notice', PROVISIONAL); // always shown, also in the collapsed phone sheet
    const more = h('div', 'more');
    if (v.note) more.append(h('p', '', v.note));
    for (const [r, name, what] of ROLES) {
      const es = v.muscles[r];
      if (!es.length) continue;
      const hd = h('h2');
      const sw = h('i', 'sw');
      sw.style.background = ROLE_COL[r];
      hd.append(sw, `${name}: ${what}`);
      const ul = h('ul', 'roles');
      for (const [key, , why] of es) {
        const [base, side] = key.split('_');
        const li = h('li');
        li.append(h('span', 'item-name', (groups[base] ?? [base]).join(', ') + (side === 'L' ? ' (left)' : side === 'R' ? ' (right)' : '')));
        if (why) li.append(h('span', 'muted', why));
        ul.append(li);
      }
      more.append(hd, ul);
    }
    more.append(h('h2', '', 'Form'));
    const cues = h('ul', 'cues');
    for (const c of entry.cues) cues.append(h('li', '', c));
    for (const c of entry.avoid) cues.append(h('li', '', `Avoid: ${c.charAt(0).toLowerCase()}${c.slice(1)}`));
    more.append(cues, h('p', 'muted', 'Education only, not medical advice. Muscle roles follow standard kinesiology (provisional lists).'));

    body.replaceChildren(handle, ...head, transport, legend, notice, more);
    syncPlay();
    fit();
    if (!viewer || !rig) return void more.prepend(h('p', 'notice', 'The body could not be loaded, so the animation is off.'));

    // ---- muscle colours (prototype setRoles): every muscle rests in one muted colour; a role muscle mixes its role
    // colour in by level. ponytail: the viewer has one highlight colour, so the colours go into the parts' natural
    // colours (natural colour mode) and are put back on leave; a per-part colour API if another screen needs it
    const snapshot = viewer.state;
    cleanup.push(() => viewer.setState(snapshot)); // runs after the colours are back (cleanup runs in reverse)
    const role = new Map<number, string>();
    const col = new THREE.Color();
    for (const r of ['stab', 'syn', 'prime'] as Role[]) { // later roles win, as the prototype
      for (const [key, level] of v.muscles[r] as RoleEntry[]) {
        const [base, s] = key.split('_');
        const names = new Set(groups[base] ?? []);
        const side = s === 'L' ? 'left' : s === 'R' ? 'right' : null;
        for (const p of viewer.parts)
          if (names.has(p.plain) && (!side || p.side === side)) role.set(p.id, '#' + col.set(REST).lerp(new THREE.Color(ROLE_COL[r]), 0.4 + 0.6 * level).getHexString());
      }
    }
    const own = new Map<number, string>();
    for (const p of viewer.parts) {
      if (p.kind !== 'muscle' && !role.has(p.id)) continue;
      own.set(p.id, p.colour);
      p.colour = role.get(p.id) ?? REST;
    }
    cleanup.push(() => { for (const p of viewer.parts) if (own.has(p.id)) p.colour = own.get(p.id)!; });
    viewer.setState({ colour: 'natural', depth: 1, isolate: null, seeThrough: false });

    // ---- pose and props ----
    const skel = createSkeleton(rig, viewer.state.sex);
    // pinAt is a prototype coordinate like the fixed props (pull-up bar, steps): scale it by the body as props.ts does
    const s = skel.H[skel.names.indexOf('pelvis')][1] / PROTO_ROOT_Y;
    const conv = (k: ProtoPose): Pose => {
      const p = fromPrototype(k);
      return p.pinAt ? { ...p, pinAt: p.pinAt.map((x) => x * s) as [number, number, number] } : p;
    };
    const a = conv(v.proto.a), b = conv(v.proto.b);
    const props = createProps(viewer, v.props, skel);
    cleanup.push(() => props.dispose());
    const show = (u: number) => {
      const e = u * u * (3 - 2 * u); // smoothstep, as the prototype
      const p = lerpPose(a, b, e);
      void viewer.setPose(p);
      props.update(skel.posed(p));
    };
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
