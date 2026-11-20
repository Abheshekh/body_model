// Form checks (R5 R4, plan 2b.6): pure rules run on every keyframe and 3 in-betweens per segment, one sex at a time.
// Global checks (limits, balance, contacts, clearance) always run; the record's formChecks[] adds the pattern checks
// (kneeOverFoot, neutralSpine). Each check is its own function on one frame; formChecks keeps the worst frame per
// check and leaves out a check that applies to no frame. No three.js, no DOM.
import { effort, type EngineData } from '../engine/effort';
import { bodyGeometry, expandPoint } from '../engine/geometry';
import { setupVariant, supportPin, type LoadsJson, type SupportsJson } from '../engine/setup';
import type { BodyPoint, Geometry, Load, Sex, Support, Vec3 } from '../engine/types';
import { lerpPose, PROTO_ROOT_Y, type Limits, type Pose, type ProtoPose } from '../rig/pose';
import { mv, type M3 } from '../rig/skeleton';
import { findItem, placeEquipment, type EquipmentJson, type Item, type Placed, type PlacedCollider, type Placement } from './equipment';
import { protoToPose, type Exercise } from './exercises';

export type CheckId = 'limits' | 'balance' | 'contacts' | 'clearance' | 'kneeOverFoot' | 'neutralSpine';
/** value against limit; `frame` = keyframe position (1.5 = halfway from keyframe 1 to 2) */
export interface CheckResult { id: CheckId; ok: boolean; frame: number; value: number; limit: number; words: string }
/** loads/supports tables plus joints.json `joints` (the limits check) */
export interface FormTables { loads: LoadsJson; supports: SupportsJson; limits: Limits }
/** a record whose loads and supports are already resolved (a generated task, plan 2b.9, or an edited version): Pose keyframes */
export interface Resolved {
  id?: string; keyframes: Pose[]; props: string[]; loads: Load[]; supports: Support[];
  equipment?: string[]; placement?: Placement; formChecks?: Exercise['formChecks'];
}
export type Checkable = Pick<Exercise, 'id' | 'props' | 'keyframes' | 'formChecks' | 'equipment'> & Partial<Pick<Exercise, 'placement' | 'loads'>>;

/**
 * One frame. Plan T5 shape plus what the rules need: the frame's resolved `loads` and `supports` (setupVariant with
 * the keyframe's own support pin), and `held` = hand-held items' colliders where they hang in the hands this frame.
 * `placed` holds the fixed items only.
 */
export interface FrameCtx {
  sex: Sex; pose: Pose; frame: number;
  rec: { id: string; props: string[]; formChecks: Exercise['formChecks'] };
  data: EngineData; tables: FormTables; placed: Placed;
  loads: Load[]; supports: Support[]; held: PlacedCollider[];
}

const TOL_DEG = 0.5, BALANCE_M = -0.02, CONTACT_M = 0.03, INSIDE_M = 0.02, FLOOR_M = 0.01, KNEE_M = 0.03, LUMBAR_DEG = 20;
const IN_BETWEEN = [0.25, 0.5, 0.75];

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scl = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cm = (m: number) => `${Math.round(m * 100)} cm`;
/** "hand_l" → "left hand", "upperarm_r" → "right upperarm" */
const say = (n: string) => (/_[lr]$/.test(n) ? `${n.endsWith('_l') ? 'left' : 'right'} ${n.slice(0, -2)}` : n);
const geo = (c: FrameCtx): Geometry => bodyGeometry(c.data.skel[c.sex], c.pose, c.data.segments, 70, c.sex);

/** every joint axis inside joints.json, ± 0.5° (root pitch/roll/yaw against `pelvis`) */
export function checkLimits(c: FrameCtx): CheckResult | null {
  const L = c.tables.limits;
  const axes: [string, string, number][] = [
    ...(['pitch', 'roll', 'yaw'] as const).map((a): [string, string, number] => ['pelvis', a, c.pose.root[a]]),
    ...Object.entries(c.pose.joints).flatMap(([j, ax]) => Object.entries(ax).map(([a, v]): [string, string, number] => [j, a, v])),
  ];
  let worst: CheckResult | null = null;
  for (const [j, a, v] of axes) {
    const l = L[j]?.[a];
    if (!l) continue;
    const out = Math.max(v - l.max, l.min - v);
    if (!worst || out > worst.value)
      worst = { id: 'limits', ok: out <= TOL_DEG, frame: c.frame, value: out, limit: TOL_DEG,
        words: out <= TOL_DEG ? 'Every joint stays inside its range.' : `${say(j)} ${a} ${Math.round(v)}° is ${Math.round(out)}° past its range (${l.min} to ${l.max}°).` };
  }
  return worst;
}

