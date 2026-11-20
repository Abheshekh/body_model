import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { effort, engineData } from '../engine/effort';
import { bodyGeometry } from '../engine/geometry';
import { solveSupports } from '../engine/statics';
import type { EffortResult, Sex } from '../engine/types';
import { PROTO_ROOT_Y } from '../rig/pose';
import type { EquipmentJson } from './equipment';
import { CANNOT_BALANCE, generateTask, stylesOf, type Generated, type TaskBuilderJson, type TaskSettings } from './taskgen';

const read = (f: string) => JSON.parse(readFileSync(`public/data/${f}`, 'utf8'));
const data = engineData({ rig: read('body/rig.json'), manifest: read('body/manifest.json'), segments: read('segments.json'), strengths: read('strengths.json'), actions: read('actions.json') });
const tables = { loads: read('loads.json'), supports: read('supports.json') };
const tb: TaskBuilderJson = read('taskbuilder.json');
const eq: EquipmentJson = read('equipment.json');
const SEXES: Sex[] = ['male', 'female'];
const TOL = 0.03;

const gen = (st: TaskSettings, sex: Sex) => generateTask(st, data, sex, tables, tb);
const ok = (r: ReturnType<typeof gen>): Generated => {
  if ('disabled' in r) throw new Error(`disabled: ${r.disabled}`);
  return r;
};
/** one action style × every object × every start (one start for actions without starts: it is ignored) */
const combos = (actionId: string, style: string): TaskSettings[] => {
  const a = tb.actions.find((x) => x.id === actionId)!;
  return tb.objects.flatMap((o) => (a.starts ? tb.starts : tb.starts.slice(0, 1))
    .map((s) => ({ object: o.id, kg: o.kg, start: s.id, action: a.id, style })));
};

describe('taskbuilder.json', () => {
  it('has sources, every style a source and keyframes, targets inside the keyframes, presets enabled', () => {
    expect(tb.sources.length).toBeGreaterThan(0);
    for (const a of tb.actions) {
      const styles = stylesOf(tb, a);
      expect(styles.length, a.id).toBeGreaterThanOrEqual(2);
      for (const st of styles) {
        expect(st.source.length, `${a.id}/${st.id}`).toBeGreaterThan(0);
        for (const k of a.target.keyframes) expect(k, `${a.id}/${st.id}`).toBeLessThan(a.from?.mode === 'hold' ? 1 : st.keyframes.length);
      }
      for (const o of a.objects) expect(tb.objects.some((x) => x.id === o), `${a.id}: ${o}`).toBe(true);
      for (const s of a.starts ?? []) expect(tb.starts.some((x) => x.id === s), `${a.id}: ${s}`).toBe(true);
    }
    expect(tb.presets.map((p) => p.id)).toEqual(['bucket', 'carry', 'mop', 'shelf', 'stairs']); // the 5 R4 tasks
    for (const p of tb.presets) for (const sex of SEXES) expect('disabled' in gen(p.settings, sex), p.id).toBe(false);
  });
  it('object grips are equipment.json grip points; every object has its loads (both hands, right hand) and supports listing', () => {
    for (const o of tb.objects) {
      if (o.model) {
        const item = eq.objects.find((i) => i.id === o.model);
        expect(item, o.id).toBeDefined();
        expect(o.grips, o.id).toEqual((item!.grip ?? []).map((g) => g.point));
      }
      if (o.id === 'none') continue;
      for (const p of [o.id, `${o.id}R`].slice(0, o.grip === 'edge' ? 1 : 2)) {
        expect(tables.loads.props[p], p).toBeDefined();
        expect(p in tables.supports.props || tables.supports.none.includes(p), p).toBe(true);
      }
    }
    for (const a of tb.actions) for (const st of a.styles) if (st.support) expect(tables.supports.props[st.support], st.support).toBeDefined();
  });
  it('loads.json notes the band simplification', () => {
    expect(tables.loads.note).toContain('band = elastic, modelled as a cable with force kg x g at the stretched keyframe (simplification)');
  });
});

