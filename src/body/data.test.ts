import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Part } from './model';

const read = (f: string) => JSON.parse(readFileSync(`public/data/${f}`, 'utf8'));
const parts: Part[] = read('parts.json').parts;
const FORBIDDEN = /artery|\bvein|nerve|brain|cerebr|gyrus|ventricle|thalam|hippocamp|amygdal|putamen|\bpons\b|medulla|colliculus|fornix|tooth|hair|valve|papillary|lung/;

describe('parts.json', () => {
  it('has the required fields on every part', () => {
    for (const p of parts) {
      expect(p.id).toBeTruthy();
      expect(p.name).toBeTruthy();
      expect(p.plainName).toBeTruthy();
      expect(p.kind).toBeTruthy();
      expect(p.side).toBeTruthy();
      expect(p.muscleKey).toBeNull();
      expect(p.center).toHaveLength(3);
    }
  });
  it('sets layer iff muscle or tendon', () => {
    for (const p of parts) {
      expect(p.layer !== null).toBe(p.kind === 'muscle' || p.kind === 'tendon');
    }
  });
  it('has enough muscles and bones', () => {
    expect(parts.filter((p) => p.kind === 'muscle').length).toBeGreaterThanOrEqual(340);
    expect(parts.filter((p) => p.kind === 'bone').length).toBeGreaterThanOrEqual(190);
  });
  it('has no forbidden parts', () => {
    expect(parts.filter((p) => FORBIDDEN.test(p.name))).toEqual([]);
  });
  it('carries sources', () => {
    expect(read('parts.json').sources.length).toBeGreaterThan(0);
  });
});

describe('credits.json', () => {
  it('carries sources and the licence text', () => {
    const c = read('credits.json');
    expect(c.sources.length).toBeGreaterThan(0);
    expect(c.items[0].text).toContain('BodyParts3D');
  });
});
