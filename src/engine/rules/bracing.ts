// Bracing rule (PLAN R3). Trunk muscles co-contract to stiffen the spine against the lumbar moment:
// level = lumbar moment / lumbar strength, clamped 0..1. Transversus and the obliques brace most, rectus
// abdominis less. The 1.0 / 0.8 / 0.6 shares are start values, not measurements.
const clamp = (x: number) => Math.min(1, Math.max(0, x));

const SHARE: Record<string, number> = {
  'Transversus abdominis muscle': 1,
  'Internal abdominal oblique muscle': 0.8,
  'External abdominal oblique muscle': 0.8,
  'Rectus abdominis muscle': 0.6,
};

export function bracingRule(lumbarMomentNm: number, lumbarStrengthNm: number): Record<string, number> {
  if (!(lumbarStrengthNm > 0)) throw new Error(`bracingRule: lumbarStrengthNm must be > 0, got ${lumbarStrengthNm}`);
  const level = clamp(Math.abs(lumbarMomentNm) / lumbarStrengthNm);
  if (level === 0) return {};
  return Object.fromEntries(Object.entries(SHARE).map(([m, s]) => [m, s * level]));
}
