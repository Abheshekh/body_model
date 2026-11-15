// R5 skeleton (pure, no three.js): bone hierarchy per sex from rig.json, forward kinematics, grounding and limb IK.
// Mirrors tools/pipeline/v5/rig.py (zero_dir, bind_rotations, euler, joint_rotation, arm_elevation, local_rotations,
// fk, ground) exactly; skeleton.test.ts cross-checks it against a rig.py export. Axis conventions: PLAN §2b.1-5, 2b.13.
import { clampPose, type Limits, type Pose } from './pose';
import { solveTwoBone, type Vec3 } from './ik';

/** Row-major 3×3. */
export type M3 = number[];
export type Sex = 'male' | 'female';
export interface RigBone { name: string; parent: string | null; headM: Vec3; tailM: Vec3; headF: Vec3; tailF: Vec3 }
export interface RigJoint { bones: string[]; axes: string[]; derived?: boolean }
export interface Rig { version: number; sources: string[]; bones: RigBone[]; joints: Record<string, RigJoint>; partBone: Record<string, number> }
/** World rotations, skin rotations and skin translations per bone: v' = Rs · v + ts (bind → posed). */
export interface Posed { Rw: M3[]; Rs: M3[]; ts: Vec3[] }
export type Limb = 'arm_l' | 'arm_r' | 'leg_l' | 'leg_r';

const I3: M3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];
const D = Math.PI / 180;
export const mul = (a: M3, b: M3): M3 => {
  const r = new Array<number>(9);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) r[i * 3 + j] = a[i * 3] * b[j] + a[i * 3 + 1] * b[3 + j] + a[i * 3 + 2] * b[6 + j];
  return r;
};
export const tr = (a: M3): M3 => [a[0], a[3], a[6], a[1], a[4], a[7], a[2], a[5], a[8]];
export const mv = (a: M3, v: Vec3): Vec3 => [
  a[0] * v[0] + a[1] * v[1] + a[2] * v[2], a[3] * v[0] + a[4] * v[1] + a[5] * v[2], a[6] * v[0] + a[7] * v[1] + a[8] * v[2]];
const add = (p: Vec3, q: Vec3): Vec3 => [p[0] + q[0], p[1] + q[1], p[2] + q[2]];
const sub = (p: Vec3, q: Vec3): Vec3 => [p[0] - q[0], p[1] - q[1], p[2] - q[2]];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (v: Vec3) => Math.hypot(v[0], v[1], v[2]);
const unit = (v: Vec3): Vec3 => { const n = norm(v); return [v[0] / n, v[1] / n, v[2] / n]; };

/** §2b.1: intrinsic Z, then X, then Y, degrees: Rz · Rx · Ry. */
export function euler(z = 0, x = 0, y = 0): M3 {
  const [cz, sz, cx, sx, cy, sy] = [Math.cos(z * D), Math.sin(z * D), Math.cos(x * D), Math.sin(x * D), Math.cos(y * D), Math.sin(y * D)];
  return mul(mul([cz, -sz, 0, sz, cz, 0, 0, 0, 1], [1, 0, 0, 0, cx, -sx, 0, sx, cx]), [cy, 0, sy, 0, 1, 0, -sy, 0, cy]);
}

/** Rotation taking direction a onto direction b (pose.py rot_between; antiparallel returns identity). */
export function rotBetween(a: Vec3, b: Vec3): M3 {
  const u = unit(a), w = unit(b);
  const v = cross(u, w), c = u[0] * w[0] + u[1] * w[1] + u[2] * w[2];
  if (norm(v) < 1e-8) return [...I3];
  const K: M3 = [0, -v[2], v[1], v[2], 0, -v[0], -v[1], v[0], 0];
  const KK = mul(K, K);
  return I3.map((e, i) => e + K[i] + KK[i] / (1 + c));
}

const LIMB_BONES = ['upperarm', 'lowerarm', 'hand', 'thigh', 'calf'];
/** §2b.3 anatomical-zero direction (head → tail): straight down for the limb bones; null for every other bone
 * (§2b.0a: pelvis, spine, neck, head, clavicle, foot, ball use their fitted orientation as zero). */
export const zeroDir = (b: string): Vec3 | null => (LIMB_BONES.some((l) => b.startsWith(l)) ? [0, -1, 0] : null);

