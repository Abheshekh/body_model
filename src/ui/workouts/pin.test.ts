// Regression (T6b fix): the player's supports come from the prototype's own pin (none → pins.default, flat feet),
// never from fromPrototype's grounding default ('toes').
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { effortOverMove, engineData } from '../../engine/effort';
import { setupVariant, supportPin } from '../../engine/setup';
import { fromPrototype, type ProtoPose } from '../../rig/pose';

const read = (f: string) => JSON.parse(readFileSync(`public/data/${f}`, 'utf8'));
const tables = { loads: read('loads.json'), supports: read('supports.json') };
// key = exercise record id (exercises.json v2)
type V = { key: string; props: string[]; a: ProtoPose; b: ProtoPose };
const all: V[] = [
  ...(read('exercises.json').exercises as { id: string; props: string[]; keyframes: ProtoPose[] }[])
    .map((e) => ({ key: e.id, props: e.props, a: e.keyframes[0], b: e.keyframes[1] })),
];

describe('player supports pin', () => {
  for (const v of all) {
    it(`${v.key}: supports from the raw prototype pin`, () => {
      const raw = v.a.pin as string | undefined;
      expect(supportPin(v.a)).toBe(raw);
      const pins = tables.supports.pins[raw ?? 'default'];
      const { supports } = setupVariant(v.key, v.props, supportPin(v.a), tables);
      for (const s of pins) expect(supports).toContainEqual(s);
    });
  }
  it('a standing variant without a pin gets flat feet, not toes', () => {
    expect(tables.supports.pins.default).not.toEqual(tables.supports.pins.toes);
  });

  const data = engineData({ rig: read('body/rig.json'), manifest: read('body/manifest.json'), segments: read('segments.json'), strengths: read('strengths.json'), actions: read('actions.json') });
  const curl = all.find((v) => v.key === 'barbell-curl')!;
  for (const sex of ['male', 'female'] as const) {
    it(`barbell-curl (${sex}): centre of mass over the feet`, () => {
      const input = { sex, ...setupVariant('barbell-curl', curl.props, supportPin(curl.a), tables) };
      expect(effortOverMove(fromPrototype(curl.a), fromPrototype(curl.b), input, data).balance.comOverFeet).toBe(true);
    });
  }
});
