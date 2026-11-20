// Workouts player (R5 R5, route #workouts/exercises/<record id>; old <exercise>/<variant> links map through legacyId) and the
// keyframe editor entry (#workouts/edit/<kind>/<id>). Plays the record's keyframes on the view sex with its equipment
// (buildProps), ping-pong over the whole sequence. Muscle effort comes from the engine (R4): colours from the peak levels
// and roles over the movement, the muscle panel live at the current frame (≤ 10 Hz). Loads and supports from the prop and
// pin tables (setupVariant, supports per keyframe), kg per load editable. Variation = the family's records plus "My version"
// (saved by the editor, on the device only). Compare (compare-ui.ts), Edit, the form-check summary, cues and mistakes.
// prefers-reduced-motion: no autoplay, the slider steps. Phone: controls in a bottom sheet, collapsed by default
// (title, variation, transport, legend, one summary line); the viewer frames the body above it.
import * as THREE from 'three';
import type { BodyViewer } from '../../body/scene';
import { effort, type EngineData } from '../../engine/effort';
import { loadEngine } from '../../engine/load';
import { setupVariant, supportPin, type LoadsJson, type SupportsJson } from '../../engine/setup';
import type { EffortResult, Load, Support } from '../../engine/types';
import { editChecks, loadVersion, versionKey } from '../../library/edits';
import type { EquipmentJson } from '../../library/equipment';
import { legacyId, protoToPose, type Exercise } from '../../library/exercises';
import type { CheckId, FormTables } from '../../library/form';
import { generateTask, type TaskBuilderJson } from '../../library/taskgen';
import { PROTO_ROOT_Y, type Limits, type Pose } from '../../rig/pose';
import { inputAt, mountCompare, poseAt, versionEffort, type Version } from './compare-ui';
import { mountEffortPanel, topLine, type PanelCtx } from './effort-panel';
import { fetchJson, fitAbove, loadRecords, REST, ROLE_COL } from './library';
import { mountMove, type MoveSource } from './move';
import { buildProps } from './objects';
import { readTaskSettings, taskSource } from './taskbuilder';

export { ROLE_COL } from './library'; // effort-panel.ts imports it from here

const PERIOD_S = 1.5; // one keyframe to the next
const LIVE_MS = 100; // panel updates at most 10 times a second
const REGEN_MS = 150; // load slider: recompute after the drag pauses
const MAX_KG = 200;
const MINE = '__mine';
const OPEN_ZOOM = 0.85; // lens zoom while the phone sheet is open (see the handle)
type Role = keyof typeof ROLE_COL;
const ROLES: [Role, string, string][] = [
  ['prime', 'Prime mover', 'does the work'], ['syn', 'Synergist', 'helps'], ['stab', 'Stabiliser', 'holds you still']];
const ROLE_OF = { work: 'prime', help: 'syn', hold: 'stab' } as const;
const LOAD_NAME: Record<string, string> = { bar: 'Bar', dbL: 'Left dumbbell', dbR: 'Right dumbbell', bucket: 'Bucket',
  bucketR: 'Bucket (right hand)', bagL: 'Left bag', bagR: 'Right bag', box: 'Box', mop: 'Mop', handle: 'Cable', legpress: 'Sled' };
const CHECK: Record<CheckId, string> = { limits: 'Joint ranges', balance: 'Balance', contacts: 'Contacts', clearance: 'Clearance',
  kneeOverFoot: 'Knee over foot', neutralSpine: 'Neutral spine' };

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
const storage = (): Storage | null => { try { return localStorage; } catch { return null; } };

/** the record as playable data on a body of scale s: Pose keyframes, supports per keyframe, resolved loads */
function resolveRec(rec: Exercise, s: number, tables: { loads: LoadsJson; supports: SupportsJson }, kg: Record<string, number>): { keyframes: Pose[]; supports: Support[][]; loads: Load[] } {
  const setup = (i: number) => setupVariant(rec.id, rec.props, supportPin(rec.keyframes[i]), tables, kg);
  return { keyframes: rec.keyframes.map((k) => protoToPose(k, s)), supports: rec.keyframes.map((_, i) => setup(i).supports), loads: setup(0).loads };
}
const scaleOf = (data: EngineData, sex: 'male' | 'female') => { const k = data.skel[sex]; return k.H[k.names.indexOf('pelvis')][1] / PROTO_ROOT_Y; };