// §2b.4 semantic signs: axis -> [Euler slot, sign left/midline, sign right] (rig.py SIGN).
type Slot = 'x' | 'y' | 'z';
const SIGN: Record<string, [Slot, number, number]> = {
  flex: ['x', -1, -1], abd: ['z', 1, -1], dev: ['z', 1, -1], inv: ['z', -1, 1], rot: ['y', -1, 1],
  pron: ['y', -1, 1], side: ['z', -1, -1], twist: ['y', 1, 1], turn: ['y', 1, 1], pitch: ['x', 1, 1],
  roll: ['z', -1, -1], yaw: ['y', 1, 1], elev: ['z', 1, -1],
};
const FLEX_UP = new Set(['lumbar', 'thoracic', 'neck', 'head', 'knee']); // flex = Rx(+)
const ROOT_OFFSET = new Set(['x', 'y', 'z']);

/** One joint's local rotation from semantic angles (degrees) in its parent segment's anatomical frame. */
export function jointRotation(key: string, axes: Record<string, number>): M3 {
  const a = { x: 0, y: 0, z: 0 };
  const base = key.includes('_') ? key.slice(0, key.lastIndexOf('_')) : key;
  for (const [ax, v] of Object.entries(axes)) {
    if (key === 'pelvis' && ROOT_OFFSET.has(ax)) continue;
    const s = SIGN[ax];
    if (!s) continue;
    a[s[0]] += (ax === 'flex' && FLEX_UP.has(base) ? 1 : key.endsWith('_r') ? s[2] : s[1]) * v;
  }
  return euler(a.z, a.x, a.y);
}

/** §2b.13: degrees between a commanded upper-arm local rotation's segment (R · down) and straight down. */
const segElevation = (R: M3) => Math.acos(Math.max(-1, Math.min(1, R[4]))) / D;

const PIN_BONES: Record<string, string[]> = {
  ground: ['foot_l', 'foot_r', 'ball_l', 'ball_r'], flat: ['foot_l', 'foot_r', 'ball_l', 'ball_r'],
  toes: ['ball_l', 'ball_r'], toeL: ['ball_l'], toeR: ['ball_r'],
  hands: ['hand_l', 'hand_r', 'foot_l', 'foot_r', 'ball_l', 'ball_r'],
};

export interface Skeleton {
  readonly names: readonly string[];
  readonly H: readonly Vec3[];
  readonly T: readonly Vec3[];
  /** rig.py local_rotations */
  local(p: Pose): M3[];
  /** rig.py fk (no grounding) */
  fk(p: Pose): Posed;
  /** rig.py ground: shift for the pose's pin (hands + pinAt: hand_l head to pinAt; else y only) */
  ground(p: Pose, f: Posed): Vec3;
  /** fk with the ground shift folded into ts: what the GPU draws */
  posed(p: Pose): Posed;
  /** world position of a joint (its first bone's head) for posed f, or the bind position for null */
  jointPosition(f: Posed | null, key: string): Vec3;
  /** §2b.14: arm/leg angles that put the wrist/ankle (hand/foot head) at target, in the fk frame (before ground). */
  solveLimb(p: Pose, limb: Limb, target: Vec3, limits?: Limits): Pose;
}

