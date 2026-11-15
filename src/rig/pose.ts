// Pure pose model (no three.js). Axis conventions: PLAN section 4 and 2b.
// Euler order (2b.1, the prototype's): intrinsic Z (abd/side/dev/inv/roll), then X (flex/pitch),
// then Y (rot/twist/turn/pron/yaw). Zero = anatomical zero. root.x/y/z = metres offset from rest pelvis.
export type Axes = Record<string, number>;
export interface Root { x: number; y: number; z: number; pitch: number; roll: number; yaw: number }
export type Pin = 'none' | 'ground' | 'flat' | 'toes' | 'toeL' | 'toeR' | 'hands';
export interface Pose { root: Root; joints: Record<string, Axes>; pin?: Pin; pinAt?: [number, number, number] }
/** Same shape as the `joints` map in public/data/joints.json (source field ignored). */
export type Limits = Record<string, Record<string, { min: number; max: number }>>;

const ROOT_KEYS: (keyof Root)[] = ['x', 'y', 'z', 'pitch', 'roll', 'yaw'];
export const emptyPose = (): Pose => ({ root: { x: 0, y: 0, z: 0, pitch: 0, roll: 0, yaw: 0 }, joints: {} });

export function clampPose(p: Pose, limits: Limits): Pose {
  const joints: Record<string, Axes> = {};
  for (const [j, axes] of Object.entries(p.joints)) {
    joints[j] = {};
    for (const [a, v] of Object.entries(axes)) {
      const l = limits[j]?.[a];
      joints[j][a] = l ? Math.min(l.max, Math.max(l.min, v)) : v;
    }
  }
  return { ...p, root: { ...p.root }, joints };
}

export function lerpPose(a: Pose, b: Pose, t: number): Pose {
  const m = (x: number, y: number) => x + (y - x) * t;
  const root = { ...a.root };
  for (const k of ROOT_KEYS) root[k] = m(a.root[k], b.root[k]);
  const joints: Record<string, Axes> = {};
  for (const j of new Set([...Object.keys(a.joints), ...Object.keys(b.joints)])) {
    joints[j] = {};
    for (const ax of new Set([...Object.keys(a.joints[j] ?? {}), ...Object.keys(b.joints[j] ?? {})]))
      joints[j][ax] = m(a.joints[j]?.[ax] ?? 0, b.joints[j]?.[ax] ?? 0);
  }
  return { root, joints, pin: b.pin ?? a.pin, pinAt: b.pinAt ?? a.pinAt };
}

const swapSide = (k: string) => k.endsWith('_l') ? k.slice(0, -2) + '_r' : k.endsWith('_r') ? k.slice(0, -2) + '_l' : k;
// Axes that flip sign when reflecting a midline joint left-right.
const FLIP = new Set(['side', 'twist', 'turn']);

/** Left-right mirror. Paired joints swap sides (abd/rot/dev/inv are already side-relative). */
export function mirror(p: Pose): Pose {
  const joints: Record<string, Axes> = {};
  for (const [j, axes] of Object.entries(p.joints)) {
    const k = swapSide(j), paired = k !== j;
    joints[k] = {};
    for (const [a, v] of Object.entries(axes)) joints[k][a] = !paired && FLIP.has(a) ? -v : v;
  }
  const r = p.root;
  return { ...p, root: { ...r, x: -r.x, roll: -r.roll, yaw: -r.yaw }, joints };
}

/** Elevation (2b.13): angle between the commanded upper-arm direction and straight down.
 * With Z (abd) then X (flex), down . direction = cos(flex) cos(abd); rot (Y) does not move it. */
export const armElevation = (flex: number, abd: number): number => {
  const r = Math.PI / 180;
  return Math.acos(Math.max(-1, Math.min(1, Math.cos(flex * r) * Math.cos(abd * r)))) / r;
};

/** Clavicle elevation (2b.13): max(0, elevation - 30) / 3 (scapulohumeral rhythm, convention). */
export const scapulaFromArm = (elevation: number): number => elevation <= 30 ? 0 : (elevation - 30) / 3;

