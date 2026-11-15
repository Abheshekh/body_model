import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { partIdsByName, type Part } from '../body/model';
import type { Program, ProgramsFile } from './programs';

// Read lazily so a missing file fails every test, not the whole module.
const read = (f: string) => JSON.parse(readFileSync(`public/data/${f}`, 'utf8'));
const load = (): ProgramsFile => read('programs.json');
const get = (id: string): Program => {
  const p = load().programs.find((x) => x.id === id);
  if (!p) throw new Error(`program ${id} missing in programs.json`);
  return p;
};
const parts = (): Part[] => read('parts.json').parts;

const PELVIC = ['pubococcygeus', 'puborectalis', 'iliococcygeus', 'coccygeus', 'external anal sphincter'];
const IDS = ['posture-correction', 'anterior-pelvic-tilt', 'pelvic-floor', 'sexual-health-male', 'sexual-health-female'];
const LABELS = ['strong', 'moderate', 'weak', 'convention'];
const FORBIDDEN = /jelq|enlarg|lengthen the penis|supplement|stop(ping)? (the )?(urine|flow)/i;

describe('programs.json', () => {
  it('has the five program ids', () => {
    expect(load().programs.map((p) => p.id).sort()).toEqual([...IDS].sort());
  });
  it('resolves the five pelvic-floor names', () => {
    load(); // the file must exist before the names are checked
    const r = partIdsByName(parts(), PELVIC);
    expect(r.missing).toEqual([]);
    expect(r.ids.length).toBeGreaterThanOrEqual(5);
  });
  it('resolves every target name', () => {
    const ps = parts();
    for (const p of load().programs)
      for (const i of p.items) expect(partIdsByName(ps, i.targets.parts).missing, `${p.id}/${i.id}`).toEqual([]);
  });
  it('pelvic-floor items use record targets with the five names', () => {
    for (const i of get('pelvic-floor').items) {
      expect(i.targets.from).toBe('record');
      expect(i.targets.provisional).toBe(false);
      expect([...i.targets.parts].sort()).toEqual([...PELVIC].sort());
    }
  });
  it('provisional flag follows from', () => {
    for (const p of load().programs)
      for (const i of p.items) {
        if (p.id === 'pelvic-floor') continue;
        if (i.targets.from === 'provisional') expect(i.targets.provisional, `${p.id}/${i.id}`).toBe(true);
        else expect(i.targets.parts.length).toBeGreaterThan(0);
        expect(['record', 'provisional']).toContain(i.targets.from);
      }
  });
  it('claims have a label and a source title', () => {
    for (const p of load().programs)
      for (const c of p.evidence) {
        expect(LABELS).toContain(c.strength);
        expect(c.source.title).toBeTruthy();
      }
  });
  it('non-convention claims have an https url, convention claims have null', () => {
    for (const p of load().programs)
      for (const c of p.evidence) {
        if (c.strength === 'convention') expect(c.source.url).toBeNull();
        else expect(c.source.url).toMatch(/^https:\/\//);
      }
  });
  it('every program has a convention claim with null url', () => {
    for (const p of load().programs)
      expect(p.evidence.some((c) => c.strength === 'convention' && c.source.url === null), p.id).toBe(true);
  });
  it('non-null doses have a source url', () => {
    for (const p of load().programs)
      for (const i of p.items) if (i.dose) expect(i.dose.source.url).toMatch(/^https:\/\//);
  });
  it('adultOnly only on the two sexual-health programs', () => {
    for (const p of load().programs)
      expect(p.adultOnly, p.id).toBe(p.id === 'sexual-health-male' || p.id === 'sexual-health-female');
  });
  it('male program has the not-in-model note', () => {
    expect(get('sexual-health-male').notes.some((n) => n.includes('not in this anatomy model'))).toBe(true);
  });
  it('female and pelvic-floor programs have the male-anatomy note', () => {
    for (const id of ['sexual-health-female', 'pelvic-floor'])
      expect(get(id).notes).toContain('The body shown is male anatomy.');
  });
  it('items are not animated and cite claims from their own program', () => {
    for (const p of load().programs) {
      const ids = new Set(p.evidence.map((c) => c.id));
      for (const i of p.items) {
        expect(i.animated).toBe(false);
        expect(i.evidence.length, `${p.id}/${i.id}`).toBeGreaterThanOrEqual(1);
        for (const e of i.evidence) expect(ids.has(e), `${p.id}/${i.id}/${e}`).toBe(true);
      }
    }
  });
  it('has no forbidden words outside cautions', () => {
    const f = load();
    const stripped = { ...f, programs: f.programs.map((p) => ({ ...p, cautions: [] })) };
    expect(JSON.stringify(stripped)).not.toMatch(FORBIDDEN);
  });
});
