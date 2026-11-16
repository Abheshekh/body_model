// Roles (PLAN R4, §2b.6; SPEC §4 step 9): a joint that moves ≥ 5° between the keyframes → the muscle working it
// "does the work" (or "helps" when its best action weight is < 0.6); demand without motion → "holds you still".
// Rule-driven levels (scapula, grip, bracing) have no joint of their own, so they hold. Pure.
import type { Pose } from '../rig/pose';
import type { MuscleResult, Reason } from './types';

export const MOVE_DEG = 5;
export const HELP_WEIGHT = 0.6;

/** Joint keys with any axis changing by ≥ 5° between poses a and b. No b: nothing moves. */
export function movedJoints(a: Pose, b?: Pose): Set<string> {
  const out = new Set<string>();
  if (!b) return out;
  for (const j of new Set([...Object.keys(a.joints), ...Object.keys(b.joints)])) {
    const x = a.joints[j] ?? {}, y = b.joints[j] ?? {};
    if ([...new Set([...Object.keys(x), ...Object.keys(y)])].some((ax) => Math.abs((x[ax] ?? 0) - (y[ax] ?? 0)) >= MOVE_DEG)) out.add(j);
  }
  return out;
}

/** Role of a muscle from its level, its strongest reason and that action's weight. */
export function roleOf(level: number, best: Reason | undefined, weight: number, moved: Set<string>): MuscleResult['role'] {
  if (!(level > 0) || !best) return 'none';
  if (best.kind !== 'joint' || !moved.has(best.joint)) return 'hold';
  return weight < HELP_WEIGHT ? 'help' : 'work';
}
