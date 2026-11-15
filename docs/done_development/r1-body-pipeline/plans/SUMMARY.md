# r1-body-pipeline: summary

## What was built
- A tested pipeline in `tools/pipeline/v5/` that builds the male and female bodies from Z-Anatomy (CC BY-SA 4.0) and MakeHuman (CC0): export (bpy), MakeHuman, geometry and fibre field, pose and warp field, female anatomy and sex parts, names, depth layers, per-layer AO, packs.
- `public/data/body/`: 9 packs (one per kind) plus manifest.json and credits.json. 2,649 parts. First-load gz 9,276,312 bytes (budget 10,000,000). Male 1.71 m, female 1.567 m.
- 10 contact sheets (2 sexes × 5 depths × 8 views) and docs/reports/R1.md.
- The app is unchanged; R2 switches to the new data.

## Tasks
| Task | Done | Notes |
|---|---|---|
| T1 env + fetch | yes | bpy 5.3.0; Z-Anatomy 0c86264, MPFB2 9de0707 |
| T2 export | yes | 321.6 s; muscle ratio raised to 0.25 to match the sample |
| T3 MakeHuman | yes | |
| T4 geometry | yes | |
| T5 pose | yes | two-pass scale to 1.71 m, feet on the floor |
| T6 layers + AO | yes | |
| T7 sex parts + names | yes | |
| T8 pack + run | yes | three real-data bugs fixed |
| T9 output tests | yes | |
| T10 contact sheets | yes | |
| T11 report | yes | |

## Tests
| | Pass | Fail |
|---|---|---|
| Baseline (npm test / M1 pipeline) | 84 / 21 | 0 |
| Now (npm test / v5 pipeline / tester rows) | 84 / 50 / 15 of 15 | 0 |

## Deviations from the plan
See PLAN.md Changelog: §2b clarifications from the Opus critic; keep vessel 0.22 / nerve 0.4; body.py OOM fix; muscle ratio 0.25; height two-pass; fix rounds F1–F5 (per-layer AO, female pectoral warp, inside-out organs, breast resolution, defaultHidden) and R-1..R-4 (review). Planned without plan mode and without a review stop (user approved running R1–R7 back to back). The summary is written by main (the summarizer has no write tool).

## Left for the user
- Look at the contact sheets (M1). Full rebuild `npm run pipeline:v5 -- --force` (M2) not re-timed.
- Known gaps in R1.md: male pec 9 mm past the skin, breast fat partly behind ribs, 5,634 unused skin helper vertices, female organs simplified.
