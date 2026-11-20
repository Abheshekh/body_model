// Task builder (R5 R8, SPEC §6, routes #workouts/tasks[/<preset>], wired by T12): Object, Weight, Start, Action and
// Style → generated keyframes (src/library/taskgen.ts) played on the view sex with the task objects. Combinations
// without a template are disabled with the reason. Muscle effort from the engine: colours from the peak over the
// task, the panel live at the current frame (≤ 10 Hz); lower-back moment with its band (plan 2b.10) and the overcount
// note; balance warning. Edit → the keyframe editor (#workouts/edit/tasks/custom reads the settings from
// sessionStorage); Compare → compare-ui.ts. Phone: the player's sheet (collapsed = title, preset, transport, legend,
// one summary line).
import * as THREE from 'three';
import type { BodyViewer } from '../../body/scene';
import { effort } from '../../engine/effort';
import { loadEngine } from '../../engine/load';
import type { EffortResult } from '../../engine/types';
import type { EquipmentJson } from '../../library/equipment';
import { CANNOT_BALANCE, generateTask, stylesOf, type Generated, type TaskBuilderJson, type TaskSettings } from '../../library/taskgen';
import { inputAt, mountCompare, poseAt, versionEffort, type Version } from './compare-ui';
import { mountEffortPanel, panelNotices, topLine, type PanelCtx } from './effort-panel';
import { fitAbove, REST, ROLE_COL } from './library';
import type { MoveSource } from './move';
import { buildProps } from './objects';
import './taskbuilder.css';

/** the builder's current settings, for #workouts/edit/tasks/custom (plan 2b.12) */
export const TASK_SETTINGS_KEY = 'bodyModel.taskSettings.v1';
export function readTaskSettings(): TaskSettings | null {
  try {
    const s = JSON.parse(sessionStorage.getItem(TASK_SETTINGS_KEY) ?? 'null') as TaskSettings | null;
    return s && typeof s.action === 'string' && typeof s.object === 'string' && typeof s.style === 'string'
      && typeof s.start === 'string' && Number.isFinite(s.kg) ? s : null;
  } catch {
    return null;
  }
}
const writeTaskSettings = (st: TaskSettings) => {
  try { sessionStorage.setItem(TASK_SETTINGS_KEY, JSON.stringify(st)); } catch { /* storage off: the editor opens the first preset */ }
};

/** what is drawn: the object, the style's support (chair), the step for climb step */
export function drawIds(st: TaskSettings, tb: TaskBuilderJson): string[] {
  const a = tb.actions.find((x) => x.id === st.action);
  const style = a && stylesOf(tb, a).find((x) => x.id === st.style);
  const model = tb.objects.find((o) => o.id === st.object)?.model;
  return [...(model ? [model] : []), ...(style?.support ? [style.support] : []), ...(st.action === 'climb-step' ? ['step1'] : [])];
}
/** "Pick up, Bend at the waist, Bucket 10 kg" (or the preset's name) */
export function taskLabel(st: TaskSettings, tb: TaskBuilderJson): string {
  const p = tb.presets.find((x) => same(x.settings, st));
  if (p) return p.name;
  const a = tb.actions.find((x) => x.id === st.action), o = tb.objects.find((x) => x.id === st.object);
  const style = a && stylesOf(tb, a).find((x) => x.id === st.style);
  return [a?.name ?? st.action, style?.name ?? st.style, st.object === 'none' ? '' : `${o?.name ?? st.object} ${st.kg} kg`].filter(Boolean).join(', ');
}
/** the keyframe editor's source for a generated task (MoveSource, T10) */
export const taskSource = (g: Generated, st: TaskSettings, tb: TaskBuilderJson): MoveSource => ({
  kind: 'tasks', id: 'custom', name: taskLabel(st, tb), keyframes: g.keyframes, supports: g.supports, props: g.props,
  loads: g.loads, equipment: drawIds(st, tb), placement: {}, kg: {},
});

const same = (a: TaskSettings, b: TaskSettings) =>
  a.object === b.object && a.kg === b.kg && a.start === b.start && a.action === b.action && a.style === b.style;
