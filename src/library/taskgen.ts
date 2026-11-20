// Task generator (R5 R8, plan 2b.9, 2c.6): builder settings → keyframes, props, loads, supports, warnings. Template
// keyframes from taskbuilder.json, one scalar per style bisected until the target height is met, two-bone IK of the
// arms to the grip, then a balance fix (lean about the planted left foot). Pure: no three.js, no DOM.
import type { EngineData } from '../engine/effort';
import { add, bodyGeometry, sub } from '../engine/geometry';
import { setupVariant, supportPin, type LoadsJson, type SupportsJson } from '../engine/setup';
import { solveSupports } from '../engine/statics';
import type { BodyPoint, Load, Sex, Support, Vec3 } from '../engine/types';
import { fromPrototype, PROTO_ROOT_Y, type Pin, type Pose, type ProtoPose } from '../rig/pose';

export interface TaskSettings { object: string; kg: number; start: string; action: string; style: string }
export interface TaskObject { id: string; name: string; kg: number; grip: 'both' | 'one' | 'edge'; size: Vec3; model: string | null; grips: Vec3[]; simplified?: boolean }
export interface TaskStart { id: string; name: string; height: number; forward: number; side: number }
export interface TaskStyle {
  id: string; name: string; keyframes: ProtoPose[];
  /** prototype keys scaled together by the one bisected scalar ('' = none) */
  free: string;
  hands: 'both' | 'right';
  /** supports.json prop that carries the body at keyframes with pin none */
  support?: string;
  /** body point the free hand rests on in the target keyframes */
  rest?: BodyPoint;
  source: string;
}
export interface TaskTarget { point: 'grip' | 'pelvis' | 'foot_l'; height?: number; forward?: number; keyframes: number[] }
export interface TaskAction {
  id: string; name: string; objects: string[]; starts?: string[]; target: TaskTarget; styles: TaskStyle[];
  from?: { action: string; mode: 'reverse' | 'hold' };
}
export interface TaskBuilderJson {
  sources: string[]; note?: string; objects: TaskObject[]; starts: TaskStart[]; actions: TaskAction[];
  presets: { id: string; name: string; settings: TaskSettings }[];
}
export interface Generated {
  /** setupVariant key for the loads (tasks/<action>) */
  id: string;
  keyframes: Pose[];
  props: string[];
  loads: Load[];
  /** supports per keyframe (a seated keyframe sits on the chair, a standing one on the feet) */
  supports: Support[][];
  warnings: string[];
}

type Hand = 'hand_l' | 'hand_r';
const MAX_LEAN = 15, MAX_SHIFT = 0.15; // degrees, metres (plan 2b.9 step 4)
export const CANNOT_BALANCE = 'cannot balance this pose';

/** Styles of an action (a `from` action uses its base's). */
export const stylesOf = (tb: TaskBuilderJson, a: TaskAction): TaskStyle[] =>
  a.from ? tb.actions.find((b) => b.id === a.from!.action)?.styles ?? [] : a.styles;

const names = (ids: string[], list: { id: string; name: string }[]) => ids.map((i) => list.find((x) => x.id === i)?.name ?? i).join(', ');

