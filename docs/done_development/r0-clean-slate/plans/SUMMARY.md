# r0-clean-slate: summary

## What was built
- M1b work is archived on `m1b-archive` as one commit. `main` is fast-forwarded to M1 with the v5.1 docs commit on top. Nothing is pushed.
- `r0-clean-slate` keeps all M1b code. Explore shows Front/Side/Back only, with no Below button.
- Programs Show no longer hides targets. The sheet collapses to a 40vh peek on phones, a handle toggles it, targets are framed in the visible area (from behind for posterior muscles), deep targets show through superficial muscles, and highlights glow. A shared `highlightPlan` helper is tested, and a DEV-only `item=` deep link is added.

## Tasks
| Task | Done / Skipped | Why |
|---|---|---|
| T1 git restructure (R1–R3) | Done | Two commits, as the plan allows |
| T2 reproduce Show before fixes | Done | `raw/show-repro.md` and 8 PNGs |
| T3 model helpers and tests | Done | 13 new tests |
| T4 viewer, explore, programs, style fixes | Done | Two rounds; extra fixes from T2/T4 findings |
| T5 checkpoint material | Done | APK, pixel counts, R0.md, PLAN.md |

## Files changed
Against m1b-archive: `.gitignore`, `docs/PLAN.md`, `docs/REBUILD-PLAN.md` (deleted), `src/body/model.ts`, `src/body/model.test.ts`, `src/body/viewer.ts`, `src/style.css`, `src/ui/explore.ts`, `src/ui/programs.ts`. New: `docs/reports/R0.md`, `docs/reports/r0/`, this plan folder. All in PLAN §3.

## Tests
| | Pass | Fail |
|---|---|---|
| Baseline | 71 | 0 |
| Now | 84 | 0 |

Tester Run 1: 17/17 automated checks pass. Manual M1 and M2 pass (main, built-in browser, 390×844).

## Deviations from the plan
- T1 used `git rm -qf`, because the checkout had staged the file.
- After T2, the yellow pixel rule was loosened to `r>120 && g>90 && b<60 && r-b>100` (the measured colour of the lit highlight).
- T4 added an emissive glow instead of loosening the rule again, plus `.item` scroll-margin-top, `topCover` by computed display, and `.sheet.peek {max-height:none}` at ≥ 900 px.
- T4 fixed the toolbar sitting under the sheet at ≥ 900 px and the duplicate banner (T2 defects 6 and 7).

## Left for the user
- M3: check on a real phone with `make install`.
- APK: 6,308,248 bytes (`output/body-model-debug.apk`).