/** plan 2b.10: share of typical back-extensor strength → band */
const lumbarBand = (level: number) => (level < 0.3 ? 'low' : level < 0.6 ? 'medium' : 'high');
const OPEN_ZOOM = 0.85; // lens zoom while the phone sheet is open (see the handle)
const PERIOD_S = 1.5; // one segment, as the player
const LIVE_MS = 100; // panel updates at most 10 times a second
const REGEN_MS = 150; // weight slider: regenerate after the drag pauses
const MAX_KG = 50;
const ROLES: [keyof typeof ROLE_COL, string, string][] = [
  ['prime', 'Prime mover', 'does the work'], ['syn', 'Synergist', 'helps'], ['stab', 'Stabiliser', 'holds you still']];
const ROLE_OF = { work: 'prime', help: 'syn', hold: 'stab' } as const;

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
const field = (id: string, text: string, input: HTMLElement): HTMLElement => {
  const row = h('div', 'tb-field'), label = h('label', '', text) as HTMLLabelElement;
  label.htmlFor = input.id = id;
  row.append(label, input);
  return row;
};
const option = (value: string, text: string, on: boolean, why = ''): HTMLOptionElement => {
  const o = Object.assign(document.createElement('option'), { value, textContent: why ? `${text} (not available)` : text, selected: on, disabled: !!why });
  if (why) o.title = why;
  return o;
};

