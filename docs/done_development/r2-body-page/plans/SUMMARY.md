# r2-body-page: summary

## What was built
- The Body page on the R1 data: both sexes, depth slider (Skin, Outer, 2–6, Bones), systems, colour modes with legends, labels, list with tabs and search, part card with 200 sourced facts (100 parts), isolate / hide / zoom / show hidden, see-through skin, ghost, skin tone, phone sheet.
- App shell: Body, Workouts (coming list + Programs), Me (profile + credits). One WebGL viewer for the app.
- Programs highlight on the new body (all 63 targets mapped; TFL dropped with a note).
- M1 viewer, M1 data and the M1 pipeline removed; `npm run pipeline` is the v5 pipeline.

## Tasks
| Task | Done |
|---|---|
| T1 loader, T2 state, T2b state follow-ups, T3 facts | yes |
| T4a core scene, T4b interactions, T5 picking + labels | yes |
| T6a page/sheet/top bar, T6b list/card | yes |
| T7 shell, T8 programs, T8b remove M1, T9 shots + numbers, T10 report | yes |

## Tests
| | Pass | Fail |
|---|---|---|
| Baseline npm test | 84 | 0 |
| Now npm test | 91 (106 before removing 15 dead-helper tests) | 0 |
| Tester rows | 13 of 13 | 0 |

## Deviations
Changelog: critic §2b 1–19 and task re-cut; setSkinTone and setLabels added; tablet uses the sheet layout below 900 px; legend under the depth slider on phone; select shares the highlight channel; TFL dropped; OpenStax licence is CC BY-NC-SA 4.0 as stated; review fixes V-1..V-4. Planned without a review stop (user approved). Summary written by main.

## Left for the user
- M4: phone fps (Outer ≥ 30, Skin ≥ 45) and load time via `make install` + chrome://inspect + `?fps=1`. Headless numbers are software GL only.
- Play Store licence check for OpenStax (NC-SA) before going public.