export function createSkeleton(rig: Rig, sex: Sex): Skeleton {
  const names = rig.bones.map((b) => b.name);
  const idx = (b: string) => names.indexOf(b);
  const H = rig.bones.map((b) => (sex === 'male' ? b.headM : b.headF));
  const T = rig.bones.map((b) => (sex === 'male' ? b.tailM : b.tailF));
  const par = rig.bones.map((b) => (b.parent === null ? -1 : idx(b.parent)));
  const bind = names.map((b, i) => { const z = zeroDir(b); return z ? rotBetween(z, sub(T[i], H[i])) : [...I3]; });

  const local = (p: Pose): M3[] => {
    const L = names.map(() => [...I3]);
    L[0] = jointRotation('pelvis', (p.root ?? {}) as unknown as Record<string, number>);
    for (const [key, axes] of Object.entries(p.joints ?? {})) {
      const j = rig.joints[key];
      if (!j || key.startsWith('scapula')) continue;
      const n = j.bones.length;
      const R = jointRotation(key, Object.fromEntries(Object.entries(axes).map(([a, v]) => [a, v / n])));
      for (const b of j.bones) L[idx(b)] = R;
    }
    for (const s of ['l', 'r']) {
      const c = idx(`clavicle_${s}`), u = idx(`upperarm_${s}`);
      L[c] = jointRotation(`scapula_${s}`, { elev: Math.max(0, segElevation(L[u]) - 30) / 3 });
      L[u] = mul(tr(L[c]), L[u]);
    }
    return L;
  };

  const fk = (p: Pose): Posed => {
    const L = local(p), r = p.root ?? { x: 0, y: 0, z: 0 };
    const Rw: M3[] = [], Rs: M3[] = [], ts: Vec3[] = [];
    names.forEach((_, i) => {
      let head: Vec3;
      if (par[i] < 0) {
        Rw[i] = L[i];
        head = add(H[i], [r.x ?? 0, r.y ?? 0, r.z ?? 0]);
      } else {
        const j = par[i];
        Rw[i] = mul(Rw[j], L[i]);
        head = add(mv(Rs[j], H[i]), ts[j]);
      }
      Rs[i] = mul(Rw[i], tr(bind[i]));
      ts[i] = sub(head, mv(Rs[i], H[i]));
    });
    return { Rw, Rs, ts };
  };

  const ground = (p: Pose, f: Posed): Vec3 => {
    const at = (i: number, X: readonly Vec3[]) => add(mv(f.Rs[i], X[i]), f.ts[i]);
    if (p.pin === 'hands' && p.pinAt) return sub(p.pinAt, at(idx('hand_l'), H)); // the left wrist hangs at pinAt
    const bones = PIN_BONES[p.pin ?? 'none'];
    if (!bones) return [0, 0, 0];
    let low = Infinity;
    for (const b of bones) for (const X of [H, T]) low = Math.min(low, at(idx(b), X)[1]);
    return [0, (p.pinAt ?? [0, 0, 0])[1] - low, 0];
  };

  const posed = (p: Pose): Posed => {
    const f = fk(p), g = ground(p, f);
    return { ...f, ts: f.ts.map((t) => add(t, g)) };
  };

  const jointPosition = (f: Posed | null, key: string): Vec3 => {
    const i = idx(rig.joints[key]?.bones[0] ?? key);
    return f ? add(mv(f.Rs[i], H[i]), f.ts[i]) : [...H[i]];
  };

  const solveLimb = (p: Pose, limb: Limb, target: Vec3, limits?: Limits): Pose => {
    const s = limb.slice(-2), arm = limb.startsWith('arm');
    const [root, mid, upper, lower, end, parent] = arm
      ? ['shoulder' + s, 'elbow' + s, 'upperarm' + s, 'lowerarm' + s, 'hand' + s, 'spine_03']
      : ['hip' + s, 'knee' + s, 'thigh' + s, 'calf' + s, 'foot' + s, 'pelvis'];
    const left = s === '_l';
    let out = p;
    // the arm's shoulder pivot rides on the derived clavicle, which follows the solved arm: settle in a few passes
    for (let pass = 0; pass < (arm ? 4 : 1); pass++) {
      const f = fk(out);
      const at = (b: string) => add(mv(f.Rs[idx(b)], H[idx(b)]), f.ts[idx(b)]);
      const Rp = f.Rw[idx(parent)];
      const r = solveTwoBone(at(upper), at(lower), at(end), target, mv(Rp, [0, 0, arm ? -1 : 1]), limits?.[mid]?.flex);
      // upper segment direction in the parent frame: Rz(z) Rx(x) (0,-1,0) = (sz cx, -cz cx, -sx)
      const d = unit(mv(tr(Rp), sub(r.mid, at(upper))));
      const x = Math.asin(Math.max(-1, Math.min(1, -d[2]))) / D, z = Math.atan2(d[0], -d[1]) / D;
      // twist (Y) so the hinge bends in the solved plane: elbow bends to local +Z (normal -X), knee to -Z (normal +X)
      const RzRx = euler(z, x, 0);
      let y: number;
      const n = mv(tr(Rp), cross(sub(r.mid, at(upper)), sub(r.end, r.mid)));
      if (norm(n) > 1e-9) {
        const m = mv(tr(RzRx), arm ? unit(n).map((v) => -v) as Vec3 : unit(n));
        y = Math.atan2(-m[2], m[0]) / D;
      } else {
        y = (out.joints[root]?.rot ?? 0) * (left ? -1 : 1); // straight limb: keep the current twist
      }
      out = {
        ...out,
        joints: {
          ...out.joints,
          [root]: { ...out.joints[root], flex: -x, abd: left ? z : -z, rot: left ? -y : y },
          [mid]: { ...out.joints[mid], flex: r.flex },
        },
      };
      if (limits) out = clampPose(out, limits);
    }
    return out;
  };

  return { names, H, T, local, fk, ground, posed, jointPosition, solveLimb };
}
