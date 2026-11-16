// Scapular stabiliser rule (PLAN R3). Arm elevation and hand load both ask the scapular muscles to hold the
// shoulder blade: elevation weights the upward-rotators (serratus, upper/lower trapezius), load weights the
// suspensors (descending trapezius, levator, rhomboids). level = clamp(a*elevation + b*load), 0 at rest.
// All weights and the 150 deg / 300 N scales are start values, not measurements. Same on both sides.
const clamp = (x: number) => Math.min(1, Math.max(0, x));

const ELEV_DEG = 150;
const LOAD_N = 300;
// [elevation weight, load weight] per muscle plain name
const W: Record<string, [number, number]> = {
  'Serratus anterior muscle': [0.8, 0.3],
  'Ascending part of trapezius muscle': [0.5, 0.2],
  'Transverse part of trapezius muscle': [0.3, 0.4],
  'Descending part of trapezius muscle': [0.2, 0.7],
  'Levator scapulae': [0.1, 0.7],
  'Rhomboid major muscle': [0.2, 0.5],
  'Rhomboid minor muscle': [0.2, 0.5],
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- side kept for the plan signature
export function scapulaRule(elevationDeg: number, handLoadN: number, _side: 'left' | 'right' | 'center' = 'center'): Record<string, number> {
  const e = clamp(elevationDeg / ELEV_DEG);
  const l = clamp(handLoadN / LOAD_N);
  if (e === 0 && l === 0) return {};
  return Object.fromEntries(Object.entries(W).map(([m, [a, b]]) => [m, clamp(a * e + b * l)]));
}
