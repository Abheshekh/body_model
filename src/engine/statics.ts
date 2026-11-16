// External forces and support reactions (PLAN R2, §4 tricky logic 3). Pure: no three.js.
import { mv } from '../rig/skeleton';
import { G, add, cross, dot, expandPoint, norm, pointBone, scale, sub, unit } from './geometry';
import type { Balance, Force, Geometry, Load, Support, Vec3 } from './types';

/** Segment weights at their COMs. */
export const gravityForces = (g: Geometry): Force[] => Object.entries(g.bones)
  .filter(([, b]) => b.mass > 0)
  .map(([bone, b]) => ({ at: b.com, f: [0, -b.mass * G, 0], bone, kind: 'gravity' }));

/** Loads as forces: free weight straight down, cable toward its pulley, machine along its track; plural points split. */
export function loadForces(g: Geometry, loads: Load[]): Force[] {
  return loads.flatMap((l) => {
    const d = l.kind === 'free' ? [0, -1, 0] as Vec3 : l.kind === 'cable' ? l.toward : l.track;
    if (!d || !(norm(d) > 0)) throw new Error(`Load "${l.id}" (${l.kind}) needs a direction`);
    const pts = expandPoint(l.at);
    const f = scale(unit(d), (l.kg * G) / pts.length);
    return pts.map((p) => ({ at: g.point(p), f, bone: pointBone(p), kind: 'load' as const }));
  });
}

const sum = (fs: Force[], c: Vec3) => fs.reduce((a, x) => ({ F: add(a.F, x.f), M: add(a.M, cross(sub(x.at, c), x.f)) }),
  { F: [0, 0, 0] as Vec3, M: [0, 0, 0] as Vec3 });

/** Solve 3×3 S y = b (Cramer). */
function solve3(S: number[][], b: number[]): number[] {
  const det = (m: number[][]) => m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1])
    - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
  const d = det(S);
  return [0, 1, 2].map((k) => det(S.map((row, i) => row.map((v, j) => (j === k ? b[i] : v)))) / d);
}

/** Signed distance of q to the convex hull of pts in the ground plane (x, z): + inside, − outside. */
function margin(pts: [number, number][], q: [number, number]): number {
  const s = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const turn = (o: number[], a: number[], b: number[]) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const half = (arr: [number, number][]) => arr.reduce<[number, number][]>((h, p) => {
    while (h.length >= 2 && turn(h[h.length - 2], h[h.length - 1], p) <= 1e-12) h.pop();
    h.push(p);
    return h;
  }, []);
  const lo = half(s), up = half([...s].reverse());
  const hull = [...lo.slice(0, -1), ...up.slice(0, -1)];
  if (hull.length === 0) hull.push(s[0]);
  const seg = (a: number[], b: number[]) => {
    const d = [b[0] - a[0], b[1] - a[1]], l2 = d[0] ** 2 + d[1] ** 2;
    const t = l2 ? Math.max(0, Math.min(1, ((q[0] - a[0]) * d[0] + (q[1] - a[1]) * d[1]) / l2)) : 0;
    return Math.hypot(q[0] - a[0] - t * d[0], q[1] - a[1] - t * d[1]);
  };
  const dist = Math.min(...hull.map((a, i) => seg(a, hull[(i + 1) % hull.length])));
  const inside = hull.length >= 3 && hull.every((a, i) => turn(a, hull[(i + 1) % hull.length], q) >= 0);
  return inside ? dist : -dist;
}

/**
 * Support reactions (minimum-norm, non-negative, active set). A contact whose normal is near-horizontal (back pad)
 * gets one push along its normal that cancels the sagittal moment about the lumbar joint from the trunk and above (≥ 0).
 * Every other contact gets an unknown push along its normal from vertical force and moment balance about x and z;
 * a negative one is dropped and the rest re-solved. Horizontal leftovers are friction, split like the verticals.
 */
export function solveSupports(g: Geometry, loads: Load[], supports: Support[]): { reactions: Force[]; balance: Balance; warnings: string[] } {
  const ext = [...gravityForces(g), ...loadForces(g, loads)];
  const contacts = supports.flatMap((s) => expandPoint(s.point).map((p) => ({ at: g.point(p), bone: pointBone(p), n: unit(s.normal) })));
  const pads = contacts.filter((c) => Math.abs(c.n[1]) < 0.5);
  let active = contacts.filter((c) => Math.abs(c.n[1]) >= 0.5);

  const reactions: Force[] = [];
  const upper = new Set(g.distal('lumbar')), cl = g.joint('lumbar'), side = mv(g.bones.pelvis.Rw, [1, 0, 0]);
  for (const p of pads) {
    const m = dot(sum([...ext, ...reactions].filter((x) => upper.has(x.bone)), cl).M, side);
    const per = dot(cross(sub(p.at, cl), p.n), side);
    const P = Math.abs(per) > 1e-9 ? Math.max(0, -m / per) : 0;
    if (P > 0) reactions.push({ at: p.at, f: scale(p.n, P), bone: p.bone, kind: 'reaction' });
  }

  const loadsIn = [...ext, ...reactions];
  // where the weight of body and loads acts on the ground plane
  const wy = (k: number) => ext.reduce((a, x) => a + x.at[k] * x.f[1], 0) / ext.reduce((a, x) => a + x.f[1], 0);
  const cop: Vec3 = [wy(0), 0, wy(2)];
  const warnings: string[] = [];
  let lam: number[] = [];
  for (;;) {
    if (!active.length) break;
    const c: Vec3 = [cop[0], active.reduce((a, x) => a + x.at[1], 0) / active.length, cop[2]];
    const { F, M } = sum(loadsIn, c);
    const A = active.map((x) => { const m = cross(sub(x.at, c), x.n); return [x.n[1], m[0], m[2]]; });
    const b = [-F[1], -M[0], -M[2]];
    // min-norm: lam = Aᵀ y, (A Aᵀ + E) y = b. E damps the two moment rows (levers under ~1 cm count as none) so two
    // feet or a single contact still solve; the force row is undamped, so vertical balance always holds.
    const S = [0, 1, 2].map((i) => [0, 1, 2].map((j) => A.reduce((a, r) => a + r[i] * r[j], 0) + (i === j && i > 0 ? 1e-4 : 0)));
    const y = solve3(S, b);
    lam = A.map((r) => r[0] * y[0] + r[1] * y[1] + r[2] * y[2]);
    const worst = lam.indexOf(Math.min(...lam));
    if (lam[worst] >= 0) break;
    active = active.filter((_, i) => i !== worst);
  }

  let balance: Balance;
  if (!active.length) {
    warnings.push(supports.length ? 'No support can hold the body here: torques come from gravity and loads only.'
      : 'No support: torques come from gravity and loads only.');
    balance = { comOverFeet: false, margin: -Infinity };
    return { reactions: [], balance, warnings };
  }
  const vert = active.map((x, i) => ({ at: x.at, f: scale(x.n, lam[i]), bone: x.bone, kind: 'reaction' as const }));
  const H = sum([...loadsIn, ...vert], [0, 0, 0]).F;
  const total = lam.reduce((a, b) => a + b, 0);
  for (const [i, r] of vert.entries()) r.f = add(r.f, scale([-H[0], 0, -H[2]], total > 0 ? lam[i] / total : 1 / lam.length));
  const mgn = margin(contacts.filter((x) => Math.abs(x.n[1]) >= 0.5).map((x) => [x.at[0], x.at[2]]), [cop[0], cop[2]]);
  balance = { comOverFeet: mgn >= 0, margin: mgn };
  return { reactions: [...reactions, ...vert], balance, warnings };
}