export function mountTaskBuilder(root: HTMLElement, viewer: BodyViewer | null, presetId?: string): () => void {
  let disposed = false;
  const cleanup: (() => void)[] = [];
  const sheet = h('section', 'sheet player taskbuilder');
  sheet.setAttribute('aria-label', 'Task builder');
  const back = h('a', 'back', '← Workouts') as HTMLAnchorElement;
  back.href = '#workouts';
  const body = h('div', '', 'Loading…');
  sheet.append(back, body);
  root.replaceChildren(sheet);
  const [fit, unfit] = fitAbove(viewer, sheet);
  cleanup.push(unfit, () => { if (viewer) { viewer.camera.zoom = 1; viewer.camera.updateProjectionMatrix(); } });

  void (async () => {
    if (!viewer) return void body.replaceChildren(h('p', 'notice', 'The body could not be loaded, so the task builder is off.'));
    const get = async (name: string) => {
      const res = await fetch(`${import.meta.env.BASE_URL}data/${name}.json`);
      if (!res.ok) throw new Error(`${name}.json ${res.status}`);
      return res.json();
    };
    const [engine, tb, eq] = await Promise.all([loadEngine(viewer.manifest), get('taskbuilder') as Promise<TaskBuilderJson>, get('equipment') as Promise<EquipmentJson>]);
    if (disposed) return;
    const { data, tables } = engine, sex = viewer.state.sex, skel = data.skel[sex];
    const parts = new Map(data.parts.map((p) => [p.id, { plain: p.plain, side: p.side }]));
    const ctx: PanelCtx = { parts, sources: engine.sources };
    let st: TaskSettings = { ...(tb.presets.find((p) => p.id === presetId)?.settings ?? readTaskSettings() ?? tb.presets[0].settings) };

    // ---- sheet: title, preset, transport, legend, summary line; the settings and the rest under the handle ----
    const handle = btn('', () => {
      const open = sheet.classList.toggle('open');
      handle.setAttribute('aria-expanded', String(open));
      handle.setAttribute('aria-label', open ? 'Show less' : 'Show more');
      fit();
      viewer.frameIds(viewer.parts.filter((p) => p.kind === 'skin').map((p) => p.id)); // whole body above the sheet
      // the viewer caps the camera distance at 6 m, which cannot fit the body above a 45vh sheet: zoom out the lens instead
      // (about the visible-area centre); main.ts-wide cap fix belongs in scene.ts if another screen needs it
      if (sheet.getBoundingClientRect().left <= 1) {
        viewer.camera.zoom = open ? OPEN_ZOOM : 1;
        viewer.camera.updateProjectionMatrix();
        fit(); // setViewInset asks for a redraw
      }
    }, 'sheet-handle');
    handle.setAttribute('aria-expanded', 'false');
    handle.setAttribute('aria-label', 'Show more');

    const preset = h('select') as HTMLSelectElement;
    preset.addEventListener('change', () => {
      const p = tb.presets.find((x) => x.id === preset.value);
      if (p) { st = { ...p.settings }; regen(); }
    });
    const presetLabel = h('label', 'sr-only', 'Preset') as HTMLLabelElement;
    preset.id = presetLabel.htmlFor = 'tb-preset';
    const presetRow = h('div', 'player-variant');
    presetRow.append(presetLabel, preset);

    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    let playing = !reduce, t = 0, dir = 1;
    const play = btn('', () => { playing = !playing; syncPlay(); });
    const range = h('input') as HTMLInputElement;
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
      const it = h('span', '', name), sw = h('i', 'sw');
      it.title = what;
      sw.style.background = ROLE_COL[r];
      it.prepend(sw);
      legend.append(it);
    }
    const top = h('p', 'notice effort-top', ' ');

    // settings
    const sel = (id: string, text: string) => {
      const s = h('select') as HTMLSelectElement;
      return [s, field(id, text, s)] as const;
    };
    const [objectSel, objectRow] = sel('tb-object', 'Object');
    const [startSel, startRow] = sel('tb-start', 'Start');
    const [actionSel, actionRow] = sel('tb-action', 'Action');
    const [styleSel, styleRow] = sel('tb-style', 'Style');
    const kgRange = h('input') as HTMLInputElement, kgNum = h('input') as HTMLInputElement;
    Object.assign(kgRange, { type: 'range', min: '0', max: String(MAX_KG), step: '0.5' });
    Object.assign(kgNum, { type: 'number', min: '0', max: String(MAX_KG), step: '0.5', inputMode: 'decimal' });
    const kgLabel = h('label', '', 'Weight (kg)') as HTMLLabelElement;
    kgLabel.htmlFor = kgRange.id = 'tb-kg';
    kgNum.setAttribute('aria-label', 'Weight, kg');
    const kgRow = h('div', 'axis');
    kgRow.append(kgLabel, kgRange, kgNum);
    const fields = h('div', 'tb-fields');
    fields.append(objectRow, kgRow, startRow, actionRow, styleRow);

    objectSel.addEventListener('change', () => {
      st = { ...st, object: objectSel.value, kg: tb.objects.find((o) => o.id === objectSel.value)?.kg ?? st.kg }; // the object's own weight
      regen();
    });
    startSel.addEventListener('change', () => { st = { ...st, start: startSel.value }; regen(); });
    styleSel.addEventListener('change', () => { st = { ...st, style: styleSel.value }; regen(); });
    actionSel.addEventListener('change', () => {
      const a = tb.actions.find((x) => x.id === actionSel.value)!, styles = stylesOf(tb, a);
      // keep what still fits the new action, else its first object, start and style
      st = { ...st, action: a.id,
        object: a.objects.includes(st.object) ? st.object : a.objects[0],
        start: !a.starts || a.starts.includes(st.start) ? st.start : a.starts[0],
        style: styles.some((x) => x.id === st.style) ? st.style : styles[0].id };
      if (st.object !== objectSel.value) st.kg = tb.objects.find((o) => o.id === st.object)?.kg ?? st.kg;
      regen();
    });
    let regenTimer = 0;
    const setKg = (x: number, wait: boolean) => {
      if (!Number.isFinite(x) || x < 0 || x > MAX_KG) return syncFields();
      st = { ...st, kg: x };
      kgRange.value = kgNum.value = String(x);
      clearTimeout(regenTimer);
      if (wait) regenTimer = window.setTimeout(regen, REGEN_MS);
      else regen();
    };
    kgRange.addEventListener('input', () => setKg(+kgRange.value, true));
    kgNum.addEventListener('change', () => setKg(kgNum.valueAsNumber, false));
    cleanup.push(() => clearTimeout(regenTimer));

    const syncFields = () => {
      const a = tb.actions.find((x) => x.id === st.action)!;
      const matched = tb.presets.find((p) => same(p.settings, st));
      preset.replaceChildren(...tb.presets.map((p) => option(p.id, p.name, p === matched)),
        ...(matched ? [] : [option('', `Custom: ${taskLabel(st, tb)}`, true)]));
      objectSel.replaceChildren(...tb.objects.map((o) => option(o.id, o.name, o.id === st.object,
        a.objects.includes(o.id) ? '' : `${a.name} works with: ${a.objects.map((i) => tb.objects.find((x) => x.id === i)?.name ?? i).join(', ')}`)));
      const starts = a.starts;
      startSel.replaceChildren(...(!starts ? [option('', `Not used for ${a.name.toLowerCase()}`, true)]
        : tb.starts.map((s) => option(s.id, s.name, s.id === st.start,
          starts.includes(s.id) ? '' : `${a.name} starts from: ${starts.map((i) => tb.starts.find((x) => x.id === i)?.name ?? i).join(', ')}`))));
      startSel.disabled = !a.starts;
      actionSel.replaceChildren(...tb.actions.map((x) => option(x.id, x.name, x.id === st.action)));
      styleSel.replaceChildren(...stylesOf(tb, a).map((x) => option(x.id, x.name, x.id === st.style)));
      const force = a.id === 'push' || a.id === 'pull';
      kgLabel.textContent = force ? 'Force (kg of force)' : 'Weight (kg)';
      kgNum.setAttribute('aria-label', force ? 'Force, kg of force' : 'Weight, kg');
      kgRange.value = kgNum.value = String(st.kg);
      kgRange.disabled = kgNum.disabled = st.object === 'none';
    };

    const reason = h('p', 'notice');
    const warnBox = h('div');
    const lumbar = h('div', 'tb-back');
    const editB = btn('Edit keyframes', () => { writeTaskSettings(st); location.hash = '#workouts/edit/tasks/custom'; });
    const fx = h('div');
    const more = h('div', 'more');
    const sources = h('p', 'effort-sources');
    more.append(fields, reason, warnBox, lumbar, editB);
    body.replaceChildren(handle, h('h1', '', 'Task builder'), presetRow, transport, legend, top, more);

    // ---- muscle colours (as player.ts): the role colour mixed in by level, put back on leave ----
    const snapshot = viewer.state;
    cleanup.push(() => viewer.setState(snapshot)); // runs after the colours are back (cleanup runs in reverse)
    const own = new Map<number, string>();
    for (const p of viewer.parts) if (p.kind === 'muscle') own.set(p.id, p.colour);
    cleanup.push(() => { for (const p of viewer.parts) if (own.has(p.id)) p.colour = own.get(p.id)!; });
    const col = new THREE.Color();
    const colour = (r: EffortResult | null) => {
      for (const p of viewer.parts) {
        if (!own.has(p.id)) continue;
        const m = r?.muscle[p.id];
        p.colour = !m || m.role === 'none' || !(m.level > 0) ? REST
          : '#' + col.set(REST).lerp(new THREE.Color(ROLE_COL[ROLE_OF[m.role]]), 0.4 + 0.6 * m.level).getHexString();
      }
      viewer.setState({}); // writes the new part colours
    };
    viewer.setState({ colour: 'natural', depth: 1, isolate: null, seeThrough: false });

    const compare = mountCompare(more, viewer, { data, sex, parts, onFlip: () => playVersion() });
    cleanup.push(() => compare.dispose());
    more.append(h('h2', '', 'Muscles'), fx);
    const panel = mountEffortPanel(fx, { sources: engine.sources });
    cleanup.push(() => panel.dispose());
    more.append(h('h2', '', 'Task sources'), sources,
      h('p', 'muted', 'Education only, not medical advice. Muscle levels and the lower-back moment are estimates from a static model.'));

    // ---- generate, play ----
    let props3d: ReturnType<typeof buildProps> | null = null, drawn = '';
    cleanup.push(() => props3d?.dispose());
    let shown: Version | null = null, peak: EffortResult | null = null, warn: string[] = [];
    let cur: ReturnType<typeof inputAt> | null = null, dirty = true;
    const show = (u: number) => {
      compare.frame(u);
      if (!shown) return;
      cur = inputAt(shown, u);
      dirty = true;
      void viewer.setPose(cur.pose);
      props3d?.update(skel.posed(cur.pose));
    };
    const summary = (live: EffortResult | null) => {
      if (!shown || !peak) return;
      const lb = peak.lowerBack, bal = warn.length || panelNotices(peak).length > peak.warnings.length;
      top.textContent = (bal ? 'Balance warning · ' : '') + `Lower back ${Math.round(lb.momentNm)} Nm (${lumbarBand(lb.level)})`
        + (live ? ` · ${topLine(live, ctx)}` : '');
    };
    // the version on the body (B, or the pinned A): colours, lower back, balance from its peak over the task
    const playVersion = () => {
      shown = compare.shown();
      peak = shown ? versionEffort(shown, sex, data) : null;
      colour(peak);
      const lb = peak?.lowerBack;
      lumbar.replaceChildren(...(lb ? [
        h('p', '', `Lower back: ${Math.round(lb.momentNm)} Nm at the hardest point, ${lumbarBand(lb.level)}`),
        h('p', 'muted', `Share of typical back-extensor strength (estimate): ${Math.round(lb.level * 100)}%. Low below 30%, medium below 60%, high above; not an injury threshold.`),
        h('p', 'muted', 'The lower-back moment is overcounted: trunk mass sits on one spine bone (known gap).'),
      ] : []));
      summary(null);
      if (!shown) { top.textContent = reason.textContent || ' '; void viewer.setPose(null); }
      show(t);
    };
    const regen = () => {
      clearTimeout(regenTimer);
      syncFields();
      const g = generateTask(st, data, sex, tables, tb);
      const ids = drawIds(st, tb).join(',');
      if (ids !== drawn) {
        props3d?.dispose();
        props3d = ids ? buildProps(viewer, drawIds(st, tb), {}, skel, eq) : null;
        drawn = ids;
      }
      const a = tb.actions.find((x) => x.id === st.action)!, style = stylesOf(tb, a).find((x) => x.id === st.style);
      sources.textContent = [style?.source, ...tb.sources].filter(Boolean).join('; ');
      if ('disabled' in g) {
        reason.hidden = false;
        reason.textContent = `Not available: ${g.disabled}`;
        warn = [];
        warnBox.replaceChildren();
        editB.disabled = true;
        compare.set(null);
      } else {
        reason.hidden = true;
        reason.textContent = '';
        warn = g.warnings;
        const bal = (w: string) => (w === CANNOT_BALANCE ? 'Balance warning: the centre of mass leaves the feet and the pose could not be balanced within 15° and 15 cm. In real life you would step or hold on.' : w);
        warnBox.replaceChildren(...warn.map((w) => h('p', 'notice', bal(w))));
        editB.disabled = false;
        compare.set({ kind: 'tasks', label: taskLabel(st, tb), keyframes: g.keyframes, loads: g.loads, supports: g.supports });
      }
      playVersion();
      fit();
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

    syncPlay();
    regen();
    // frame the body mid-movement, from the prototype's default camera azimuth (26°)
    viewer.setView('front');
    const az = 26 * (Math.PI / 180);
    const c = viewer.camera.position, rr = Math.hypot(c.x, c.z);
    c.set(Math.sin(az) * rr, c.y, Math.cos(az) * rr);
    const first = compare.shown();
    if (first) await viewer.setPose(poseAt(first.keyframes, 0.5)); // loads rig and weights
    if (disposed) return;
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
    if (!disposed) body.replaceChildren(h('p', 'notice', `Could not load the task builder: ${e instanceof Error ? e.message : String(e)}`));
  });

  return () => {
    disposed = true;
    cleanup.splice(0).reverse().forEach((f) => f());
    void viewer?.setPose(null); // leaving the builder puts the body back at rest
    root.replaceChildren();
  };
}