/** props whose supports brace the body (plan 2d.E): with pin none on one of these there is no standing balance to check */
const BRACES = new Set(['seat', 'back', 'bench', 'pad', 'reclineBack', 'reclineSeat', 'chair']);

/** pin none on a seat, back, bench or pad: the equipment braces the body, so formChecks skips checkBalance there */
const braced = (c: FrameCtx) => c.pose.pin === 'none' && c.rec.props.some((p) => BRACES.has(p));

/** centre of mass over the supports: effort().balance.margin ≥ −2 cm */
export function checkBalance(c: FrameCtx): CheckResult {
  const m = effort({ pose: c.pose, sex: c.sex, loads: c.loads, supports: c.supports }, c.data).balance.margin;
  const ok = m >= BALANCE_M;
  return { id: 'balance', ok, frame: c.frame, value: m, limit: BALANCE_M,
    words: ok ? 'The centre of mass stays over the supports.' : Number.isFinite(m) ? `The centre of mass is ${cm(-m)} outside the supports.` : 'Nothing supports the body here.' };
}

/** distance from p to a placed surface patch (plane + extent) */
function toSurface(p: Vec3, f: Placed['surfaces'][number]): number {
  const d = sub(p, f.point);
  const ou = Math.max(0, Math.abs(dot(d, f.u)) - f.extent[0]), ov = Math.max(0, Math.abs(dot(d, f.v)) - f.extent[1]);
  return Math.hypot(dot(d, f.normal), ou, ov);
}

/** each support point within 3 cm of a surface of the record's fixed equipment that carries it (a foot or heel point
 * may rest on the floor, y = 0, instead: plan 2d.B); null when none does */
export function checkContacts(c: FrameCtx): CheckResult | null {
  const g = geo(c);
  let worst: CheckResult | null = null;
  for (const p of new Set(c.supports.flatMap((s) => expandPoint(s.point)))) {
    const fs = c.placed.surfaces.filter((f) => f.points.some((q) => expandPoint(q as BodyPoint).includes(p)));
    if (!fs.length) continue;
    const at = g.point(p);
    const best = fs.map((f) => ({ f, d: toSurface(at, f) })).reduce((a, b) => (b.d < a.d ? b : a));
    if (/^(foot|heel)_[lr]$/.test(p) && Math.abs(at[1]) < best.d) best.d = Math.abs(at[1]);
    if (!worst || best.d > worst.value)
      worst = { id: 'contacts', ok: best.d <= CONTACT_M, frame: c.frame, value: best.d, limit: CONTACT_M,
        words: best.d <= CONTACT_M ? 'Every support point touches its equipment.' : `The ${say(p)} is ${cm(best.d)} off the ${best.f.item} ${best.f.name}.` };
  }
  return worst;
}

/** how deep p lies inside a collider (≤ 0 = outside) */
function depth(p: Vec3, c: PlacedCollider): number {
  if ('box' in c) {
    const d = sub(p, c.box.center);
    return Math.min(...c.box.axes.map((a, k) => c.box.half[k] - Math.abs(dot(d, a))));
  }
  const ab = sub(c.capsule.b, c.capsule.a), l2 = dot(ab, ab);
  const t = l2 ? Math.max(0, Math.min(1, dot(sub(p, c.capsule.a), ab) / l2)) : 0;
  return c.capsule.r - Math.hypot(...sub(p, add(c.capsule.a, scl(ab, t))));
}
/** lowest point of a collider */
const lowest = (c: PlacedCollider) => ('box' in c ? c.box.center[1] - c.box.axes.reduce((m, a, k) => m + Math.abs(a[1]) * c.box.half[k], 0)
  : Math.min(c.capsule.a[1], c.capsule.b[1]) - c.capsule.r);