export function generateTask(
  st: TaskSettings, data: EngineData, sex: Sex, tables: { loads: LoadsJson; supports: SupportsJson }, tb: TaskBuilderJson,
): Generated | { disabled: string } {
  const action = tb.actions.find((a) => a.id === st.action);
  if (!action) return { disabled: `No action "${st.action}".` };
  const base = action.from ? tb.actions.find((a) => a.id === action.from!.action) : action;
  if (!base) throw new Error(`taskbuilder.json: ${action.id} comes from unknown action "${action.from!.action}"`);
  const style = base.styles.find((x) => x.id === st.style);
  if (!style) return { disabled: `${action.name} has no style "${st.style}".` };
  const obj = tb.objects.find((o) => o.id === st.object);
  if (!obj || !action.objects.includes(obj.id))
    return { disabled: `${action.name}: no template for ${obj?.name ?? st.object}. Works with: ${names(action.objects, tb.objects)}.` };
  const start = action.starts ? tb.starts.find((x) => x.id === st.start) : undefined;
  if (action.starts && (!start || !action.starts.includes(start.id)))
    return { disabled: `${action.name}: no template from ${start?.name ?? st.start}. Starts: ${names(action.starts, tb.starts)}.` };

  const g = build(st, base, style, obj, start, data, sex, tables);
  if ('disabled' in g) return g;
  if (action.from?.mode === 'reverse') { g.keyframes.reverse(); g.supports.reverse(); }
  if (action.from?.mode === 'hold') {
    const k = base.target.keyframes[0];
    g.keyframes = [g.keyframes[k]];
    g.supports = [g.supports[k]];
  }
  return g;
}

