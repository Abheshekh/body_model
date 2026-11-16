// Effort engine entry points (PLAN R2-R4, SPEC §4): pose + loads + supports → joint demand, muscle levels and roles,
// lower-back moment, balance. Pure: no three.js, no fetch (the caller parses the JSON and passes it to engineData).
import { armElevation, lerpPose, type Pose } from '../rig/pose';
import { createSkeleton, type Rig, type Skeleton } from '../rig/skeleton';
import { bodyGeometry, expandPoint, norm, pointBone } from './geometry';
import { muscleLevels, MIDLINE, type Actions, type MusclePart, type RuleLevels } from './muscles';
import { movedJoints, roleOf } from './roles';
import { bracingRule } from './rules/bracing';
import { gripRule } from './rules/grip';
import { scapulaRule } from './rules/scapula';
import { gravityForces, loadForces, solveSupports } from './statics';
import { jointTorques } from './torque';
import type { EffortInput, EffortResult, Force, Geometry, MuscleResult, Segments, Sex, Vec3 } from './types';

export type Strengths = Record<string, Record<string, { '+': number; '-': number }>>;
export interface EngineData { rig: Rig; segments: Segments; strengths: Strengths; actions: Actions; parts: MusclePart[]; skel: Record<Sex, Skeleton> }

/** Assemble engine data from the parsed JSON files (rig.json, manifest.json, segments, strengths, actions). */
export function engineData(json: {
  rig: Rig; manifest: { parts: { id: number; plain: string; side: string; kind: string }[] };
  segments: { segments: Segments }; strengths: { strengths: Strengths }; actions: { muscles: Actions };
}): EngineData {
  const strengths = json.strengths.strengths, actions = json.actions.muscles;
  for (const [m, { actions: acts }] of Object.entries(actions))
    for (const [joint, axis] of acts)
      if (!strengths[joint]?.[axis]) throw new Error(`actions.json "${m}": unknown joint axis ${joint}.${axis}`);
  return {
    rig: json.rig, segments: json.segments.segments, strengths, actions,
    parts: json.manifest.parts.filter((p) => p.kind === 'muscle').map((p) => ({ id: p.id, plain: p.plain, side: p.side as MusclePart['side'] })),
    skel: { male: createSkeleton(json.rig, 'male'), female: createSkeleton(json.rig, 'female') },
  };
}

const baseOf = (k: string) => (MIDLINE.has(k) ? k : k.replace(/_[lr]$/, ''));
const handForce = (fs: Force[], bones: Set<string>) =>
  norm(fs.filter((x) => bones.has(x.bone)).reduce<Vec3>((a, x) => [a[0] + x.f[0], a[1] + x.f[1], a[2] + x.f[2]], [0, 0, 0]));

/** Effort for one pose. With `poseB`, roles come from the motion between pose and poseB; without, nothing moves. */
export function effort(input: EffortInput, data: EngineData): EffortResult {
  return run(input, data, movedJoints(input.pose, input.poseB));
}

function run(input: EffortInput, data: EngineData, moved: Set<string>): EffortResult {
  const massKg = input.massKg ?? 70;
  const g = bodyGeometry(data.skel[input.sex], input.pose, data.segments, massKg, input.sex);
  const { reactions, balance, warnings } = solveSupports(g, input.loads, input.supports);
  const loads = loadForces(g, input.loads);
  const tau = jointTorques(g, [...gravityForces(g), ...loads, ...reactions], data.rig.joints);

  const jointDemand: EffortResult['jointDemand'] = {};
  for (const [k, axes] of Object.entries(tau)) {
    const s = data.strengths[baseOf(k)];
    if (!s) throw new Error(`No strength for joint "${k}"`);
    jointDemand[k] = Object.fromEntries(Object.entries(axes).filter(([a]) => s[a]).map(([a, t]) =>
      [a, { plus: Math.max(0, t) / (s[a]['+'] * massKg), minus: Math.max(0, -t) / (s[a]['-'] * massKg) }]));
  }

  const lumbarNm = data.strengths.lumbar.flex['-'] * massKg; // extension strength
  const momentNm = Math.hypot(...Object.values(tau.lumbar ?? {}));
  const rules = sideRules(g, [...loads, ...reactions], momentNm, lumbarNm);
  const levels = muscleLevels(data.parts, data.actions, jointDemand, rules, distalLoadKg(g, input, Object.keys(tau)));
  const muscle: Record<number, MuscleResult> = {};
  for (const [id, m] of Object.entries(levels))
    muscle[+id] = { level: m.level, role: roleOf(m.level, m.reasons[0], m.weight, moved), reasons: m.reasons };
  return { jointDemand, muscle, lowerBack: { momentNm, level: momentNm / lumbarNm }, balance, warnings };
}