/** Split one spine value 60% lumbar / 40% thoracic. */
export const splitSpine = (v: number) => ({ lumbar: 0.6 * v, thoracic: 0.4 * v });

// ---- prototype conversion (prototype/index.html solve()) ----
export const PROTO_ROOT_Y = 0.965; // prototype ROOT_Y; Pose.root.y is the offset from it (2b.5)
const neg = (v: number) => 0 - v; // avoids -0
const PINS: Pin[] = ['none', 'ground', 'flat', 'toes', 'toeL', 'toeR', 'hands'];
type PAxes = Record<string, number>;
export interface ProtoPose {
  root?: { y?: number; z?: number; pitch?: number; yaw?: number; roll?: number };
  spine?: PAxes; neck?: PAxes; stance?: 'L' | 'R'; flat?: boolean; armsHang?: boolean | number;
  [key: string]: unknown; // shoulder/elbow/wrist/hip/knee/ankle with optional L/R suffix, pin, pinAt
}
const REST_SHOULDER = { flex: 0, abd: 6, rot: 0 };

/** Convert a prototype pose to a Pose. Symmetric unless `<name>L` / `<name>R` keys are given. */
export function fromPrototype(p: ProtoPose): Pose {
  const obj = (k: string) => (p[k] as PAxes | undefined) ?? {};
  const num = (k: string, s: string) => (p[k + s] !== undefined ? p[k + s] : p[k] ?? 0) as number;
  const sp = { flex: 0, side: 0, twist: 0, ...p.spine };
  const nk = { flex: 0, side: 0, twist: 0, ...p.neck };
  const r = p.root ?? {};
  const st = p.stance ?? 'L';
  const hpS = { flex: 0, ...obj('hip'), ...obj('hip' + st) };
  const pitch = r.pitch !== undefined ? r.pitch : p.flat === false ? 0 : hpS.flex - num('knee', st) - num('ankle', st);
  const joints: Record<string, Axes> = {
    lumbar: { flex: splitSpine(sp.flex).lumbar, side: splitSpine(sp.side).lumbar, twist: splitSpine(sp.twist).lumbar },
    thoracic: { flex: splitSpine(sp.flex).thoracic, side: splitSpine(sp.side).thoracic, twist: splitSpine(sp.twist).thoracic },
    neck: { flex: nk.flex, side: nk.side, turn: nk.twist },
  };
  for (const n of ['L', 'R']) {
    const s = '_' + n.toLowerCase();
    const sh = { ...REST_SHOULDER, ...obj('shoulder'), ...obj('shoulder' + n) };
    const hp = { flex: 0, abd: 0, rot: 0, ...obj('hip'), ...obj('hip' + n) };
    if (p.armsHang) sh.flex = pitch + sp.flex + (p.armsHang === true ? 0 : p.armsHang);
    joints['shoulder' + s] = { flex: sh.flex, abd: sh.abd, rot: neg(sh.rot) };
    joints['elbow' + s] = { flex: num('elbow', n), pron: 0 };
    joints['wrist' + s] = { flex: num('wrist', n), dev: 0 };
    joints['hip' + s] = { flex: hp.flex, abd: hp.abd, rot: neg(hp.rot) };
    joints['knee' + s] = { flex: num('knee', n) };
    joints['ankle' + s] = { flex: neg(num('ankle', n)), inv: 0 };
  }
  const pose: Pose = { root: { x: 0, y: (r.y ?? PROTO_ROOT_Y) - PROTO_ROOT_Y, z: r.z ?? 0, pitch, roll: r.roll ?? 0, yaw: r.yaw ?? 0 }, joints };
  pose.pin = PINS.includes(p.pin as Pin) ? p.pin as Pin : 'toes'; // prototype default: pin: p.pin || 'toes'
  if (Array.isArray(p.pinAt)) pose.pinAt = p.pinAt as [number, number, number];
  return pose;
}