export function mountPlayer(root: HTMLElement, viewer: BodyViewer | null, itemId: string, variantId?: string): () => void {
  let disposed = false;
  const cleanup: (() => void)[] = [];
  const sheet = h('section', 'sheet player');
  sheet.setAttribute('aria-label', 'Exercises');
  const back = h('a', 'back', '← Exercises') as HTMLAnchorElement;
  back.href = '#workouts/exercises';
  const body = h('div', '', 'Loading…');
  sheet.append(back, body);
  root.replaceChildren(sheet);
  const [fit, unfit] = fitAbove(viewer, sheet);
  cleanup.push(unfit, () => { if (viewer) { viewer.camera.zoom = 1; viewer.camera.updateProjectionMatrix(); } });

  void (async () => {
    const [list, engine, eq, joints] = await Promise.all([loadRecords(), viewer ? loadEngine(viewer.manifest) : null,
      fetchJson('equipment') as Promise<EquipmentJson>, fetchJson('joints') as Promise<{ joints: Limits }>]);
    if (disposed) return;
    const rec = list.find((x) => x.id === itemId) ?? list.find((x) => x.id === legacyId(itemId, variantId));
    if (!rec) return body.replaceChildren(h('p', 'notice', `No exercise "${itemId}".`));
    const store = storage(), vkey = versionKey('exercises', rec.id);
    const saved = loadVersion(store, vkey);
    let mine = false;

    // ---- sheet: title, variation, transport, legend and the summary line (always shown); the rest under the handle on phone ----
    const handle = btn('', () => {
      const open = sheet.classList.toggle('open');
      handle.setAttribute('aria-expanded', String(open));
      handle.setAttribute('aria-label', open ? 'Show less' : 'Show more');
      fit();
      viewer?.frameIds(viewer.parts.filter((p) => p.kind === 'skin').map((p) => p.id)); // whole body above the sheet
      // the viewer caps the camera distance at 6 m, which cannot fit the body above a 45vh sheet: zoom out the lens instead
      // (about the visible-area centre); main.ts-wide cap fix belongs in scene.ts if another screen needs it
      if (viewer && sheet.getBoundingClientRect().left <= 1) {
        viewer.camera.zoom = open ? OPEN_ZOOM : 1;
        viewer.camera.updateProjectionMatrix();
        fit(); // setViewInset asks for a redraw
      }
    }, 'sheet-handle');
    handle.setAttribute('aria-expanded', 'false');
    handle.setAttribute('aria-label', 'Show more');

    const head: HTMLElement[] = [h('h1', '', rec.name)];
    const family = list.filter((x) => x.family === rec.family);
    if (family.length > 1 || saved) {
      const sel = h('select') as HTMLSelectElement;
      sel.id = 'player-variant';
      sel.append(...family.map((x) => Object.assign(document.createElement('option'), { value: x.id, textContent: x.name, selected: x === rec })),
        ...(saved ? [Object.assign(document.createElement('option'), { value: MINE, textContent: `My version of ${rec.name}` })] : []));
      sel.addEventListener('change', () => {
        if (sel.value === MINE || sel.value === rec.id) { mine = sel.value === MINE; regen(); } else location.hash = `#workouts/exercises/${sel.value}`;
      });
      const label = h('label', 'sr-only', 'Variation') as HTMLLabelElement;
      label.htmlFor = sel.id;
      const row = h('div', 'player-variant');
      row.append(label, sel);
      head.push(row);
    }

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
    const top = h('p', 'notice effort-top', ' ');
    const more = h('div', 'more');
    if (rec.note) more.append(h('p', '', rec.note));
    const loadsBox = h('div'), fx = h('div'), formBox = h('div');
    const editA = h('a', 'back', 'Edit keyframes') as HTMLAnchorElement;
    editA.href = `#workouts/edit/exercises/${rec.id}`;
    const cues = h('ul', 'cues');
    for (const c of rec.cues) cues.append(h('li', '', c));
    for (const c of rec.mistakes) cues.append(h('li', '', `Avoid: ${c.charAt(0).toLowerCase()}${c.slice(1)}`));

    body.replaceChildren(handle, ...head, transport, legend, top, more);
    syncPlay();
    fit();
    if (!viewer || !engine) {
      top.hidden = true;
      return void more.append(h('p', 'notice', 'The body could not be loaded, so the animation and muscle effort are off.'), h('h2', '', 'Form'), cues);
    }

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
      viewer.setState({}); // writes the new part colours
    };
    viewer.setState({ colour: 'natural', depth: 1, isolate: null, seeThrough: false });

    // ---- body, equipment, effort ----
    const sex = viewer.state.sex, { data } = engine, skel = data.skel[sex], s = scaleOf(data, sex);
    const tables: FormTables = { ...engine.tables, limits: joints.joints };
    const parts = new Map(data.parts.map((p) => [p.id, { plain: p.plain, side: p.side }]));
    const ctx: PanelCtx = { parts, sources: engine.sources };
    // ponytail: equipment follows this record; a pin from another Variation is drawn with this one's equipment
    const props3d = buildProps(viewer, rec.equipment, rec.placement ?? {}, skel, eq);
    cleanup.push(() => props3d.dispose());
    const compare = mountCompare(more, viewer, { data, sex, parts, onFlip: () => playVersion() });
    cleanup.push(() => compare.dispose());
    more.append(loadsBox, fx);
    fx.append(h('h2', '', 'Muscles'));
    const panel = mountEffortPanel(fx, { sources: engine.sources });
    cleanup.push(() => panel.dispose());
    more.append(h('h2', '', 'Form'), formBox, cues, editA,
      h('p', 'muted', 'Education only, not medical advice. Muscle levels are estimates from a static model.'));

    let kg: Record<string, number> = { ...rec.loads };
    let ver: Version, shown: Version | null = null;
    let cur: ReturnType<typeof inputAt> | null = null, dirty = true, formLine = '';
    const show = (u: number) => {
      compare.frame(u);
      if (!shown) return;
      cur = inputAt(shown, u);
      dirty = true;
      void viewer.setPose(cur.pose);
      props3d.update(skel.posed(cur.pose));
    };
    const summary = (live: EffortResult | null) => { top.textContent = [formLine, live && topLine(live, ctx)].filter(Boolean).join(' · ') || ' '; };
    const playVersion = () => {
      shown = compare.shown();
      if (shown) colour(versionEffort(shown, sex, data));
      show(t);
    };
    const renderLoads = () => {
      loadsBox.replaceChildren(...(ver.loads.length ? [h('h2', '', 'Load')] : []), ...ver.loads.map((l) => {
        const id = `player-kg-${l.id}`;
        const label = h('label', '', `${LOAD_NAME[l.id.split('#')[0]] ?? l.id} (kg)`) as HTMLLabelElement;
        label.htmlFor = id;
        const num = h('input') as HTMLInputElement, rng = h('input') as HTMLInputElement;
        Object.assign(rng, { type: 'range', min: '0', max: String(MAX_KG), step: '0.5', value: String(l.kg) });
        rng.setAttribute('aria-label', `${label.textContent}, slider`);
        Object.assign(num, { id, type: 'number', min: '0', max: String(MAX_KG), step: '0.5', inputMode: 'decimal', value: String(l.kg) });
        const set = (x: number, wait: boolean) => {
          if (!Number.isFinite(x) || x < 0 || x > MAX_KG) { num.value = rng.value = String(kg[l.id] ?? l.kg); return; }
          kg = { ...kg, [l.id]: x };
          num.value = rng.value = String(x);
          clearTimeout(timer);
          if (wait) timer = window.setTimeout(() => regen(true), REGEN_MS); else regen(true);
        };
        rng.addEventListener('input', () => set(+rng.value, true));
        num.addEventListener('change', () => set(num.valueAsNumber, false));
        const row = h('div', 'axis');
        row.append(label, rng, num);
        return row;
      }));
    };
    let timer = 0;
    cleanup.push(() => clearTimeout(timer));
    // rebuild the playable version (keyframes, supports, loads), the form summary and Compare's B; keepLoads = a slider moved
    const regen = (keepLoads = false) => {
      clearTimeout(timer);
      const sv = mine ? saved : null;
      if (!keepLoads) kg = { ...rec.loads, ...sv?.kg };
      const r = resolveRec(rec, s, tables, kg);
      ver = { kind: 'exercises', label: `${rec.name}${sv ? ' (my version)' : ''}${r.loads.length ? `, ${r.loads.map((l) => l.kg).join(' + ')} kg` : ''}`,
        keyframes: sv?.keyframes ?? r.keyframes, supports: sv?.supports ?? r.supports, loads: r.loads };
      if (!keepLoads) renderLoads();
      const rows = editChecks({ id: rec.id, props: rec.props, loads: ver.loads, equipment: rec.equipment, placement: rec.placement ?? {}, formChecks: rec.formChecks },
        ver.keyframes, ver.supports, sex, data, tables, eq);
      const bad = rows.filter((c) => !c.ok);
      formLine = bad.length ? `Form: ${bad.map((c) => CHECK[c.id]).join(', ')} off` : 'Form: all checks pass';
      formBox.replaceChildren(...rows.map((c) => h('p', c.ok ? 'muted' : 'notice', `${c.ok ? 'OK' : 'Check'} · ${CHECK[c.id]}: ${c.words}`)));
      compare.set(ver);
      playVersion();
      summary(null);
    };

    const live = () => {
      if (!dirty || !cur || !shown) return;
      dirty = false;
      const r = effort({ ...cur, sex, loads: shown.loads }, data);
      panel.update(r, ctx);
      summary(r);
    };
    const tick = setInterval(live, LIVE_MS);
    cleanup.push(() => clearInterval(tick));
    regen();
    await viewer.setPose(ver!.keyframes[0]); // loads rig and weights
    if (disposed) return;
    // frame the body mid-movement, from the record's camera azimuth (prototype default 26°)
    viewer.setView('front');
    const az = (rec.cam?.az ?? 26) * (Math.PI / 180);
    const c = viewer.camera.position, r = Math.hypot(c.x, c.z);
    c.set(Math.sin(az) * r, c.y, Math.cos(az) * r);
    void viewer.setPose(poseAt(ver!.keyframes, 0.5));
    viewer.frameIds(viewer.parts.filter((p) => p.kind === 'skin').map((p) => p.id));
    await new Promise(requestAnimationFrame); // frameIds measures in a microtask: keep the mid pose until then
    if (disposed) return;
    show(t);

    let last = 0, raf = 0;
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.05, (now - last) / 1000 || 0);
      last = now;
      if (!playing || !shown || shown.keyframes.length < 2) return;
      t += (dir * dt) / (PERIOD_S * (shown.keyframes.length - 1));
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

/** #workouts/edit/<kind>/<id>: the keyframe editor (move.ts) on the record's keyframes, or on the task builder's current settings (`custom`) */
export function mountEditor(root: HTMLElement, viewer: BodyViewer | null, kind: 'exercises' | 'tasks', id: string): () => void {
  let gone = false, inner: (() => void) | null = null;
  const say = (t: string) => root.replaceChildren(Object.assign(h('section', 'sheet'), { textContent: t }));
  say(viewer ? 'Loading…' : 'The body could not be loaded, so the editor is off.');
  if (!viewer) return () => root.replaceChildren();
  void (async () => {
    const engine = await loadEngine(viewer.manifest);
    const sex = viewer.state.sex, { data } = engine;
    let source: MoveSource | string;
    if (kind === 'exercises') {
      const list = await loadRecords();
      const rec = list.find((x) => x.id === id) ?? list.find((x) => x.id === legacyId(id));
      if (!rec) source = `No exercise "${id}".`;
      else {
        const r = resolveRec(rec, scaleOf(data, sex), engine.tables, rec.loads ?? {});
        source = { kind, id: rec.id, name: rec.name, ...r, props: rec.props, equipment: rec.equipment, placement: rec.placement ?? {}, kg: {}, formChecks: rec.formChecks };
      }
    } else {
      const tb = await fetchJson('taskbuilder') as TaskBuilderJson;
      const st = tb.presets.find((p) => p.id === id)?.settings ?? readTaskSettings() ?? tb.presets[0].settings;
      const g = generateTask(st, data, sex, engine.tables, tb);
      source = 'disabled' in g ? `Not available: ${g.disabled}` : taskSource(g, st, tb);
    }
    if (gone) return;
    if (typeof source === 'string') say(source); else inner = mountMove(root, viewer, source);
  })().catch((e: unknown) => { if (!gone) say(`Could not load the editor: ${e instanceof Error ? e.message : String(e)}`); });
  return () => { gone = true; inner?.(); root.replaceChildren(); };
}
