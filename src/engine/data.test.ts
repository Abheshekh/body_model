import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const read = (f: string) => JSON.parse(readFileSync(`public/data/${f}`, 'utf8'));
const joints = read('joints.json').joints as Record<string, Record<string, unknown>>;
const segs = read('segments.json').segments as Record<string, { massFraction: number; comFraction: number; bones: string[]; source: string }>;
const str = read('strengths.json');
const loads = read('loads.json');
const sup = read('supports.json');
const rigBones = (read('body/rig.json').bones as { name: string }[]).map((b) => b.name);
const variants = [...read('exercises.json').exercises, ...read('tasks.json').tasks].flatMap((e) =>
  (e.variants as { props: string[]; proto: { a: { pin?: string } } }[]).map((v) => ({ ...v, key: `${e.id}/${(v as unknown as { id: string }).id}` })));

describe('segments.json', () => {
  it('mass fractions sum to 1', () => {
    const sum = Object.values(segs).reduce((a, s) => a + s.massFraction, 0);
    expect(Math.abs(sum - 1)).toBeLessThan(0.001);
  });
  it('every bone exists, COM fractions in 0..1, every segment has a source', () => {
    for (const s of Object.values(segs)) {
      expect(s.comFraction).toBeGreaterThan(0);
      expect(s.comFraction).toBeLessThan(1);
      expect(s.source.length).toBeGreaterThan(0);
      for (const b of s.bones) expect(rigBones).toContain(b);
    }
  });
});

describe('strengths.json', () => {
  it('every joint axis has + and - with a source (pelvis, scapula excluded; hadd allowed)', () => {
    const keys = new Set<string>();
    for (const [j, axes] of Object.entries(joints)) {
      if (j === 'pelvis' || j.startsWith('scapula')) continue;
      const k = j.replace(/_[lr]$/, '');
      keys.add(k);
      for (const a of Object.keys(axes)) {
        for (const d of ['+', '-']) {
          const e = str.strengths[k]?.[a]?.[d];
          expect(e, `${k}.${a}.${d}`).toBeGreaterThan(0);
        }
        expect(str.strengths[k][a].source.length).toBeGreaterThan(0);
      }
    }
    for (const k of Object.keys(str.strengths)) expect(keys.has(k), k).toBe(true);
    expect(str.strengths.shoulder.hadd['+']).toBeGreaterThan(0);
  });
  it('grip strength has a source', () => {
    expect(str.grip.NperKg).toBeGreaterThan(0);
    expect(str.grip.source).toContain('not verified');
  });
});

describe('props and pins', () => {
  it('every prop has a loads entry (or is listed none) and a supports entry (or is listed none)', () => {
    const props = new Set(variants.flatMap((v) => v.props));
    expect(props.size).toBe(20);
    for (const p of props) {
      expect(p in loads.props || loads.none.includes(p), `loads ${p}`).toBe(true);
      expect(p in sup.props || sup.none.includes(p), `supports ${p}`).toBe(true);
    }
  });
  it('every pin in use has supports; every contact is well formed', () => {
    for (const v of variants) expect((v.proto.a.pin ?? 'default') in sup.pins, `${v.key}: ${v.proto.a.pin}`).toBe(true); // no pin → default
    // §2b.12: no pin = default = flat (heel + ball, both feet); toes = balls only; toeL/toeR = heel + ball of that foot
    const pts = (k: string) => (sup.pins[k] as { point: string }[]).map((c) => c.point).sort();
    expect(pts('default')).toEqual(pts('flat'));
    expect(pts('default')).toEqual(['foot_l', 'foot_r', 'heel_l', 'heel_r']);
    expect(pts('toes')).toEqual(['foot_l', 'foot_r']);
    expect(pts('toeL')).toEqual(['foot_l', 'heel_l']);
    expect(pts('toeR')).toEqual(['foot_r', 'heel_r']);
    for (const c of [...Object.values(sup.pins), ...Object.values(sup.props)].flat() as { point: string; normal: number[] }[]) {
      expect(c.point.length).toBeGreaterThan(0);
      expect(c.normal.length).toBe(3);
    }
  });
  it('variantProps point at known supports props', () => {
    for (const ps of Object.values(sup.variantProps) as string[][]) for (const p of ps) expect(p in sup.props).toBe(true);
  });
  it('loads have kg > 0, a kind, and a direction where needed', () => {
    for (const l of Object.values(loads.props).flat() as { kind: string; kg: number; toward?: number[]; track?: number[] }[]) {
      expect(l.kg).toBeGreaterThan(0);
      if (l.kind === 'cable') expect(l.toward?.length).toBe(3);
      if (l.kind === 'machine') expect(l.track?.length).toBe(3);
    }
  });
});
