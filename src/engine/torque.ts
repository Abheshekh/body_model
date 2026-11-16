// Joint torques (PLAN R2, §4 tricky logic 1-2): the muscle torque each joint must hold, resolved onto its own
// pose axes. Axis directions come from jointRotation, so signs match the FK on both sides. Pure: no three.js.
import { armElevation } from '../rig/pose';
import { jointRotation, mul, mv, tr, type M3, type RigJoint } from '../rig/skeleton';
import { cross, dot, sub, unit } from './geometry';
import type { Force, Geometry, Vec3 } from './types';

const EPS = 1e-3; // degrees
const axisOf = (R: M3): Vec3 => unit([R[7] - R[5], R[2] - R[6], R[3] - R[1]]);

/**
 * World direction of + on `axis` of joint `key` at the geometry's pose: the axis a small step of that pose angle
 * turns the joint's bone about. `hadd` (shoulder only): horizontal adduction +, about the trunk's long axis.
 */
export function jointAxis(g: Geometry, key: string, joint: RigJoint, axis: string): Vec3 {
  const n = joint.bones.length;
  const angles = Object.fromEntries(Object.entries(g.pose.joints[key] ?? {}).map(([a, v]) => [a, v / n]));
  const L = jointRotation(key, angles);
  const Rp = mul(g.bones[joint.bones[0]].Rw, tr(L)); // parent frame (for the shoulder: the trunk; FK cancels the clavicle)
  // hadd turns the arm the way internal rotation does at zero, about the trunk's long axis
  if (axis === 'hadd') return mv(Rp, axisOf(jointRotation(key, { rot: EPS })));
  return mv(Rp, axisOf(mul(jointRotation(key, { ...angles, [axis]: (angles[axis] ?? 0) + EPS / n }), tr(L))));
}

/**
 * Torque the muscles must hold at each joint (Nm, signed along each pose axis): minus the moment about the joint centre
 * of every force on the far side. Shoulder raised > 45°: also `hadd`. Root (pelvis) and derived joints are skipped.
 */
export function jointTorques(g: Geometry, forces: Force[], joints: Record<string, RigJoint>): Record<string, Record<string, number>> {
  const out: Record<string, Record<string, number>> = {};
  for (const [key, joint] of Object.entries(joints)) {
    if (key === 'pelvis' || joint.derived) continue;
    const far = new Set(g.distal(key)), c = g.joint(key);
    const tau = forces.filter((x) => far.has(x.bone))
      .reduce<Vec3>((a, x) => sub(a, cross(sub(x.at, c), x.f)), [0, 0, 0]);
    const axes = [...joint.axes];
    const p = g.pose.joints[key];
    if (key.startsWith('shoulder') && armElevation(p?.flex ?? 0, p?.abd ?? 0) > 45) axes.push('hadd');
    out[key] = Object.fromEntries(axes.map((a) => [a, dot(tau, jointAxis(g, key, joint, a))]));
  }
  return out;
}
