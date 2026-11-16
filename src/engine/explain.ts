// Reasons in words (PLAN R4): "Bends the left elbow against 6 kg at the hand". Education only, no diagnosis.
// Pose signs (joints.json, R3 §2b): flex + = flexion (ankle: + = foot up), abd + = out to the side, rot/pron + = turn
// inward / palm down, dev + = toward the thumb, inv + = sole inward, side/twist/turn + = toward the body's left. Pure.
import type { Balance, Reason } from './types';

const TRUNK = new Set(['lumbar', 'thoracic']);
const ARM = new Set(['shoulder', 'elbow', 'wrist']);
const LEG = new Set(['hip', 'knee', 'ankle']);
const PART: Record<string, string> = {
  lumbar: 'lower back', thoracic: 'upper back', neck: 'neck', head: 'head', shoulder: 'arm', elbow: 'elbow',
  wrist: 'wrist', hip: 'leg', knee: 'knee', ankle: 'foot',
};
// [+ phrase, − phrase]; {p} = "the left elbow" etc.
const VERB: Record<string, [string, string]> = {
  'shoulder.flex': ['Lifts {p} forward', 'Pulls {p} down and back'],
  'shoulder.abd': ['Lifts {p} out to the side', 'Pulls {p} in to the side'],
  'shoulder.rot': ['Turns {p} inward', 'Turns {p} outward'],
  'shoulder.hadd': ['Pulls {p} across the chest', 'Opens {p} out to the side'],
  'elbow.flex': ['Bends {p}', 'Straightens {p}'],
  'elbow.pron': ['Turns {p} palm down', 'Turns {p} palm up'],
  'wrist.flex': ['Bends {p} forward', 'Bends {p} back'],
  'wrist.dev': ['Tilts {p} toward the thumb', 'Tilts {p} toward the little finger'],
  'hip.flex': ['Lifts {p} forward', 'Pulls {p} back'],
  'hip.abd': ['Moves {p} out to the side', 'Pulls {p} in'],
  'hip.rot': ['Turns {p} inward', 'Turns {p} outward'],
  'knee.flex': ['Bends {p}', 'Straightens {p}'],
  'ankle.flex': ['Pulls {p} up', 'Points {p} down'],
  'ankle.inv': ['Turns the sole of {p} inward', 'Turns the sole of {p} outward'],
  'trunk.flex': ['Keeps the trunk from bending back', 'Keeps the trunk upright: the load pulls it forward'],
  'trunk.side': ['Bends the trunk to the left', 'Bends the trunk to the right'],
  'trunk.twist': ['Turns the trunk to the left', 'Turns the trunk to the right'],
  'neck.flex': ['Bends {p} forward', 'Holds {p} up'],
  'neck.side': ['Tilts {p} to the left', 'Tilts {p} to the right'],
  'neck.turn': ['Turns {p} to the left', 'Turns {p} to the right'],
};
const RULE: Record<string, string> = {
  scapula: 'Holds {s}shoulder blade steady under the arm',
  grip: 'Grips with {s}hand',
  bracing: 'Braces the trunk as the lower-back moment rises',
};

/** One reason as a sentence. `side` is the muscle's side; `loadKg` overrides the reason's own load. */
export function explain(reason: Reason, side: 'left' | 'right' | 'center', loadKg?: number): string {
  const own = side === 'center' ? 'each ' : `the ${side} `;
  if (reason.kind === 'rule') return RULE[reason.rule].replace('{s}', own);
  const m = /^(.*)_([lr])$/.exec(reason.joint);
  const base = m ? m[1] : reason.joint;
  const p = (m ? `the ${m[2] === 'l' ? 'left' : 'right'} ` : 'the ') + (PART[base] ?? base);
  const key = TRUNK.has(base) ? `trunk.${reason.axis}` : (base === 'head' ? 'neck' : base) + '.' + reason.axis;
  const v = VERB[key];
  if (!v) throw new Error(`explain: unknown joint axis ${reason.joint}.${reason.axis}`);
  const text = v[reason.dir === '+' ? 0 : 1].replace('{p}', p);
  const kg = loadKg ?? reason.loadKg;
  if (!kg || TRUNK.has(base)) return text;
  const where = ARM.has(base) ? ' at the hand' : LEG.has(base) ? ' at the foot' : '';
  return `${text} against ${+kg.toFixed(1)} kg${where}`;
}

/** Balance in words (§2b.13c): null when the centre of mass is over the support. */
export const explainBalance = (b: Balance): string | null => (b.comOverFeet ? null : 'The centre of mass is beyond the feet in this pose');
