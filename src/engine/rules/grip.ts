// Grip rule (PLAN R3). level = hand force / (grip strength x body mass), clamped 0..1. Grip strength is
// 5 N/kg per hand (strengths.json `grip`; a start value, not a measurement). Finger and wrist flexors do
// the squeeze; the extensors co-contract at 0.5 to hold the wrist. Same on both sides.
const clamp = (x: number) => Math.min(1, Math.max(0, x));

export const GRIP_N_PER_KG = 5;

const FLEXORS = [
  'Flexor digitorum profundus', 'Flexor pollicis longus', 'Humero-ulnar head of flexor digitorum superficialis',
  'Radial head of flexor digitorum superficialis', 'Flexor carpi radialis', 'Humeral head of flexor carpi ulnaris',
  'Ulnar head of flexor carpi ulnaris', 'Palmaris longus muscle',
];
const EXTENSORS = [
  'Extensor digitorum', 'Extensor carpi radialis brevis', 'Extensor carpi radialis longus',
  'Humeral head of extensor carpi ulnaris', 'Ulnar head of extensor carpi ulnaris',
];

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- side kept for the plan signature
export function gripRule(handForceN: number, massKg: number, _side: 'left' | 'right' | 'center' = 'center'): Record<string, number> {
  if (!(massKg > 0)) throw new Error(`gripRule: massKg must be > 0, got ${massKg}`);
  const level = clamp(handForceN / (GRIP_N_PER_KG * massKg));
  if (level === 0) return {};
  return Object.fromEntries([...FLEXORS.map((m) => [m, level]), ...EXTENSORS.map((m) => [m, 0.5 * level])]);
}