/** body (bone heads, middles, tails) not inside a fixed collider by > 2 cm nor below the floor by > 1 cm; hand-held items not below the floor by > 1 cm */
export function checkClearance(c: FrameCtx): CheckResult {
  const g = geo(c);
  const pts = Object.entries(g.bones).flatMap(([b, x]) => [x.head, scl(add(x.head, x.tail), 0.5), x.tail].map((p): [string, Vec3] => [b, p]));
  let worst = { over: -Infinity, value: 0, limit: INSIDE_M, words: '' };
  const see = (value: number, limit: number, words: () => string) => {
    if (value - limit > worst.over) worst = { over: value - limit, value, limit, words: words() };
  };
  for (const [b, p] of pts) {
    see(-p[1], FLOOR_M, () => `The ${say(b)} is ${cm(-p[1])} below the floor.`);
    for (const k of c.placed.colliders) see(depth(p, k), INSIDE_M, () => `The ${say(b)} is ${cm(depth(p, k))} inside the ${k.item} ${k.name}.`);
  }
  for (const k of c.held) see(-lowest(k), FLOOR_M, () => `The ${k.item} ${k.name} is ${cm(-lowest(k))} below the floor.`);
  const ok = worst.over <= 0;
  return { id: 'clearance', ok, frame: c.frame, value: worst.value, limit: worst.limit, words: ok ? 'Nothing passes through the equipment or the floor.' : worst.words };
}

/** knee centre over the foot: its side offset (across the pelvis) within the foot's width band (ankle, ball, toe) ± 3 cm */
export function checkKneeOverFoot(c: FrameCtx): CheckResult {
  const g = geo(c);
  const x = mv(g.bones.pelvis.Rw as M3, [1, 0, 0]), n = Math.hypot(x[0], x[2]) || 1;
  const side = (p: Vec3) => (p[0] * x[0] + p[2] * x[2]) / n;
  let worst: CheckResult | null = null;
  for (const s of ['_l', '_r']) {
    const k = side(g.joint('knee' + s));
    const band = [g.bones['foot' + s].head, g.bones['ball' + s].head, g.bones['ball' + s].tail].map(side);
    const off = Math.max(0, Math.min(...band) - k, k - Math.max(...band));
    if (!worst || off > worst.value)
      worst = { id: 'kneeOverFoot', ok: off <= KNEE_M, frame: c.frame, value: off, limit: KNEE_M,
        words: off <= KNEE_M ? 'Knees track over the feet.' : `The ${say('knee' + s)} is ${cm(off)} to the side of the foot.` };
  }
  return worst!;
}

/** lumbar flexion ≤ maxLumbarFlex (default 20°) */
export function checkNeutralSpine(c: FrameCtx, params: { maxLumbarFlex?: number } = {}): CheckResult {
  const v = c.pose.joints.lumbar?.flex ?? 0, limit = params.maxLumbarFlex ?? LUMBAR_DEG, ok = v <= limit;
  return { id: 'neutralSpine', ok, frame: c.frame, value: v, limit,
    words: ok ? 'The lower back stays near neutral.' : `The lower back bends ${Math.round(v)}° (keep it under ${limit}°).` };
}

/** rotation taking +x to unit d, as three.js Quaternion.setFromUnitVectors(X, d) (180° about y when d = −x) */
function fromX(d: Vec3): M3 {
  const c = d[0];
  if (c < -1 + 1e-9) return [-1, 0, 0, 0, 1, 0, 0, 0, -1];
  const ax: Vec3 = [0, -d[2], d[1]], k = 1 / (1 + c); // axis x × d (unnormalised, |ax| = sin)
  return [
    c + ax[0] * ax[0] * k, ax[0] * ax[1] * k - ax[2], ax[0] * ax[2] * k + ax[1],
    ax[1] * ax[0] * k + ax[2], c + ax[1] * ax[1] * k, ax[1] * ax[2] * k - ax[0],
    ax[2] * ax[0] * k - ax[1], ax[2] * ax[1] * k + ax[0], c + ax[2] * ax[2] * k,
  ];
}

/** hand-held items' colliders where they hang in the posed hands, as src/ui/workouts/equipment.ts handheld() draws them */
function heldColliders(items: Item[], c: { sex: Sex; pose: Pose; data: EngineData }, s: number, placed: Placed): PlacedCollider[] {
  if (!items.length) return [];
  const skel = c.data.skel[c.sex], f = skel.posed(c.pose), g = bodyGeometry(skel, c.pose, c.data.segments, 70, c.sex);
  const hL = g.point('hand_l'), hR = g.point('hand_r');
  const move = (it: Item, R: M3, at: (p: Vec3) => Vec3): PlacedCollider[] => it.colliders.map((k) => {
    const w = (p: Vec3) => add(at(p), mv(R, scl(p, s)));
    if (k.box) {
      const rx = (k.box.rx ?? 0) * Math.PI / 180, cs = Math.cos(rx), sn = Math.sin(rx);
      const axes = ([[1, 0, 0], [0, cs, sn], [0, -sn, cs]] as Vec3[]).map((e) => mv(R, e)) as [Vec3, Vec3, Vec3];
      return { item: it.id, name: k.name, box: { center: w(k.box.center), half: scl(k.box.size, s / 2), axes } };
    }
    return { item: it.id, name: k.name, capsule: { a: w(k.capsule!.a), b: w(k.capsule!.b), r: k.capsule!.r * s } };
  });
  return items.flatMap((it) => {
    const m = it.parts.model;
    if (m === 'band') return placed.colliders.filter((k) => k.item === it.id); // the band stays where it is placed
    if (m === 'dumbbell') // one per hand, turned with the hand
      return (['_l', '_r'] as const).flatMap((sd) => move(it, f.Rs[skel.names.indexOf('hand' + sd)], () => (sd === '_l' ? hL : hR)));
    const g0 = it.grip![0].point, g1 = it.grip![it.grip!.length - 1].point, gm = scl(add(g0, g1), 0.5);
    let d = sub(hL, hR);
    if (m === 'kettlebell') d[1] = 0; // the bell hangs straight down
    const l = Math.hypot(...d);
    d = l < 1e-4 ? [1, 0, 0] : scl(d, 1 / l);
    const R = fromX(d), mid = scl(add(hL, hR), 0.5);
    return move(it, R, () => sub(mid, mv(R, scl(gm, s))));
  });
}

