// Posed body geometry for the effort engine (PLAN R2, §2b.3): segment masses and COMs (Winter, segments.json),
// joint centres and body points, all in posed coordinates (after ground). Pure: no three.js.
import { emptyPose, type Pose } from '../rig/pose';
import { mv, type Skeleton } from '../rig/skeleton';
import type { BodyPoint, Geometry, Segments, Sex, Vec3 } from './types';

export const G = 9.81;
export const add = (p: Vec3, q: Vec3): Vec3 => [p[0] + q[0], p[1] + q[1], p[2] + q[2]];
export const sub = (p: Vec3, q: Vec3): Vec3 => [p[0] - q[0], p[1] - q[1], p[2] - q[2]];
export const scale = (p: Vec3, s: number): Vec3 => [p[0] * s, p[1] * s, p[2] * s];
export const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const norm = (v: Vec3) => Math.hypot(v[0], v[1], v[2]);
export const unit = (v: Vec3): Vec3 => scale(v, 1 / norm(v));
const mid = (a: Vec3, b: Vec3) => scale(add(a, b), 0.5);

/** Plural body points and the two points they stand for. */
export const POINT_ALIAS: Partial<Record<BodyPoint, BodyPoint[]>> = {
  hands: ['hand_l', 'hand_r'], foot: ['foot_l', 'foot_r'], shin: ['shin_l', 'shin_r'], shoulders: ['shoulder_l', 'shoulder_r'],
};
export const expandPoint = (p: BodyPoint): BodyPoint[] => POINT_ALIAS[p] ?? [p];

const SIDED: Record<string, string> = { hand: 'hand', foot: 'ball', heel: 'foot', shin: 'calf', shoulder: 'upperarm', thigh: 'thigh', forearm: 'lowerarm' };
/** The bone a single body point rides on. */
export function pointBone(p: BodyPoint): string {
  if (p === 'pelvis') return 'pelvis';
  if (p === 'thoraxBack') return 'spine_03';
  const b = SIDED[p.slice(0, -2)];
  if (!b || !/_[lr]$/.test(p)) throw new Error(`Body point "${p}" has no single bone`);
  return b + p.slice(-2);
}

// Bones on the far side of each joint: those whose world rotation changes when the joint flexes (from the zero pose,
// where the derived clavicle stays still). Structure only, so cached per skeleton.
const distalCache = new WeakMap<Skeleton, Map<string, string[]>>();
function distalOf(skel: Skeleton, key: string): string[] {
  let m = distalCache.get(skel);
  if (!m) distalCache.set(skel, (m = new Map()));
  let d = m.get(key);
  if (!d) {
    const p = emptyPose();
    p.joints[key] = { flex: 1 };
    const a = skel.fk(emptyPose()).Rw, b = skel.fk(p).Rw;
    d = skel.names.filter((_, i) => a[i].some((v, k) => Math.abs(v - b[i][k]) > 1e-9));
    if (!d.length) throw new Error(`Unknown joint "${key}"`);
    m.set(key, d);
  }
  return d;
}

export function bodyGeometry(skel: Skeleton, pose: Pose, segs: Segments, massKg: number, sex: Sex): Geometry {
  if (!(massKg > 0)) throw new Error(`Body mass must be > 0 kg (got ${massKg})`);
  const f = skel.posed(pose);
  const idx = (b: string) => {
    const i = skel.names.indexOf(b);
    if (i < 0) throw new Error(`Unknown bone "${b}"`);
    return i;
  };
  const at = (i: number, X: readonly Vec3[]) => add(mv(f.Rs[i], X[i]), f.ts[i]);
  const bones: Geometry['bones'] = {};
  skel.names.forEach((b, i) => {
    const head = at(i, skel.H), tail = at(i, skel.T);
    bones[b] = { mass: 0, com: mid(head, tail), head, tail, Rw: f.Rw[i] };
  });
  for (const s of Object.values(segs)) {
    const chain = s.bones.map((b) => bones[skel.names[idx(b)]]);
    const len = chain.map((c) => norm(sub(c.tail, c.head)));
    const t = s.from === 'head' ? s.comFraction : 1 - s.comFraction;
    // ponytail: the whole segment mass sits on the bone where its COM falls along the chain (by length);
    // splitting a multi-bone segment (trunk) over its bones needs per-bone fractions Winter does not give.
    let rest = t * len.reduce((a, b) => a + b, 0), k = 0;
    while (k < len.length - 1 && rest > len[k]) rest -= len[k++];
    const bone = bones[s.bones[k]];
    bone.mass += s.massFraction * massKg;
    bone.com = add(chain[0].head, scale(sub(chain[chain.length - 1].tail, chain[0].head), t));
  }

  const s = skel.H[idx('pelvis')][1] / 0.965; // body scale, as props.ts
  const single = (p: BodyPoint): Vec3 => {
    const b = bones[pointBone(p)];
    const base = p.slice(0, -2);
    if (p === 'pelvis') return add(b.head, mv(b.Rw, [0, -0.08, 0])); // ischial point
    if (p === 'thoraxBack') return add(mid(b.head, b.tail), mv(b.Rw, [0, 0, -0.12]));
    if (base === 'hand') return add(b.head, scale(unit(sub(b.tail, b.head)), 0.06 * s)); // grip point, as props.ts
    if (base === 'foot' || base === 'shoulder') return b.head;
    if (base === 'heel') { // ponytail: start value, 6 cm (× body scale) behind the ankle along the foot, at sole level
      const d = sub(b.tail, b.head), back = scale(unit([d[0], 0, d[2]]), -0.06 * s);
      return [b.head[0] + back[0], bones['ball' + p.slice(-2)].head[1], b.head[2] + back[2]];
    }
    return mid(b.head, b.tail); // shin, thigh, forearm
  };
  return {
    sex, massKg, pose, bones,
    point: (p) => { const ps = expandPoint(p).map(single); return ps.length === 1 ? ps[0] : mid(ps[0], ps[1]); },
    joint: (key) => { distalOf(skel, key); return skel.jointPosition(f, key); },
    distal: (key) => distalOf(skel, key),
  };
}
