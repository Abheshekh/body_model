import { describe, expect, it } from 'vitest';
import type { EffortResult } from '../../engine/types';
import { LIMITS, levelWord, panelNotices, panelRows, topLine, type PanelCtx } from './effort-panel';

const ctx: PanelCtx = {
  sources: [],
  parts: new Map([[1, { plain: 'Biceps', side: 'left' }], [2, { plain: 'Biceps', side: 'right' }], [3, { plain: 'Glutes', side: 'center' }], [4, { plain: 'Brachialis', side: 'left' }]]),
};
const elbow = { kind: 'joint' as const, joint: 'elbow_l', axis: 'flex', dir: '+' as const, demand: 10 };
const res = (muscle: EffortResult['muscle']): EffortResult => ({ jointDemand: {}, muscle, lowerBack: { momentNm: 0, level: 0 }, balance: { comOverFeet: true, margin: 1 }, warnings: [] });

describe('panelRows', () => {
  it('collapses equal pairs, words the role, sorts with ties work > help', () => {
    const rows = panelRows(res({
      1: { level: 0.8, role: 'work', reasons: [elbow] }, 2: { level: 0.8, role: 'work', reasons: [elbow] },
      3: { level: 0.3, role: 'hold', reasons: [] }, 4: { level: 0.3, role: 'help', reasons: [] },
    }), ctx);
    expect(rows.map((r) => r.name)).toEqual(['Biceps (both sides)', 'Brachialis (left)', 'Glutes']);
    expect(rows[0].roleWords).toBe('does the work');
    expect(rows[0].reason).toContain('elbow');
  });
  it('keeps unequal pairs apart and caps at 8', () => {
    const muscle: EffortResult['muscle'] = { 1: { level: 0.5, role: 'work', reasons: [] }, 2: { level: 0.4, role: 'work', reasons: [] } };
    expect(panelRows(res(muscle), ctx).map((r) => r.name)).toEqual(['Biceps (left)', 'Biceps (right)']);
    const parts = new Map(Array.from({ length: 12 }, (_, i) => [i, { plain: 'm' + i, side: 'center' as const }]));
    const many = Object.fromEntries(Array.from({ length: 12 }, (_, i) => [i, { level: 0.1 + i / 20, role: 'help' as const, reasons: [] }]));
    expect(panelRows(res(many), { parts, sources: [] })).toHaveLength(8);
  });
  it('top line: three names, or none', () => {
    const muscle: EffortResult['muscle'] = { 1: { level: 0.8, role: 'work', reasons: [] }, 2: { level: 0.8, role: 'work', reasons: [] },
      3: { level: 0.5, role: 'hold', reasons: [] }, 4: { level: 0.4, role: 'help', reasons: [] } };
    expect(topLine(res(muscle), ctx)).toBe('Most effort: Biceps (both sides), Glutes, Brachialis (left)');
    expect(topLine(res({}), ctx)).toBe('No muscle effort in this pose');
  });
  it('notices: warnings shown; no support (margin -Infinity) replaces the balance line', () => {
    const off = { ...res({}), balance: { comOverFeet: false, margin: -0.09 } };
    expect(panelNotices(off)).toEqual(['The centre of mass is beyond the feet in this pose']);
    const none = { ...res({}), balance: { comOverFeet: false, margin: -Infinity }, warnings: ['No support: torques come from gravity and loads only.'] };
    expect(panelNotices(none)).toEqual(['No support: torques come from gravity and loads only.']);
    expect(panelNotices(res({}))).toEqual([]);
  });
  it('limits name the level words as the app\'s own scale', () => expect(LIMITS).toContain("this app's own scale (not a clinical measure)"));
  it('level words', () => expect([0.1, 0.5, 0.9].map(levelWord)).toEqual(['light', 'moderate', 'strong']));
});
