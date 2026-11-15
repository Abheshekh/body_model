## Run 1: build
| ID | Result | Actual (short) | Notes |
|---|---|---|---|
| A1 | PASS | lint exit 0, no errors | |
| A2 | PASS | Tests 106 passed (106), exit 0 | baseline was 84; count grew |
| A3 | PASS | "built in 128ms", exit 0 | chunk-size warning pre-existing |
| A4 | PASS | state.test.ts 17 passed (17), exit 0 | ≥14 met |
| A5 | PASS | facts.test.ts 3 passed (3), exit 0 | |
| A6 | PASS | src/programs 23 passed (23), exit 0 | |
| A7 | PASS | output "gone", exit 0 | |
| A8 | PASS | "OK", Ran 50 tests, exit 0 | |
| A9 | PASS | "APK: output/body-model-debug.apk", exit 0 | |
| A10 | PASS | 27 PNGs | ≥27 met |
| A11 | PASS | all three files exist | |
| A12 | PASS | 9 matches | ≥2 met |
| A13 | PASS | true | |


## Run 2: review findings (main)
| ID | Result | Actual (short) | Notes |
|---|---|---|---|
| V-1 | FAIL | Body-page selection glows yellow inside Programs; canvas taps still select there | Pass: Programs call `viewer.select(null)` on mount and block Body-page tap-select while mounted; the previous selection is restored on dispose with the snapshot |
| V-2 | FAIL | M1 helpers in model.ts unused (Kind, LayerKey, Part, LAYER_KEYS, layerOf, searchParts, mixColor, parseLayersParam, partIdsByName) | Pass: removed with their tests; `grep` finds no use |
| V-3 | FAIL | Explore CSS left in style.css (.explore, .toolbar, .views, .layers, .search, .no-match, .card*, .credit) | Pass: removed if no element uses the class (grep src) |
| V-4 | FAIL | After Hide, "Show hidden" is unreachable (card closes) | Pass: a "Show hidden (n)" button appears in the Body page controls (top bar on wide, sheet on phone) whenever user-hidden parts exist; it restores them (defaultHidden parts stay hidden) |

## Run 3: review fix round (main, from the fix builder's checks)
| ID | Result | Actual (short) | Notes |
|---|---|---|---|
| V-1 | PASS | calf selected on #body; in Programs only hamstrings yellow (353); taps and label taps select nothing; selection restored on #body | mechanism: page ignores selection while behind, instead of Programs saving it |
| V-2 | PASS | 9 dead helpers + 15 tests removed; flyDistance kept (used) | |
| V-3 | PASS | Explore CSS removed; .card-x and .banner kept (used) | |
| V-4 | PASS | "Show hidden (n)" in top bar (wide) and under the depth slider (phone); restores user-hidden parts only | |
| suite | PASS | build 0; npm test 91; lint 0 | |
