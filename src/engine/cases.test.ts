// SPEC §4 must-pass cases, as direction-of-change checks on both bodies. Built from the real exercise records
// (exercises.json v2; the task cases are in taskgen.test.ts), their props and pins through the data tables; supports are never special-cased.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fromPrototype, type ProtoPose } from '../rig/pose';
import { effort, effortOverMove, engineData } from './effort';
import { movedJoints } from './roles';
import { setupVariant } from './setup';
import type { EffortResult, Sex } from './types';

const read = (f: string) => JSON.parse(readFileSync(`public/data/${f}`, 'utf8'));
const data = engineData({ rig: read('body/rig.json'), manifest: read('body/manifest.json'), segments: read('segments.json'), strengths: read('strengths.json'), actions: read('actions.json') });
const tables = { loads: read('loads.json'), supports: read('supports.json') };
/** key = exercise record id */
interface Variant { key: string; props: string[]; a: ProtoPose; b: ProtoPose }
const all: Variant[] = [
  ...(read('exercises.json').exercises as { id: string; props: string[]; keyframes: ProtoPose[] }[])
    .map((e) => ({ key: e.id, props: e.props, a: e.keyframes[0], b: e.keyframes[1] })),
];

function variant(key: string, kg: Record<string, number>, sex: Sex) {
  const v = all.find((x) => x.key === key)!;
  const a = fromPrototype(v.a), b = fromPrototype(v.b);
  return { a, b, input: { sex, ...setupVariant(key, v.props, v.a.pin as string | undefined, tables, kg) } };
}
/** peak over the movement a → b, as the player shows it */
const move = (key: string, sex: Sex, kg: Record<string, number> = {}) => {
  const { a, b, input } = variant(key, kg, sex);
  return effortOverMove(a, b, input, data);
};
/** one keyframe */
const at = (key: string, k: 'a' | 'b', sex: Sex) => {
  const { a, b, input } = variant(key, {}, sex);
  return effort({ ...input, pose: k === 'a' ? a : b, poseB: k === 'a' ? b : a }, data);
};
const level = (r: EffortResult, plain: string, side?: 'left' | 'right') => {
  const ps = data.parts.filter((p) => p.plain === plain && (!side || p.side === side));
  if (!ps.length) throw new Error(`no part "${plain}"`);
  return Math.max(...ps.map((p) => r.muscle[p.id]?.level ?? 0));
};
const more = (hi: EffortResult, lo: EffortResult, plain: string, side?: 'left' | 'right') =>
  expect(level(hi, plain, side), `${plain}${side ? ` (${side})` : ''}: ${level(hi, plain, side).toFixed(3)} vs ${level(lo, plain, side).toFixed(3)}`)
    .toBeGreaterThan(level(lo, plain, side));

const ELBOW_FLEXORS = ['Long head of biceps brachii', 'Short head of biceps brachii', 'Brachialis muscle', 'Brachioradialis muscle'];
const ERECTORS = ['Iliocostalis lumborum muscle', 'Longissimus thoracis muscle'];
const PRESS = ['Sternocostal head of pectoralis major muscle', 'Clavicular head of pectoralis major muscle', 'Clavicular part of deltoid muscle',
  'Long head of triceps brachii', 'Lateral head of triceps brachii'];

describe.each(['male', 'female'] as Sex[])('SPEC §4 must-pass cases (%s)', (sex) => {
  it('1. barbell curl standing vs seated with back pad: same elbow flexors; standing adds glutes and calves; erectors within 10% (§2b.13a)', () => {
    const stand = move('barbell-curl', sex), seat = move('seated-dumbbell-curl', sex, { dbL: 10, dbR: 10 }); // same 20 kg
    for (const m of ELBOW_FLEXORS) expect(Math.abs(level(stand, m) - level(seat, m)), m).toBeLessThanOrEqual(0.05 * level(stand, m));
    for (const m of ['Gluteus maximus muscle', 'Soleus muscle', 'Medial head of gastrocnemius']) more(stand, seat, m);
    // a pad behind the back can only push the trunk forward, as the bar in front does: it cannot lower the moment
    for (const m of ERECTORS) expect(Math.abs(level(stand, m) - level(seat, m)), m).toBeLessThanOrEqual(0.1 * level(stand, m));
    // leaned back 10°: the moment falls ≥ 10%
    const v = all.find((x) => x.key === 'seated-dumbbell-curl')!;
    const lean = (k: ProtoPose) => fromPrototype({ ...k, root: { ...(k.root as object), pitch: -10 } });
    const { input } = variant('seated-dumbbell-curl', { dbL: 10, dbR: 10 }, sex);
    const leaned = effortOverMove(lean(v.a), lean(v.b), input, data);
    expect(leaned.lowerBack.momentNm, `${leaned.lowerBack.momentNm.toFixed(1)} vs ${seat.lowerBack.momentNm.toFixed(1)} Nm`)
      .toBeLessThanOrEqual(0.9 * seat.lowerBack.momentNm);
  });

  it('4. push-up vs bench press: same pressing muscles; push-up adds abdominals and hip flexors', () => {
    const push = move('push-up', sex), bench = move('bench-press', sex);
    for (const r of [push, bench])
      for (const m of PRESS) {
        expect(level(r, m), m).toBeGreaterThan(0);
        expect(data.parts.filter((p) => p.plain === m).some((p) => r.muscle[p.id].role === 'work'), m).toBe(true);
      }
    for (const m of ['Rectus abdominis muscle', 'External abdominal oblique muscle', 'Psoas major', 'Iliacus muscle', 'Rectus femoris muscle']) more(push, bench, m);
  });

  it('5. pull-up hang: finger flexors high; lats and elbow flexors rise as the elbows bend', () => {
    const hang = at('pull-up', 'a', sex), bent = at('pull-up', 'b', sex);
    for (const r of [hang, bent]) expect(level(r, 'Flexor digitorum profundus')).toBeGreaterThanOrEqual(0.7);
    for (const m of ['Latissimus dorsi muscle', 'Teres major muscle', 'Long head of biceps brachii', 'Brachialis muscle']) more(bent, hang, m);
  });

  it('6. plank: no joint moves; everything shown is a stabiliser', () => {
    const { a, b, input } = variant('plank', {}, sex);
    expect(movedJoints(a, b).size).toBe(0);
    const r = effortOverMove(a, b, input, data);
    const shown = Object.values(r.muscle).filter((m) => m.level > 0);
    expect(shown.length).toBeGreaterThan(0);
    expect(new Set(shown.map((m) => m.role))).toEqual(new Set(['hold']));
    expect(level(r, 'Rectus abdominis muscle')).toBeGreaterThan(0);
  });
});
