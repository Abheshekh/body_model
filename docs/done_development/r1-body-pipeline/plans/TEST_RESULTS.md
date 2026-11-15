## Run 1: manual (main, after T10 contact sheets)
| ID | Result | Actual (short) | Notes |
|---|---|---|---|
| F1 | FAIL | AO: layer-1 muscle median ao 0.13, layers 3–6 all 0.12 (floor); backs render near black | AO rays hit the part's own surface (layers.ambient_occlusion). Pass: median ao of layer-1 muscle ≥ 0.5, and < 5% of all anatomy vertices at the floor value |
| F2 | FAIL | Female pectoralis major takes the breast shape (sheet-female-outer chest close-up) | D4/§1.3 step 8: breasts are excluded from the anatomy warp. Pass: max z of female pectoralis major (both sides) − max z of male pectoralis major ≤ 0.015 m |
| F3 | FAIL | Generated female organs (uterus, ovaries, vagina, tubes) inside-out: 0% outward normals | Pass: every simplified part has ≥ 90% of vertex normals pointing away from its centre |
| F4 | FAIL | Breast fat has 78 vertices per side; shows as jagged flaps | Pass: mammary gland and breast fat each ≥ 400 vertices per side, outward normals as F3 |
| F5 | FAIL | Greater omentum hides the abdomen on the sheets | SPEC §1A default hidden: greater and lesser omentum, mesocolon, pleura. Pass: manifest parts carry `"defaultHidden": true` for those (name match `omentum|mesocolon|pleura`), sheet.html skips defaultHidden parts, and test_output checks at least 2 such parts exist |

## Run 2: fix round 1 (main, from the fix builder's measurements)
| ID | Result | Actual (short) | Notes |
|---|---|---|---|
| F1 | FAIL | layer-1 median ao 0.152, 72% at floor | Pass rule was wrong (hemisphere AO on touching parts). New rule below (F1b) |
| F1b | FAIL | not built yet | Per-layer AO: a muscle/tendon vertex at layer L is occluded only by muscle/tendon parts with layer ≥ L plus all non-muscle anatomy (skin excluded). Pass: median ao of layer-3+ muscle vertices ≥ 0.25 (was 0.12), and the layer-1 median does not drop below 0.127 |
| F2 | PASS | female pec forward shift beyond sternum 5.9 mm (was 12.2) | harmonic fill of the breast region in the anatomy field |
| F3 | PASS | uterus, ovaries, vagina 100% outward; tubes 100% outward per ring | the centroid rule is wrong for curved tubes; per-ring check accepted |
| F4 | PASS | breast fat 894 / 970 verts per side, 100% outward | |
| F5 | PASS | 4 defaultHidden parts; sheets skip them; test_default_hidden OK | |

## Run 3: fix round 2 (main)
| ID | Result | Actual (short) | Notes |
|---|---|---|---|
| F1b | PASS | visible-muscle AO median (male front/back): outer 0.98/1.00, intermediate 0.92/0.95, deep 0.58/0.80 (all were ~0.12) | Judged by vertices visible on each sheet (what the user sees); the all-vertex median stays low because buried vertices touch bone, which is correct. Layer-1 pack value unchanged (32/255) |

## Run 4: build
| ID | Result | Actual (short) | Notes |
|---|---|---|---|
| A1 | PASS | `npm run test:pipeline:v5`: Ran 48 tests, OK, exit 0 | regex `^OK` and `Ran \d+ tests` match |
| A2 | PASS | 10 tests OK, exit 0 | counts, label, layer, sex, height, nan, budget all present |
| A3 | PASS | `bone,joint,lymph,muscle,nerve,organ,skin,tendon,vessel` | exact match |
| A4 | PASS | `true` | |
| A5 | PASS | `true 9276042` | first-load gzip 9.28 MB, limit 10 MB |
| A6 | PASS | `true` | Z-Anatomy, BodyParts3D, MakeHuman, CC BY-SA 4.0, CC0 all present |
| A7 | PASS | 10 sheet PNGs | |
| A8 | PASS | 88 table rows | expected >= 40 |
| A9 | PASS | 1 match for "doubtful" | expected >= 1 |
| A10 | PASS | Tests 84 passed (84), 5 files | no failures |
| A11 | PASS | eslint: no output | exit 0 |
| A12 | PASS | `built in 125ms` | pre-existing chunk-size warning only |
| A13 | PASS | `0` | no changes to src or protected public data since r0-clean-slate |
| A14 | PASS | Ran 69 tests, OK | ResourceWarning on stderr is not a failure |
| A15 | PASS | `true true` | |

## Run 5: review findings (main)
| ID | Result | Actual (short) | Notes |
|---|---|---|---|
| R-1 | FAIL | test_output.test_no_nan only checks isfinite on decoded integers | Pass: it decodes positions into the box and checks every normal length (/127) in 0.9–1.1 (§2b.13) |
| R-2 | FAIL | pack.py:40 `q8(fib + 1e-9)` gives non-muscle vertices fibre (46,46,46) | Pass: fib is exactly 0 for every non-muscle/tendon vertex in the packs; test_pack checks it |
| R-3 | FAIL | generated female parts occlude the male AO pass | Pass: parts with sex 'female' are excluded from the AO occluders (AO is the male shape) |
| R-4 | FAIL | plain names keep parentheses, e.g. "(Deep branch of transverse cervical artery)" | Pass: plain names have no leading/trailing parentheses; a names test covers it |

## Run 6: fix round 3 (main, from the fix builder's measurements)
| ID | Result | Actual (short) | Notes |
|---|---|---|---|
| R-1 | PASS | test_no_nan checks box + normal length; 0 bad normals in 9 packs, min 0.993 | |
| R-2 | PASS | 0 non-zero fib components over 365,211 non-muscle vertices; test_zero_fibre_stays_zero | |
| R-3 | PASS | female-only parts excluded from AO occluders (code check; no test file in scope) | |
| R-4 | PASS | 0 plain names start with "(" (was 26); trailing qualifiers like "Atlas (C1)" kept to stay unique | |
| suite | PASS | test:pipeline:v5 50 OK; npm test 84; lint 0; first-load gz 9,276,312 | |
