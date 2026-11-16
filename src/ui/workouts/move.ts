// Move screen (R7, route #workouts/move): pose the body by hand on the view sex. Joint handles over the body: tap
// selects (panel: slider + number per axis, limits from joints.json), drag bends the joint inside its limits (hinges
// stay in their plane), drag a hand or foot = IK for that limb (a dragged foot comes free), drag the pelvis = move
// the body with planted feet (IK). Undo/redo/reset, keyframes (localStorage bodyModel.move.v1, §2b.20).
// Keyboard: Tab cycles joints, arrows nudge the selected axis 1° (Shift 10°). Muscle effort (R4): live for the current
// pose (≤ 10 Hz), supports from the pin (pins.default when none), a hand load split over both hands. Phone: controls
// in a bottom sheet, collapsed by default; the viewer frames the body above it.
import * as THREE from 'three';
import type { Inset } from '../../body/model';
import type { BodyViewer, View } from '../../body/scene';
import { effort } from '../../engine/effort';
import { loadEngine } from '../../engine/load';
import { setupVariant } from '../../engine/setup';
import type { Load } from '../../engine/types';
import type { Vec3 } from '../../rig/ik';
import { emptyPose, lerpPose, type Limits, type Pose, type Root } from '../../rig/pose';
import { mv, type Limb, type Posed } from '../../rig/skeleton';
import { mountEffortPanel, topLine, type PanelCtx } from './effort-panel';

const STORE = 'bodyModel.move.v1';
const SEG_MS = 1000; // one keyframe blend
const LIVE_MS = 100; // effort panel updates at most 10 times a second
const JOINTS = ['pelvis', 'lumbar', 'thoracic', 'neck', 'head', 'shoulder_l', 'elbow_l', 'wrist_l', 'shoulder_r', 'elbow_r',
  'wrist_r', 'hip_l', 'knee_l', 'ankle_l', 'hip_r', 'knee_r', 'ankle_r'];
const BIG = new Set(['pelvis', 'wrist_l', 'wrist_r', 'ankle_l', 'ankle_r']); // pelvis, hands and feet
type Tip = [bone: string, end: 0 | 1]; // bone head (0) or tail (1)
// the point a drag pulls: the next joint down the chain (wrist/ankle: the handle itself, solved by IK)
const TIP: Record<string, Tip> = { lumbar: ['neck_01', 0], thoracic: ['neck_01', 0], neck: ['head', 1], head: ['head', 1] };
const IK: Record<string, Limb> = {};
for (const s of ['_l', '_r'] as const) {
  Object.assign(TIP, { ['shoulder' + s]: ['lowerarm' + s, 0], ['elbow' + s]: ['hand' + s, 0], ['wrist' + s]: ['hand' + s, 0],
    ['hip' + s]: ['calf' + s, 0], ['knee' + s]: ['foot' + s, 0], ['ankle' + s]: ['foot' + s, 0] });
  IK['wrist' + s] = `arm${s}`;
  IK['ankle' + s] = `leg${s}`;
}
const TWIST = new Set(['rot', 'twist', 'turn', 'pron']); // long-axis turns do not move the tip: not dragged
const NAME: Record<string, string> = { pelvis: 'Pelvis', lumbar: 'Lower back', thoracic: 'Upper back', neck: 'Neck', head: 'Head',
  shoulder: 'shoulder', elbow: 'elbow', wrist: 'wrist (hand)', hip: 'hip', knee: 'knee', ankle: 'ankle (foot)' };
const AXIS: Record<string, string> = { flex: 'Flexion', abd: 'Abduction', rot: 'Internal rotation', pron: 'Pronation',
  dev: 'Radial deviation', inv: 'Inversion', side: 'Side bend left', twist: 'Twist left', turn: 'Turn left',
  pitch: 'Tilt forward', roll: 'Raise right hip', yaw: 'Turn left' };
const jointName = (k: string) => (k.endsWith('_l') ? `Left ${NAME[k.slice(0, -2)]}` : k.endsWith('_r') ? `Right ${NAME[k.slice(0, -2)]}` : NAME[k]);
const axisName = (k: string, a: string) => (a === 'flex' && k.startsWith('ankle') ? 'Dorsiflexion' : AXIS[a] ?? a);
const HINT = 'Tap a joint to bend it. Drag a joint, a hand, a foot or the pelvis to move it.';
const HELP = 'Drag empty space or Ctrl+drag to turn the view, scroll or pinch to zoom, right-drag to pan. '
  + 'Keyboard: Tab through the joints, arrow keys nudge the selected axis by 1°, Shift+arrow by 10°.';

