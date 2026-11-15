# r3-rig-move: summary

## What was built
- Rig: the fitted MakeHuman game skeleton per sex (pivots snapped to the anatomy joint centres), smooth per-vertex weights in an on-demand pack (315,884 bytes gz), rigid bones and organs; first load unchanged (9,279,138 bytes gz).
- App: forward kinematics and GPU skinning matching the numpy reference within 1 mm; two-bone IK; sourced joint limits (AAOS 1965 averages).
- Move screen: joint handles, drag within limits, sliders and typed angles, IK squat with planted feet, camera, undo/redo/reset, keyframes saved on the device.
- Content: the prototype's 11 exercises and 5 chores (33 variants) play on both sexes with props and provisional muscle roles.

## Tasks
| Task | Done |
|---|---|
| T1, T2, T2b, T3, T4b, T5, T6, T7, T8, T9, T10 | yes |
| T4 (acceptance thresholds) | no — AC1 not met for 7 of 10 poses (see R3.md) |

## Tests
| | Pass | Fail |
|---|---|---|
| Baseline npm test / pipeline | 91 / 50 | 0 |
| Now npm test / pipeline unit | 207 / 70 | 0 |
| Acceptance (tear/flip) | elbow90, abd90, trunk45 | the other 7 poses |

## Deviations
See the Changelog: critic §2b (Euler order, signs, zero frames, pins, chains), fix round 1 (full-length gradient), rigid fallback measured and rejected (worse in 19/20 runs), fitted zero for axial bones and clavicle, ankle adjustments to the 20° limit, toe pins, review fixes W-1..W-7 (pull-up grounding most important). Planned without a review stop until the user asked to stop; summary written by main.

## Left for the user
- Review the pose screenshots (docs/reports/r3/) and try Move and the exercises on your phone.
- Decide how far to take skinning quality (scapula bone, dual-quaternion or corrective skinning) before or after R4.