describe('disabled combinations', () => {
  it('have a reason', () => {
    for (const st of [
      { object: 'none', kg: 0, start: 'floorFront', action: 'pick-up', style: 'stoop' },
      { object: 'box', kg: 10, start: 'floorFront', action: 'push', style: 'lean' },
      { object: 'box', kg: 10, start: 'floorFront', action: 'reach', style: 'both' },
      { object: 'box', kg: 10, start: 'floorFront', action: 'climb-step', style: 'upright' },
      { object: 'box', kg: 10, start: 'floorFront', action: 'carry', style: 'stoop' },
      { object: 'box', kg: 10, start: 'floorFront', action: 'fly', style: 'x' },
    ]) {
      const r = gen(st, 'male');
      expect('disabled' in r, JSON.stringify(st)).toBe(true);
      expect((r as { disabled: string }).disabled.length).toBeGreaterThan(10);
    }
  });
});

describe.each(SEXES)('every enabled combination (%s)', (sex) => {
  const skel = data.skel[sex];
  const s = skel.H[skel.names.indexOf('pelvis')][1] / PROTO_ROOT_Y;
  for (const a of tb.actions) for (const { id: styleId } of stylesOf(tb, a)) {
    it(`${a.id} / ${styleId}: reaches its target ± 3 cm; balance margin ≥ 0 or a warning; disabled ones have a reason`, () => {
      let enabled = 0;
      for (const st of combos(a.id, styleId)) {
        const r = gen(st, sex);
        const tag = `${sex} ${JSON.stringify(st)}`;
        if ('disabled' in r) {
          expect(r.disabled.length, tag).toBeGreaterThan(10);
          // a templated combination is only refused when the hands cannot reach the grip: a high grip on the shelf or
          // overhead, or a low grip in a style that keeps the trunk upright (squat: trunk ≤ 20°) or stands on one leg
          if (a.objects.includes(st.object) && (!a.starts || a.starts.includes(st.start))) {
            expect(r.disabled, tag).toMatch(/^Out of reach/);
            if (!['shelf', 'overhead'].includes(st.start)) expect(['squat', 'golfer'], tag).toContain(st.style);
          }
          continue;
        }
        enabled++;
        expect(a.objects, tag).toContain(st.object);
        const style = stylesOf(tb, a).find((x) => x.id === st.style)!;
        const o = tb.objects.find((x) => x.id === st.object)!, start = tb.starts.find((x) => x.id === st.start)!;
        const hands = style.hands === 'right' ? ['hand_r' as const] : ['hand_l' as const, 'hand_r' as const];
        expect(r.supports.length, tag).toBe(r.keyframes.length);
        r.keyframes.forEach((pose, k) => {
          const g = bodyGeometry(skel, pose, data.segments, 70, sex);
          const at = `${tag} keyframe ${k}`;
          if (a.target.keyframes.includes(k)) {
            const t = a.target;
            if (t.point === 'pelvis') expect(Math.abs(g.point('pelvis')[1] - t.height! * s), at).toBeLessThanOrEqual(TOL);
            if (t.point === 'foot_l') {
              expect(Math.abs(g.point('foot_l')[1] - t.height! * s), at).toBeLessThanOrEqual(TOL);
              const step = eq.objects.find((x) => x.id === 'step1')!, tread = step.surfaces[0];
              const z = g.point('foot_l')[2] / s - step.at[2];
              expect(Math.abs(z), `${at}: lead foot on the step1 tread (z ${z.toFixed(3)})`).toBeLessThanOrEqual(tread.extent[1]);
            }
            if (t.point === 'grip') {
              const ys = t.height !== undefined ? hands.map(() => t.height! * s)
                : style.hands === 'right' ? [(start.height + o.grips[o.grips.length - 1][1]) * s]
                  : hands.map((_, i) => (start.height + o.grips[Math.min(i, o.grips.length - 1)][1]) * s);
              hands.forEach((h, i) => {
                const p = g.point(h);
                expect(Math.abs(p[1] - ys[i]), `${at} ${h} y ${p[1].toFixed(3)} vs ${ys[i].toFixed(3)}`).toBeLessThanOrEqual(TOL);
                if (t.forward !== undefined) expect(Math.abs(p[2] - t.forward * s), `${at} ${h} z`).toBeLessThanOrEqual(TOL);
              });
            }
          }
          const m = solveSupports(g, r.loads, r.supports[k]).balance.margin;
          if (!(m >= 0)) expect(r.warnings, `${at}: margin ${m.toFixed(3)}`).toContain(CANNOT_BALANCE);
        });
      }
      expect(enabled, `${a.id} / ${styleId}`).toBeGreaterThan(0);
    });
  }
});