const add = (p: Vec3, q: Vec3): Vec3 => [p[0] + q[0], p[1] + q[1], p[2] + q[2]];
const sub = (p: Vec3, q: Vec3): Vec3 => [p[0] - q[0], p[1] - q[1], p[2] - q[2]];
const dot = (p: Vec3, q: Vec3) => p[0] * q[0] + p[1] * q[1] + p[2] * q[2];

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

const loadKeys = (): Pose[] => {
  try {
    const d = JSON.parse(localStorage.getItem(STORE) ?? 'null') as { keys?: Pose[] } | null;
    return Array.isArray(d?.keys) ? d.keys.filter((k) => k && k.root && k.joints) : [];
  } catch {
    return [];
  }
};

export function mountMove(root: HTMLElement, viewer: BodyViewer | null): () => void {
  const sheet = h('section', 'sheet move');
  sheet.setAttribute('aria-label', 'Move');
  sheet.append(h('p', '', viewer ? 'Loading…' : 'The body could not be loaded, so Move is off.'));
  root.replaceChildren(sheet);
  const canvas = document.querySelector<HTMLCanvasElement>('.body-stage canvas');
  if (!viewer || !canvas) return () => root.replaceChildren();

  let disposed = false;
  const cleanup: (() => void)[] = [];
  const on = <K extends keyof HTMLElementEventMap>(el: HTMLElement | Window, t: K, f: (e: HTMLElementEventMap[K]) => void) => {
    el.addEventListener(t, f as EventListener);
    cleanup.push(() => el.removeEventListener(t, f as EventListener));
  };

  void (async () => {
    const loaded = await (async () => {
      const res = await fetch(`${import.meta.env.BASE_URL}data/joints.json`);
      if (!res.ok) throw new Error(`joints.json ${res.status}`);
      const out = [((await res.json()) as { joints: Limits }).joints, await loadEngine(viewer.manifest)] as const;
      if (disposed) return null; // left Move while loading: no setPose after dispose (the body stays at rest)
      await viewer.setPose(emptyPose()); // loads the weights pack
      return out;
    })().catch((e: unknown) => {
      if (!disposed) sheet.replaceChildren(h('p', '', `Could not load Move: ${e instanceof Error ? e.message : String(e)}`));
      return null;
    });
    if (!loaded || disposed) return;
    const [limits, engine] = loaded;
    const sex = viewer.state.sex, skel = engine.data.skel[sex];

    // ---- pose math ----
    const get = (p: Pose, k: string, a: string) => (k === 'pelvis' ? p.root[a as keyof Root] : p.joints[k]?.[a]) ?? 0;
    const set = (p: Pose, k: string, a: string, v: number): Pose => (k === 'pelvis'
      ? { ...p, root: { ...p.root, [a]: v } } : { ...p, joints: { ...p.joints, [k]: { ...p.joints[k], [a]: v } } });
    const put = (p: Pose, k: string, a: string, v: number) => {
      const l = limits[k]?.[a];
      return set(p, k, a, l ? Math.min(l.max, Math.max(l.min, v)) : v);
    };
    const at = (f: Posed, [bone, end]: Tip): Vec3 => {
      const i = skel.names.indexOf(bone);
      return add(mv(f.Rs[i], (end ? skel.T : skel.H)[i]), f.ts[i]);
    };
    // ponytail: coordinate descent on finite differences (a few dozen FK runs per pointer move); a joint with a
    // closed form (two-bone limbs) uses skel.solveLimb instead
    const reach = (p: Pose, k: string, axes: string[], tip: Tip, target: Vec3): Pose => {
      for (let it = 0; it < 12; it++) {
        for (const a of axes) {
          const t0 = at(skel.fk(p), tip);
          const J = sub(at(skel.fk(set(p, k, a, get(p, k, a) + 1)), tip), t0); // metres per degree
          const jj = dot(J, J);
          if (jj > 1e-10) p = put(p, k, a, get(p, k, a) + Math.max(-30, Math.min(30, dot(J, sub(target, t0)) / jj)));
        }
      }
      return p;
    };

    // planted feet: ankle and ball-joint targets per side (null = free)
    type Plant = { ankle: Vec3; ball: Vec3 } | null;
    const feet = (p: Pose, s: string, floor: boolean): Plant => {
      const f = skel.fk(p), r = skel.fk(emptyPose());
      const a = at(f, ['foot' + s, 0]), b = at(f, ['ball' + s, 0]);
      if (floor) [a[1], b[1]] = [at(r, ['foot' + s, 0])[1], at(r, ['ball' + s, 0])[1]];
      return { ankle: a, ball: b };
    };
    const planted: Record<string, Plant> = { _l: feet(emptyPose(), '_l', false), _r: feet(emptyPose(), '_r', false) };
    const settle = (p: Pose): Pose => {
      for (const s of ['_l', '_r']) {
        const pl = planted[s];
        if (!pl) continue;
        p = skel.solveLimb(p, `leg${s}` as Limb, pl.ankle, limits);
        p = reach(p, 'ankle' + s, ['flex', 'inv'], ['ball' + s, 0], pl.ball); // keep the sole where it was
      }
      return p;
    };
    // a pose loaded whole (undo, keyframe, reset): planted feet stay where that pose has them
    const replant = () => { for (const s of ['_l', '_r']) if (planted[s]) planted[s] = feet(pose, s, false); };

    // ---- handles ----
    const geo = new THREE.SphereGeometry(1, 16, 12);
    const mat = (color: string, opacity: number) => new THREE.MeshBasicMaterial({ color, opacity, transparent: true, depthTest: false, toneMapped: false });
    const offMat = mat('#e8ecf1', 0.85), onMat = mat('#ffd400', 1);
    const group = new THREE.Group();
    const handles = new Map(JOINTS.map((k) => {
      const m = new THREE.Mesh(geo, offMat);
      m.scale.setScalar(BIG.has(k) ? 0.026 : 0.016);
      m.renderOrder = 20; // drawn over the body (no depth test)
      group.add(m);
      return [k, m] as const;
    }));
    viewer.addOverlay(group);
    cleanup.push(() => { viewer.removeOverlay(group); geo.dispose(); offMat.dispose(); onMat.dispose(); });
    // nearest handle within 22 px of a client point (a 44 px touch target, whatever the zoom)
    const hit = (x: number, y: number): string | null => {
      const r = canvas.getBoundingClientRect();
      let best: string | null = null, bd = 22;
      for (const [k, m] of handles) {
        const v = m.position.clone().project(viewer.camera);
        const d = Math.hypot(r.left + ((v.x + 1) / 2) * r.width - x, r.top + ((1 - v.y) / 2) * r.height - y);
        if (v.z < 1 && d < bd) [best, bd] = [k, d];
      }
      return best;
    };

    // ---- state ----
    let pose = emptyPose();
    let sel: string | null = null, selAxis: string | null = null;
    const past: Pose[] = [], future: Pose[] = [];
    const keys = loadKeys();
    let cur = -1, loop = false, play: number | null = null, dirty = true;
    cleanup.push(() => { if (play !== null) cancelAnimationFrame(play); });
    const show = (p: Pose) => {
      pose = p;
      dirty = true;
      void viewer.setPose(p);
      const f = skel.fk(p);
      for (const [k, m] of handles) m.position.set(...skel.jointPosition(f, k));
      syncValues();
    };
    const commit = (before: Pose) => {
      past.push(before);
      if (past.length > 100) past.shift();
      future.length = 0;
      sync();
    };
    const edit = (p: Pose) => { const b = pose; show(p); commit(b); };
    const load = (p: Pose) => { edit(p); replant(); };

    // ---- sheet ----
    const panel = h('div', 'move-joint');
    const undo = btn('Undo', () => { const p = past.pop(); if (p) { future.push(pose); show(p); replant(); sync(); } });
    const redo = btn('Redo', () => { const p = future.pop(); if (p) { past.push(pose); show(p); replant(); sync(); } });
    const views = h('div', 'seg');
    views.setAttribute('role', 'group');
    views.setAttribute('aria-label', 'View');
    const skin = viewer.parts.filter((p) => p.kind === 'skin').map((p) => p.id);
    const fit = () => viewer.frameIds(skin);
    for (const [v, t] of [['front', 'Front'], ['side', 'Side'], ['back', 'Back']] as [View, string][])
      views.append(btn(t, () => { viewer.setView(v); fit(); }));
    const bar = h('div', 'move-bar');
    bar.append(undo, redo, views);

    const resetJoint = btn('Reset joint', () => {
      if (!sel) return;
      if (sel === 'pelvis') return edit(settle({ ...pose, root: emptyPose().root }));
      const joints = { ...pose.joints };
      delete joints[sel];
      edit({ ...pose, joints });
    });
    const resetBody = btn('Reset body', () => {
      stop();
      planted._l = feet(emptyPose(), '_l', false);
      planted._r = feet(emptyPose(), '_r', false);
      edit(emptyPose());
    });
    const plant = btn('Plant feet', () => {
      if (planted._l && planted._r) planted._l = planted._r = null;
      else {
        planted._l = feet(pose, '_l', true);
        planted._r = feet(pose, '_r', true);
        edit(settle(pose));
      }
      sync();
    });
    const acts = h('div', 'move-acts');
    acts.append(resetJoint, resetBody, plant);
    const strip = h('div', 'move-keys');
    strip.setAttribute('role', 'group');
    strip.setAttribute('aria-label', 'Keyframes');
    // ---- muscle effort: hand load field and the panel, live at the current pose ----
    let handKg = 0;
    const kgRow = h('div', 'axis');
    const kgLabel = h('label', '', 'Hand load (kg)') as HTMLLabelElement;
    kgLabel.htmlFor = 'move-hand-kg';
    const kgNum = h('input') as HTMLInputElement;
    Object.assign(kgNum, { id: 'move-hand-kg', type: 'number', min: '0', max: '100', step: '0.5', inputMode: 'decimal', value: '0' });
    kgNum.addEventListener('change', () => {
      const x = kgNum.valueAsNumber;
      if (Number.isFinite(x) && x >= 0 && x <= 100) { handKg = x; dirty = true; } else kgNum.value = String(handKg);
    });
    kgRow.append(kgLabel, h('span'), kgNum);
    const top = h('p', 'notice effort-top', '\u00a0'); // the one summary line in the collapsed sheet
    const fx = h('div');
    fx.append(h('h2', '', 'Muscles'), kgRow);
    const effortPanel = mountEffortPanel(fx, { sources: engine.sources });
    cleanup.push(() => effortPanel.dispose());
    const ctx: PanelCtx = { parts: new Map(engine.data.parts.map((p) => [p.id, { plain: p.plain, side: p.side }])), sources: engine.sources };
    const live = () => {
      if (!dirty) return;
      dirty = false;
      // the kg is the total, split over both hands (loads.json convention for `hands`)
      const loads: Load[] = handKg > 0 ? [{ id: 'hands', kind: 'free', kg: handKg, at: 'hands' }] : [];
      const { supports } = setupVariant('move', 'pose', [], pose.pin, engine.tables);
      const r = effort({ pose, sex, loads, supports }, engine.data);
      effortPanel.update(r, ctx);
      top.textContent = topLine(r, ctx);
    };
    const tick = setInterval(live, LIVE_MS);
    cleanup.push(() => clearInterval(tick));

    const more = h('div', 'more');
    more.append(fx, acts, h('h2', '', 'Keyframes'), strip, h('p', 'muted', HELP));

    const handle = btn('', () => {
      const open = sheet.classList.toggle('open');
      handle.setAttribute('aria-expanded', String(open));
      handle.setAttribute('aria-label', open ? 'Show fewer controls' : 'Show more controls');
      applyInset();
      fit(); // whole body above the sheet
    }, 'sheet-handle');
    handle.setAttribute('aria-expanded', 'false');
    handle.setAttribute('aria-label', 'Show more controls');
    sheet.replaceChildren(handle, h('h1', 'sr-only', 'Move'), bar, top, panel, more);

    // ---- keyframes ----
    const save = () => {
      try { localStorage.setItem(STORE, JSON.stringify({ keys })); } catch { /* storage off: keyframes last this visit */ }
    };
    function stop() {
      if (play !== null) cancelAnimationFrame(play);
      play = null;
      sync();
    }
    const start = () => {
      if (keys.length < 2) return;
      const t0 = performance.now(), n = keys.length - 1;
      const step = (now: number) => {
        const t = (now - t0) / SEG_MS;
        if (t >= n && !loop) { show(keys[n]); return stop(); }
        const u = t % n, i = Math.floor(u);
        show(lerpPose(keys[i], keys[i + 1], u - i));
        play = requestAnimationFrame(step);
      };
      play = requestAnimationFrame(step);
      sync();
    };
    const renderStrip = () => {
      const kb = keys.map((k, i) => {
        const b = btn(String(i + 1), () => { stop(); cur = i; load(structuredClone(k)); });
        b.setAttribute('aria-label', `Keyframe ${i + 1}`);
        b.setAttribute('aria-pressed', String(i === cur));
        return b;
      });
      const addB = btn('Add', () => { keys.push(structuredClone(pose)); cur = keys.length - 1; save(); sync(); });
      const del = btn('Delete', () => { keys.splice(cur, 1); cur = -1; save(); sync(); });
      del.disabled = cur < 0;
      const playB = btn(play === null ? 'Play' : 'Stop', () => (play === null ? start() : stop()));
      playB.disabled = keys.length < 2;
      const loopB = btn('Loop', () => { loop = !loop; sync(); });
      loopB.setAttribute('aria-pressed', String(loop));
      strip.replaceChildren(...kb, addB, del, playB, loopB);
    };

    // ---- joint panel ----
    const rows = new Map<string, { row: HTMLElement; range: HTMLInputElement; num: HTMLInputElement }>();
    const setAxis = (a: string, v: number) => {
      if (!sel || !Number.isFinite(v)) return syncValues();
      const p = put(pose, sel, a, v);
      show(sel === 'pelvis' ? settle(p) : p);
    };
    const markAxis = () => { for (const [a, r] of rows) r.row.classList.toggle('on', a === selAxis); };
    const renderPanel = () => {
      rows.clear();
      if (!sel) return panel.replaceChildren(h('p', 'muted', HINT));
      const key = sel;
      const out: HTMLElement[] = [h('h2', '', jointName(key))];
      for (const [a, l] of Object.entries(limits[key] ?? {})) {
        const row = h('div', 'axis');
        const id = `move-${key}-${a}`;
        const label = h('label', '', axisName(key, a)) as HTMLLabelElement;
        label.htmlFor = id;
        const range = h('input') as HTMLInputElement;
        Object.assign(range, { id, type: 'range', min: String(l.min), max: String(l.max), step: '1' });
        const num = h('input') as HTMLInputElement;
        Object.assign(num, { type: 'number', min: String(l.min), max: String(l.max), step: '1', inputMode: 'numeric' });
        num.setAttribute('aria-label', `${axisName(key, a)}, degrees`);
        let before: Pose | null = null;
        range.addEventListener('input', () => { before ??= pose; setAxis(a, +range.value); });
        range.addEventListener('change', () => { if (before) commit(before); before = null; });
        num.addEventListener('change', () => { const b = pose; setAxis(a, num.valueAsNumber); if (pose !== b) commit(b); });
        for (const e of [range, num]) e.addEventListener('focus', () => { selAxis = a; markAxis(); });
        row.append(label, range, num);
        rows.set(a, { row, range, num });
        out.push(row);
      }
      panel.replaceChildren(...out);
      markAxis();
      syncValues();
    };
    function syncValues() {
      if (!sel) return;
      for (const [a, r] of rows) {
        const v = Math.round(get(pose, sel, a));
        r.range.value = r.num.value = String(v);
        r.range.setAttribute('aria-valuetext', `${v}°`);
      }
    }
    const select = (k: string) => {
      if (sel === k) return;
      const old = sel && handles.get(sel);
      if (old) old.material = offMat;
      sel = k;
      selAxis = Object.keys(limits[k] ?? {})[0] ?? null;
      handles.get(k)!.material = onMat;
      viewer.addOverlay(group); // redraw
      renderPanel();
      sync();
    };
    function sync() {
      undo.disabled = !past.length;
      redo.disabled = !future.length;
      resetJoint.disabled = !sel;
      plant.setAttribute('aria-pressed', String(!!(planted._l && planted._r)));
      renderStrip();
    }

    // ---- keyboard: one focusable button per joint (Tab cycles), arrows nudge the selected axis ----
    const kbd = h('div', 'sr-only');
    kbd.setAttribute('role', 'group');
    kbd.setAttribute('aria-label', 'Joints');
    for (const k of JOINTS) {
      const b = btn(jointName(k), () => select(k));
      b.addEventListener('focus', () => select(k));
      b.addEventListener('keydown', (e) => {
        const dir = { ArrowUp: 1, ArrowRight: 1, ArrowDown: -1, ArrowLeft: -1 }[e.key];
        if (!dir || !selAxis) return;
        e.preventDefault();
        stop();
        const p = put(pose, k, selAxis, get(pose, k, selAxis) + dir * (e.shiftKey ? 10 : 1));
        edit(k === 'pelvis' ? settle(p) : p);
      });
      kbd.append(b);
    }
    root.replaceChildren(kbd, sheet);

    // ---- pointer: drag handles; anything else orbits (OrbitControls) ----
    viewer.setOrbitGate((e) => e.ctrlKey || e.button !== 0 || !e.isPrimary || hit(e.clientX, e.clientY) === null);
    cleanup.push(() => viewer.setOrbitGate(null));
    const ray = new THREE.Raycaster();
    const rayHit = (e: PointerEvent, plane: THREE.Plane) => {
      const r = canvas.getBoundingClientRect();
      ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, 1 - ((e.clientY - r.top) / r.height) * 2), viewer.camera);
      return ray.ray.intersectPlane(plane, new THREE.Vector3());
    };
    let drag: { key: string; id: number; x: number; y: number; moved: boolean; before: Pose; plane: THREE.Plane;
      hit0: THREE.Vector3; tip0: Vec3; root0: Root } | null = null;
    on(canvas, 'pointerdown', (e) => {
      if (e.ctrlKey || e.button !== 0 || !e.isPrimary) return;
      const key = hit(e.clientX, e.clientY);
      if (!key) return;
      stop();
      select(key);
      // the grabbed point moves with the pointer in the plane facing the camera
      const h0 = handles.get(key)!.position.clone();
      const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(viewer.camera.getWorldDirection(new THREE.Vector3()), h0);
      const f = skel.fk(pose);
      drag = { key, id: e.pointerId, x: e.clientX, y: e.clientY, moved: false, before: pose, plane,
        hit0: rayHit(e, plane) ?? h0, tip0: key === 'pelvis' ? [h0.x, h0.y, h0.z] : at(f, TIP[key]), root0: { ...pose.root } };
      canvas.setPointerCapture(e.pointerId);
    });
    on(canvas, 'pointermove', (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      if (!drag.moved && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 4) return;
      drag.moved = true;
      const hp = rayHit(e, drag.plane);
      if (!hp) return;
      const d = hp.sub(drag.hit0), target = add(drag.tip0, [d.x, d.y, d.z]), k = drag.key, r0 = drag.root0;
      if (k === 'pelvis') return show(settle({ ...pose, root: { ...r0, x: r0.x + d.x, y: r0.y + d.y, z: r0.z + d.z } }));
      if (k.startsWith('ankle')) planted[k.slice(-2)] = null; // a dragged foot comes free
      show(IK[k] ? skel.solveLimb(pose, IK[k], target, limits) : reach(pose, k, Object.keys(limits[k] ?? {}).filter((a) => !TWIST.has(a)), TIP[k], target));
    });
    const up = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.id) return;
      if (drag.moved) commit(drag.before);
      drag = null;
    };
    on(canvas, 'pointerup', up);
    on(canvas, 'pointercancel', up);

    // ---- layout: the viewer centres and frames the body in the canvas area not under the nav or the sheet ----
    // ponytail: same measure as src/ui/programs.ts applyInset; share it if a third screen needs it
    const applyInset = () => {
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
    const ro = new ResizeObserver(applyInset);
    ro.observe(sheet);
    on(window, 'resize', applyInset);
    cleanup.push(() => { ro.disconnect(); viewer.setViewInset({ top: 0, right: 0, bottom: 0, left: 0 }); });

    show(pose);
    renderPanel();
    sync();
    applyInset();
    fit();
  })();

  return () => {
    disposed = true;
    if (cleanup.length) cleanup.splice(0).reverse().forEach((f) => f());
    void viewer.setPose(null); // §2b.20: leaving Move puts the body back at rest
    root.replaceChildren();
  };
}
