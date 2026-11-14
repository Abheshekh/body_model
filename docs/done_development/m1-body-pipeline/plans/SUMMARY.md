# m1-body-pipeline: summary

## What was built
- Python pipeline (`tools/pipeline/`): partial-clones BodyParts3D, classifies parts, simplifies to a 400k triangle budget, writes `public/data/body.glb` (meshopt), `parts.json`, `credits.json`.
- Result: 693 parts (muscle 431, bone 201, cartilage 41, tendon 8, organ 11, skin 1), 400,822 triangles, body.glb 2,759,628 bytes.
- Vite + three.js Explore screen: front/side/back views, five layer toggles, tap card, search with fly-to and highlight, `setPartColor` / `clearHighlights`, Credits screen.

## Tasks
| Task | Done / Skipped | Why |
|---|---|---|
| T1–T4, T5a–T5c, T6–T9, T10a–T10b, T11–T13 | Done | all ticked in PLAN.md §8 |

## Files changed
Matches PLAN.md §3. No extras outside it. `tools/pipeline/.venv`, `tools/pipeline/cache` and `node_modules` are gitignored. `docs/PLAN.md` and `docs/SPEC.md` were updated. Nothing committed yet on `feat/m1-body-pipeline`.

## Tests
| | Pass | Fail |
|---|---|---|
| Baseline | n/a (no tooling existed) | n/a |
| Now | 41 (vitest 20, unittest 21), lint clean, build OK | 0 |

Tester Run 1: A1–A11 all PASS. Main re-ran A1–A4 in Run 2.

## Deviations from the plan
- `flyDistance` floor test input changed from radius 0.1 to 0.05 (planner arithmetic error, authorised).
- Part ids are `BP<n>`, not `FMA<n>`. Meshes, nodes and parts.json use `BP` ids.
- `build.py` computes vertex normals itself (trimesh's needs scipy, not an allowed dependency).
- `config.json` rules carry extra keys (`tendonAlways`, `notMuscle`, `cartilage`).
- Vitest 5 installs only with `--legacy-peer-deps` on npm 10.8.2. On Node 20 its reporter crashes with `Map.groupBy` when a test fails (use `--reporter=verbose`).
- Critic round 1 patched 17 gaps (see PLAN.md Changelog).

## Left for the user
- Manual checks M1–M7 (browser interaction), M9 (desktop fps and load time), M10 (Android over LAN, `http://192.168.1.6:4173/?fps=1`). Numbers go into `docs/reports/M1.md`.
- Back view is much darker than `docs/preview/body-1-front-back.png`, and the lateral thighs read grey (tendon tract). Lighting looks fixed to the front instead of following the camera. Shape and completeness match. Not fixed in M1.
- Review the five least-sure layer classifications in `docs/reports/M1.md`.
