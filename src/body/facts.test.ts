import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const facts = JSON.parse(readFileSync('public/data/facts.json', 'utf8'));
const manifest = JSON.parse(readFileSync('public/data/body/manifest.json', 'utf8'));
const plain = new Set<string>(manifest.parts.map((p: { plain: string }) => p.plain));

describe('facts.json', () => {
  const keys = Object.keys(facts.facts);
  it('has at least 100 parts and a sources field', () => {
    expect(keys.length).toBeGreaterThanOrEqual(100);
    expect(facts.sources.length).toBeGreaterThan(0);
  });
  it('every key is a manifest plain name', () => {
    expect(keys.filter((k) => !plain.has(k))).toEqual([]);
  });
  it('every part has 2 to 4 facts, each with an openstax https url', () => {
    for (const k of keys) {
      const list = facts.facts[k];
      expect(list.length, k).toBeGreaterThanOrEqual(2);
      expect(list.length, k).toBeLessThanOrEqual(4);
      for (const f of list) {
        expect(f.text.length, k).toBeGreaterThan(0);
        expect(f.source.title.length, k).toBeGreaterThan(0);
        expect(f.source.url, k).toMatch(/^https:\/\/openstax\.org\//);
      }
    }
  });
});