function build(
  st: TaskSettings, action: TaskAction, style: TaskStyle, obj: TaskObject, start: TaskStart | undefined,
  data: EngineData, sex: Sex, tables: { loads: LoadsJson; supports: SupportsJson },
): Generated | { disabled: string } {
  const skel = data.skel[sex];
  const s = skel.H[skel.names.indexOf('pelvis')][1] / PROTO_ROOT_Y;
  const geo = (p: Pose) => bodyGeometry(skel, p, data.segments, 70, sex); // positions only: mass does not move them
  const id = `tasks/${st.action}`;
  const props = obj.id === 'none' ? [] : [style.hands === 'right' ? `${obj.id}R` : obj.id];
  const kg = Object.fromEntries(props.map((p) => [p, st.kg]));
  const { loads } = setupVariant(id, props, undefined, tables, kg);
  const target = action.target;
  const used: Hand[] = style.hands === 'right' ? ['hand_r'] : ['hand_l', 'hand_r'];

  // hand targets fixed in the world when the object stands at the start
  let fixed: Partial<Record<Hand, Vec3>> | undefined;
  if (target.point === 'grip' && target.height === undefined && start) {
    const at: Vec3 = [start.side, start.height, start.forward];
    const gs = obj.grips.map((p) => add(at, p).map((v) => v * s) as Vec3);
    const w = 0.05 * s; // two hands on one grip sit either side of it
    fixed = style.hands === 'right' ? { hand_r: gs[gs.length - 1] }
      : gs.length > 1 ? { hand_l: gs[0], hand_r: gs[1] } : { hand_l: add(gs[0], [w, 0, 0]), hand_r: sub(gs[0], [w, 0, 0]) };
    const top = Math.max(...Object.values(fixed).map((p) => p[1]));
    const up = geo(fromPrototype({ shoulder: { flex: 180 } })).point('hand_l')[1]; // arms straight up
    if (top > up) return { disabled: `Out of reach: the grip is ${top.toFixed(2)} m up and the hands reach ${up.toFixed(2)} m. Use a step.` };
  }

  // a pose from the template: free keys scaled by t; grounded, the ground shift baked into root.y; pin = the support pin
  const scaled = (p: ProtoPose, t: number): ProtoPose => {
    const q: ProtoPose = { ...p };
    for (const k of style.free.split(',').filter(Boolean)) {
      const v = p[k];
      q[k] = typeof v === 'number' ? v * t : v && typeof v === 'object'
        ? Object.fromEntries(Object.entries(v as Record<string, number>).map(([a, x]) => [a, x * t])) : v;
    }
    return q;
  };
  const toPose = (p: ProtoPose): Pose => {
    const pose = fromPrototype(p);
    pose.pin = (supportPin(p) ?? 'flat') as Pin;
    if (pose.pin === 'none') pose.pin = 'flat'; // stand it on the floor first, then let the support carry it
    if (pose.pinAt) pose.pinAt = pose.pinAt.map((v) => v * s) as Vec3;
    pose.root.y += skel.ground(pose, skel.fk(pose))[1];
    if (supportPin(p) === 'none') pose.pin = 'none';
    return pose;
  };
  const shiftOf = (p: Pose) => skel.ground(p, skel.fk(p));
  const moveRoot = (p: Pose, d: Vec3): Pose => ({ ...p, root: { ...p.root, x: p.root.x + d[0], z: p.root.z + d[2] } });
  /** root pitch and both ankles by d degrees: the body tips about the ankles, the feet keep their angle */
  const lean = (p: Pose, d: number): Pose => {
    if (!d) return p;
    const j = p.joints;
    return { ...p, root: { ...p.root, pitch: p.root.pitch - d },
      joints: { ...j, ankle_l: { ...j.ankle_l, flex: (j.ankle_l?.flex ?? 0) - d }, ankle_r: { ...j.ankle_r, flex: (j.ankle_r?.flex ?? 0) - d } } };
  };

  /** each used hand (grip point, 6 cm past the wrist) to its target: wrist IK, corrected by the hand's miss */
  const reachTo = (p: Pose, aims: Partial<Record<Hand, Vec3>>): Pose => {
    for (const [h, tgt] of Object.entries(aims) as [Hand, Vec3][]) {
      let aim = tgt;
      for (let i = 0; i < 3; i++) {
        p = skel.solveLimb(p, h === 'hand_l' ? 'arm_l' : 'arm_r', sub(aim, shiftOf(p)));
        aim = add(aim, sub(tgt, geo(p).point(h)));
      }
    }
    return p;
  };

  const n = style.keyframes.length;
  const supports = style.keyframes.map((proto) => {
    const pin = supportPin(proto);
    return setupVariant(id, [...props, ...(pin === 'none' && style.support ? [style.support] : [])], pin, tables, kg).supports;
  });
  // feet planted in every keyframe stay where they stand in the first target keyframe's template at t = 0
  const feetOf = (sup: Support[]) => sup.map((x) => x.point).filter((q) => /^(foot|heel)_[lr]$/.test(q));
  const planted = feetOf(supports[0]).filter((q) => supports.every((sup) => feetOf(sup).includes(q)));
  const footMid = (p: Pose): Vec3 => {
    const gm = geo(p);
    return planted.reduce<Vec3>((a, q) => add(a, gm.point(q).map((v) => v / planted.length) as Vec3), [0, 0, 0]);
  };
  const anchor = planted.length ? footMid(toPose(scaled(style.keyframes[target.keyframes[0]], 0))) : undefined;
  const placeAt = (k: number, t: number, d: number): Pose => {
    const p = lean(toPose(scaled(style.keyframes[k], t)), d);
    return anchor ? moveRoot(p, sub(anchor, footMid(p))) : p;
  };

  const keyframes: Pose[] = new Array(n);
  const warnings = new Set<string>();
  for (let k = 0; k < n; k++) {
    const isTarget = target.keyframes.includes(k);
    let aims: Partial<Record<Hand, Vec3>> = {};
    if (isTarget && target.point === 'grip') {
      if (fixed) aims = fixed;
      else { // a fixed height (carry, push, pull): beside, or ahead of, the hanging hand
        const gm = geo(placeAt(k, 1, 0));
        for (const h of used) { const c = gm.point(h); aims[h] = [c[0], (target.height ?? 0) * s, target.forward !== undefined ? target.forward * s : c[2]]; }
      }
    }
    const H = (target.height ?? 0) * s;
    const arms = (p: Pose): Pose => {
      p = reachTo(p, aims);
      if (isTarget && style.rest && style.hands === 'right') p = reachTo(p, { hand_l: geo(p).point(style.rest) });
      return p;
    };
    const miss = (p: Pose): number => {
      if (!isTarget) return 0;
      const gm = geo(p);
      if (target.point !== 'grip') return Math.abs(gm.point(target.point)[1] - H);
      return Math.max(0, ...(Object.entries(aims) as [Hand, Vec3][]).map(([h, a]) => { const q = gm.point(h); return Math.hypot(q[0] - a[0], q[1] - a[1], q[2] - a[2]); }));
    };
    // (3) one scalar per style: the least depth t whose arms reach the grip (grip targets), or the depth that puts
    // the target point at its height (pelvis); then the arms' two-bone IK
    let depth = 1; // the depth the last solve settled on
    const solve = (d: number): Pose => {
      const at = (t: number) => arms(placeAt(k, (depth = t), d));
      if (!isTarget || !style.free) return at(1);
      let lo = 0, hi = 1;
      if (target.point === 'grip') { // coarse scan for the first depth that reaches, then bisect; none reaches: the closest
        let best = 0, bestMiss = Infinity;
        for (let i = 0; i <= 10; i++) {
          const m = miss(at(i / 10));
          if (m <= 0.01) {
            if (i === 0) return at(0);
            lo = (i - 1) / 10; hi = i / 10;
            for (let j = 0; j < 8; j++) { const c = (lo + hi) / 2; if (miss(at(c)) <= 0.01) hi = c; else lo = c; }
            return at(hi);
          }
          if (m < bestMiss) { best = i / 10; bestMiss = m; }
        }
        return at(best);
      }
      const y = (t: number) => geo(placeAt(k, t, d)).point(target.point as BodyPoint)[1];
      if (y(0) <= H) return at(0);
      if (y(1) >= H) return at(1);
      for (let i = 0; i < 20; i++) { const m = (lo + hi) / 2; if (y(m) > H) lo = m; else hi = m; }
      return at((lo + hi) / 2);
    };
    let pose = solve(0);

    // (4) balance fix: tip the body about the planted feet (root shift and ankles together), at most 15° and 15 cm.
    // A lean that lifts or sinks a supporting foot by more than 2 cm does not count. The same lean may also bring
    // a grip into reach; a lean that loses the target does not count.
    const sup = supports[k], feet = feetOf(sup);
    const feetY = (p: Pose) => { const gm = geo(p); return feet.map((q) => gm.point(q)[1]); };
    const margin = (p: Pose) => solveSupports(geo(p), loads, sup).balance.margin;
    const reached = (p: Pose) => miss(p) <= 0.02;
    if ((margin(pose) < 0 || !reached(pose)) && supportPin(style.keyframes[k]) !== 'none' && anchor) {
      const y0 = feetY(pose), r0 = pose.root, wasReached = reached(pose), t0 = depth;
      let reachOnly: Pose | undefined, found: Pose | undefined;
      const open: Record<number, boolean> = { 1: true, [-1]: true }; // a direction closes past 15 cm of root shift
      for (let d = 1; d <= MAX_LEAN && !found; d++)
        for (const dir of [1, -1]) {
          if (!open[dir]) continue;
          let q = arms(placeAt(k, t0, dir * d)); // same depth first; a fresh search only if the lean loses the grip
          if (!reached(q)) q = solve(dir * d);
          if (Math.hypot(q.root.x - r0.x, q.root.z - r0.z) > MAX_SHIFT) { open[dir] = false; continue; }
          if (!reached(q) || !feetY(q).every((y, i) => Math.abs(y - y0[i]) <= 0.02)) continue;
          if (margin(q) >= 0) { found = q; break; }
          reachOnly ??= q;
        }
      pose = found ?? (wasReached ? pose : reachOnly ?? pose);
    }
    if (fixed && isTarget && miss(pose) > 0.03) {
      const top = Math.max(...Object.values(fixed).map((p) => p[1]));
      return { disabled: `Out of reach: the hands miss the grip (${top.toFixed(2)} m up, ${(start!.forward * s).toFixed(2)} m ahead) by ${(miss(pose) * 100).toFixed(0)} cm. Use a step or stand closer.` };
    }
    if (margin(pose) < 0) warnings.add(CANNOT_BALANCE);
    keyframes[k] = pose;
  }
  return { id, keyframes, props, loads, supports, warnings: [...warnings] };
}