// R5 AC5 acceptance (SPEC §6): the generated tasks show the same shifts as the R4 cases
const level = (r: EffortResult, plain: string, side?: 'left' | 'right') => {
  const ps = data.parts.filter((p) => p.plain === plain && (!side || p.side === side));
  if (!ps.length) throw new Error(`no part "${plain}"`);
  return Math.max(...ps.map((p) => r.muscle[p.id]?.level ?? 0));
};
/** peak over the keyframes, each with its own supports (a carry steps from two feet onto one) */
const peak = (g: Generated, sex: Sex): EffortResult => {
  const rs = g.keyframes.map((pose, k) => effort({ pose, poseB: g.keyframes[(k + 1) % g.keyframes.length], sex, loads: g.loads, supports: g.supports[k] }, data));
  const ids = new Set(rs.flatMap((r) => Object.keys(r.muscle).map(Number)));
  return { ...rs[0], lowerBack: rs.reduce((a, r) => (r.lowerBack.momentNm > a.momentNm ? r.lowerBack : a), rs[0].lowerBack),
    muscle: Object.fromEntries([...ids].map((id) => [id, rs.reduce((a, r) => ((r.muscle[id]?.level ?? 0) > a.level ? r.muscle[id] : a), rs[0].muscle[id] ?? { level: 0, role: 'none', reasons: [] })])) };
};
const QUADS = ['Vastus lateralis muscle', 'Vastus medialis muscle', 'Vastus intermedius muscle', 'Rectus femoris muscle'];
const TRUNK_SIDE = ['External abdominal oblique muscle', 'Internal abdominal oblique muscle', 'Quadratus lumborum muscle', 'Gluteus medius muscle'];

it('the plain muscle names used below exist in actions.json and the manifest', () => {
  const acts = read('actions.json').muscles;
  for (const m of [...QUADS, ...TRUNK_SIDE]) {
    expect(acts[m], m).toBeDefined();
    expect(data.parts.some((p) => p.plain === m), m).toBe(true);
  }
});

describe.each(SEXES)('acceptance (%s)', (sex) => {
  it('pick up 10 kg (bucket from the floor), stoop vs squat: lower-back moment falls and quadriceps rise in the squat', () => {
    const pick = (style: string) => peak(ok(gen({ object: 'bucket', kg: 10, start: 'floorFront', action: 'pick-up', style }, sex)), sex);
    const stoop = pick('stoop'), squat = pick('squat');
    expect(squat.lowerBack.momentNm, `${squat.lowerBack.momentNm.toFixed(1)} vs ${stoop.lowerBack.momentNm.toFixed(1)} Nm`).toBeLessThan(stoop.lowerBack.momentNm);
    for (const m of QUADS) expect(level(squat, m), `${m}: ${level(squat, m).toFixed(3)} vs ${level(stoop, m).toFixed(3)}`).toBeGreaterThan(level(stoop, m));
  });
  it('carry 10 kg in the right hand vs 5 + 5: left obliques, quadratus lumborum, gluteus medius fall when split', () => {
    const carry = (style: string) => peak(ok(gen({ object: 'bag', kg: 10, start: 'floorFront', action: 'carry', style }, sex)), sex);
    const one = carry('one-hand'), both = carry('both');
    for (const m of TRUNK_SIDE) expect(level(both, m, 'left'), `${m} (left): ${level(both, m, 'left').toFixed(3)} vs ${level(one, m, 'left').toFixed(3)}`).toBeLessThan(level(one, m, 'left'));
  });
});
