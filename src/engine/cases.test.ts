// SPEC §4 must-pass cases, as direction-of-change checks on both bodies. Built from the real exercise/task variants
// (exercises.json, tasks.json), their props and pins through the data tables; supports are never special-cased.
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
interface Variant { id: string; props: string[]; proto: { a: ProtoPose; b: ProtoPose } }
const all: { id: string; variants: Variant[] }[] = [...read('exercises.json').exercises, ...read('tasks.json').tasks];

function variant(ex: string, id: string, kg: Record<string, number>, sex: Sex) {
  const v = all.find((x) => x.id === ex)!.variants.find((x) => x.id === id)!;
  const a = fromPrototype(v.proto.a), b = fromPrototype(v.proto.b);
  return { a, b, input: { sex, ...setupVariant(ex, id, v.props, v.proto.a.pin as string | undefined, tables, kg) } };
}
/** peak over the movement a → b, as the player shows it */
const move = (ex: string, id: string, sex: Sex, kg: Record<string, number> = {}) => {
  const { a, b, input } = variant(ex, id, kg, sex);
  return effortOverMove(a, b, input, data);
};
/** one keyframe */
const at = (ex: string, id: string, k: 'a' | 'b', sex: Sex) => {
  const { a, b, input } = variant(ex, id, {}, sex);
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
    const stand = move('curl', 'stand', sex), seat = move('curl', 'seat', sex, { dbL: 10, dbR: 10 }); // same 20 kg
    for (const m of ELBOW_FLEXORS) expect(Math.abs(level(stand, m) - level(seat, m)), m).toBeLessThanOrEqual(0.05 * level(stand, m));
    for (const m of ['Gluteus maximus muscle', 'Soleus muscle', 'Medial head of gastrocnemius']) more(stand, seat, m);
    // a pad behind the back can only push the trunk forward, as the bar in front does: it cannot lower the moment
    for (const m of ERECTORS) expect(Math.abs(level(stand, m) - level(seat, m)), m).toBeLessThanOrEqual(0.1 * level(stand, m));
    // leaned back 10°: the moment falls ≥ 10%
    const v = all.find((x) => x.id === 'curl')!.variants.find((x) => x.id === 'seat')!;
    const lean = (k: ProtoPose) => fromPrototype({ ...k, root: { ...(k.root as object), pitch: -10 } });
    const { input } = variant('curl', 'seat', { dbL: 10, dbR: 10 }, sex);
    const leaned = effortOverMove(lean(v.proto.a), lean(v.proto.b), input, data);
    expect(leaned.lowerBack.momentNm, `${leaned.lowerBack.momentNm.toFixed(1)} vs ${seat.lowerBack.momentNm.toFixed(1)} Nm`)
      .toBeLessThanOrEqual(0.9 * seat.lowerBack.momentNm);
  });

  it('2. pick up 10 kg, stoop vs squat: lower-back moment falls and quadriceps rise in the squat; stoop higher on hamstrings and erectors; squat glutes ≥ 90% of stoop (§2b.13b)', () => {
    const stoop = move('bucket', 'stoop', sex), squat = move('bucket', 'squat', sex);
    expect(stoop.lowerBack.momentNm).toBeGreaterThan(squat.lowerBack.momentNm);
    for (const m of ['Semitendinosus muscle', 'Long head of biceps femoris', ...ERECTORS]) more(stoop, squat, m);
    for (const m of ['Vastus lateralis muscle', 'Rectus femoris muscle']) more(squat, stoop, m);
    const glute = 'Gluteus maximus muscle';
    expect(level(squat, glute), `${level(squat, glute).toFixed(3)} vs ${level(stoop, glute).toFixed(3)}`).toBeGreaterThanOrEqual(0.9 * level(stoop, glute));
    // §2b.13c: balance is reported (these keyframes put the COM beyond the feet), not asserted
    for (const r of [stoop, squat]) expect(typeof r.balance.comOverFeet).toBe('boolean');
  });

  it('3. carry 10 kg in one hand vs 5 kg in each: opposite obliques, quadratus lumborum, gluteus medius fall when split', () => {
    const one = move('carry', 'one', sex, { bagR: 10 }), both = move('carry', 'both', sex); // bag in the right hand
    for (const m of ['External abdominal oblique muscle', 'Internal abdominal oblique muscle', 'Quadratus lumborum muscle']) more(one, both, m, 'left');
    more(one, both, 'Gluteus medius muscle');
  });

  it('4. push-up vs bench press: same pressing muscles; push-up adds abdominals and hip flexors', () => {
    const push = move('press', 'pushup', sex), bench = move('press', 'bench', sex);
    for (const r of [push, bench])
      for (const m of PRESS) {
        expect(level(r, m), m).toBeGreaterThan(0);
        expect(data.parts.filter((p) => p.plain === m).some((p) => r.muscle[p.id].role === 'work'), m).toBe(true);
      }
    for (const m of ['Rectus abdominis muscle', 'External abdominal oblique muscle', 'Psoas major', 'Iliacus muscle', 'Rectus femoris muscle']) more(push, bench, m);
  });

  it('5. pull-up hang: finger flexors high; lats and elbow flexors rise as the elbows bend', () => {
    const hang = at('pull', 'pullup', 'a', sex), bent = at('pull', 'pullup', 'b', sex);
    for (const r of [hang, bent]) expect(level(r, 'Flexor digitorum profundus')).toBeGreaterThanOrEqual(0.7);
    for (const m of ['Latissimus dorsi muscle', 'Teres major muscle', 'Long head of biceps brachii', 'Brachialis muscle']) more(bent, hang, m);
  });

  it('6. plank: no joint moves; everything shown is a stabiliser', () => {
    const { a, b, input } = variant('plank', 'front', {}, sex);
    expect(movedJoints(a, b).size).toBe(0);
    const r = effortOverMove(a, b, input, data);
    const shown = Object.values(r.muscle).filter((m) => m.level > 0);
    expect(shown.length).toBeGreaterThan(0);
    expect(new Set(shown.map((m) => m.role))).toEqual(new Set(['hold']));
    expect(level(r, 'Rectus abdominis muscle')).toBeGreaterThan(0);
  });
});