/**
 * Form checks of a record for one sex: one row per check (its worst frame); a check that applies to no frame is left
 * out. Frames: keyframes k0..kn and t = .25, .5, .75 between each pair (lerpPose). Exercise keyframes are prototype
 * poses (protoToPose: root offsets and pinAt × body scale); supports per frame from setupVariant with the keyframe's own pin
 * (in-betweens: the next keyframe's, as lerpPose takes its pin). A Resolved record brings Pose keyframes and its loads
 * and supports.
 */
export function formChecks(rec: Checkable | Resolved, sex: Sex, data: EngineData, tables: FormTables, equipment: EquipmentJson): CheckResult[] {
  const skel = data.skel[sex], s = skel.H[skel.names.indexOf('pelvis')][1] / PROTO_ROOT_Y;
  const resolved = 'supports' in rec;
  const poses = resolved ? rec.keyframes : rec.keyframes.map((k: ProtoPose) => protoToPose(k, s));
  const setup = (i: number) => (resolved ? { loads: rec.loads, supports: rec.supports }
    : setupVariant(rec.id, rec.props, supportPin(rec.keyframes[i]), tables, rec.loads ?? {}));

  const items = rec.equipment ?? [], all = placeEquipment(items, rec.placement ?? {}, s, equipment);
  const kind = (id: string) => findItem(equipment, id)!.kind;
  const placed: Placed = {
    surfaces: all.surfaces.filter((x) => kind(x.item) === 'fixed'),
    colliders: all.colliders.filter((x) => kind(x.item) === 'fixed'),
    grips: all.grips.filter((x) => kind(x.item) === 'fixed'),
  };
  const held = items.filter((id) => id !== 'bodyweight' && kind(id) === 'handheld').map((id) => findItem(equipment, id)!);
  const meta = { id: rec.id ?? 'task', props: rec.props, formChecks: rec.formChecks ?? [] };

  const frames: { pose: Pose; frame: number; at: number }[] = [];
  poses.forEach((p, i) => {
    frames.push({ pose: p, frame: i, at: i });
    if (i + 1 < poses.length) for (const t of IN_BETWEEN) frames.push({ pose: lerpPose(p, poses[i + 1], t), frame: i + t, at: i + 1 });
  });

  const worst = new Map<CheckId, CheckResult>();
  const over = (r: CheckResult) => (r.id === 'balance' ? r.limit - r.value : r.value - r.limit);
  const keep = (r: CheckResult | null) => {
    const w = r && worst.get(r.id);
    if (r && (!w || over(r) > over(w))) worst.set(r.id, r);
  };
  for (const fr of frames) {
    const c: FrameCtx = { sex, pose: fr.pose, frame: fr.frame, rec: meta, data, tables, placed, ...setup(fr.at), held: heldColliders(held, { sex, pose: fr.pose, data }, s, all) };
    keep(checkLimits(c));
    if (!braced(c)) keep(checkBalance(c));
    keep(checkContacts(c));
    keep(checkClearance(c));
    for (const fc of meta.formChecks) keep(fc.id === 'kneeOverFoot' ? checkKneeOverFoot(c) : checkNeutralSpine(c, fc.params));
  }
  const order: CheckId[] = ['limits', 'balance', 'contacts', 'clearance', 'kneeOverFoot', 'neutralSpine'];
  return order.flatMap((id) => (worst.has(id) ? [worst.get(id)!] : []));
}
