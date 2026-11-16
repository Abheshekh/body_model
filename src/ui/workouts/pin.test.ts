// Regression (T6b fix): the player's supports come from the prototype's own pin (none → pins.default, flat feet),
// never from fromPrototype's grounding default ('toes').
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { effortOverMove, engineData } from '../../engine/effort';
import { setupVariant, supportPin } from '../../engine/setup';
import { fromPrototype, type ProtoPose } from '../../rig/pose';

const read = (f: string) => JSON.parse(readFileSync(`public/data/${f}`, 'utf8'));
const tables = { loads: read('loads.json'), supports: read('supports.json') };
type V = { id: string; props: string[]; proto: { a: ProtoPose; b: ProtoPose } };
const all: { id: string; variants: V[] }[] = [...read('exercises.json').exercises, ...read('tasks.json').tasks];

describe('player supports pin', () => {
  for (const e of all) for (const v of e.variants) {
    it(`${e.id}/${v.id}: supports from the raw prototype pin`, () => {
      const raw = v.proto.a.pin as string | undefined;
      expect(supportPin(v.proto.a)).toBe(raw);
      const pins = tables.supports.pins[raw ?? 'default'];
      const { supports } = setupVariant(e.id, v.id, v.props, supportPin(v.proto.a), tables);
      for (const s of pins) expect(supports).toContainEqual(s);
    });
  }
  it('a standing variant without a pin gets flat feet, not toes', () => {
    expect(tables.supports.pins.default).not.toEqual(tables.supports.pins.toes);
  });

  const data = engineData({ rig: read('body/rig.json'), manifest: read('body/manifest.json'), segments: read('segments.json'), strengths: read('strengths.json'), actions: read('actions.json') });
  const curl = all.find((e) => e.id === 'curl')!.variants.find((v) => v.id === 'stand')!;
  for (const sex of ['male', 'female'] as const) {
    it(`curl/stand (${sex}): centre of mass over the feet`, () => {
      const input = { sex, ...setupVariant('curl', 'stand', curl.props, supportPin(curl.proto.a), tables) };
      expect(effortOverMove(fromPrototype(curl.proto.a), fromPrototype(curl.proto.b), input, data).balance.comOverFeet).toBe(true);
    });
  }
});
