// Analytic two-bone IK (pure). a = root joint, b = mid joint, c = end joint at rest; lengths come from them.
export type Vec3 = [number, number, number];
const sub = (p: Vec3, q: Vec3): Vec3 => [p[0] - q[0], p[1] - q[1], p[2] - q[2]];
const add = (p: Vec3, q: Vec3): Vec3 => [p[0] + q[0], p[1] + q[1], p[2] + q[2]];
const mul = (p: Vec3, s: number): Vec3 => [p[0] * s, p[1] * s, p[2] * s];
const dot = (p: Vec3, q: Vec3) => p[0] * q[0] + p[1] * q[1] + p[2] * q[2];
const len = (p: Vec3) => Math.hypot(p[0], p[1], p[2]);
const unit = (p: Vec3): Vec3 => mul(p, 1 / len(p));

export interface TwoBone {
  mid: Vec3; end: Vec3;
  /** Bend at the mid joint in degrees, 0 = straight. */
  flex: number;
  /** True when the target was out of reach (or the bend limit stopped it). */
  clamped: boolean;
}

/** `pole` is a direction the mid joint bends toward (knee forward, elbow back). `flexLimit` clamps the mid bend. */
export function solveTwoBone(a: Vec3, b: Vec3, c: Vec3, target: Vec3, pole: Vec3, flexLimit?: { min: number; max: number }): TwoBone {
  const l1 = len(sub(b, a)), l2 = len(sub(c, b));
  const to = sub(target, a);
  const dist = len(to);
  const u = dist > 1e-9 ? unit(to) : unit(pole);
  const lo = Math.abs(l1 - l2) + 1e-9, hi = l1 + l2;
  let d = Math.min(hi, Math.max(lo, dist));
  // interior angle at mid via law of cosines; flex = 180 - interior
  const flexOf = (r: number) => 180 - (Math.acos(Math.max(-1, Math.min(1, (l1 * l1 + l2 * l2 - r * r) / (2 * l1 * l2)))) * 180) / Math.PI;
  let flex = flexOf(d);
  if (flexLimit && (flex < flexLimit.min || flex > flexLimit.max)) {
    flex = Math.min(flexLimit.max, Math.max(flexLimit.min, flex));
    const interior = ((180 - flex) * Math.PI) / 180;
    d = Math.sqrt(l1 * l1 + l2 * l2 - 2 * l1 * l2 * Math.cos(interior));
  }
  const x = (l1 * l1 - l2 * l2 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, l1 * l1 - x * x));
  let pn = sub(pole, mul(u, dot(pole, u)));
  if (len(pn) < 1e-9) pn = Math.abs(u[0]) < 0.9 ? sub([1, 0, 0], mul(u, u[0])) : sub([0, 1, 0], mul(u, u[1]));
  pn = unit(pn);
  return {
    mid: add(a, add(mul(u, x), mul(pn, h))),
    end: add(a, mul(u, d)),
    flex,
    clamped: Math.abs(d - dist) > 1e-9,
  };
}