/** Scapula and grip per side, bracing for the trunk (rules/*). */
function sideRules(g: Geometry, external: Force[], lumbarMomentNm: number, lumbarStrengthNm: number): RuleLevels {
  const r: RuleLevels = { scapula: { left: {}, right: {} }, grip: { left: {}, right: {} }, bracing: bracingRule(lumbarMomentNm, lumbarStrengthNm) };
  for (const [side, s] of [['left', '_l'], ['right', '_r']] as const) {
    const p = g.pose.joints['shoulder' + s] ?? {};
    // load off the arm: everything external acting on the forearm and hand (held loads, floor, bar, pad)
    r.scapula[side] = scapulaRule(armElevation(p.flex ?? 0, p.abd ?? 0), handForce(external, new Set(g.distal('elbow' + s))), side);
    // grip: held loads, plus a hand support above the shoulder (the body hangs from it; a floor below only pushes)
    // ponytail: hang vs push told apart by hand height vs shoulder; a support table flag if a case ever disagrees
    const hand = new Set(g.distal('wrist' + s)), hangs = g.point(`hand${s}` as 'hand_l')[1] > g.joint('shoulder' + s)[1];
    r.grip[side] = gripRule(handForce(external.filter((x) => x.kind === 'load' || hangs), hand), g.massKg, side);
  }
  return r;
}

/** kg of loads on the far side of each joint (for the words: "against 6 kg at the hand"). */
function distalLoadKg(g: Geometry, input: EffortInput, joints: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  const pts = input.loads.flatMap((l) => expandPoint(l.at).map((p, _, a) => ({ bone: pointBone(p), kg: l.kg / a.length })));
  for (const k of joints) { // every joint with a torque, not only the ones the pose names (Move starts with none)
    if (k === 'pelvis' || k.startsWith('scapula')) continue;
    const far = new Set(g.distal(k));
    const kg = pts.filter((p) => far.has(p.bone)).reduce((a, p) => a + p.kg, 0);
    if (kg > 0) out[k] = kg;
  }
  return out;
}

/**
 * Effort over a movement: `samples` poses from a to b (inclusive). Peak demand and levels (reasons from the peak
 * sample), peak lower-back moment, worst balance margin, all warnings; roles from the motion between a and b.
 */
export function effortOverMove(a: Pose, b: Pose, input: Omit<EffortInput, 'pose' | 'poseB'>, data: EngineData, samples = 9): EffortResult {
  const moved = movedJoints(a, b);
  let out: EffortResult | undefined;
  for (let i = 0; i < samples; i++) {
    const r = run({ ...input, pose: lerpPose(a, b, samples > 1 ? i / (samples - 1) : 0) }, data, moved);
    if (!out) { out = r; continue; }
    for (const [k, axes] of Object.entries(r.jointDemand))
      for (const [ax, d] of Object.entries(axes)) {
        const o = ((out.jointDemand[k] ??= {})[ax] ??= { plus: 0, minus: 0 });
        o.plus = Math.max(o.plus, d.plus);
        o.minus = Math.max(o.minus, d.minus);
      }
    for (const [id, m] of Object.entries(r.muscle)) if (m.level > (out.muscle[+id]?.level ?? -1)) out.muscle[+id] = m;
    if (r.lowerBack.momentNm > out.lowerBack.momentNm) out.lowerBack = r.lowerBack;
    if (r.balance.margin < out.balance.margin) out.balance = r.balance;
    out.warnings = [...new Set([...out.warnings, ...r.warnings])];
  }
  if (!out) throw new Error('effortOverMove: samples must be ≥ 1');
  return out;
}
