# r2-body-page: test plan

## Automated tests
| ID | AC | Command (from repo root) | Input | Expected output | Exit code |
|---|---|---|---|---|---|
| A1 | AC5 | `npm run lint` | — | no errors | 0 |
| A2 | AC3 | `npm test` | — | regex: `Tests\s+\d+ passed`, no failures | 0 |
| A3 | AC5 | `npm run build` | — | regex: `built in` | 0 |
| A4 | AC3 | `npx vitest run src/body/state.test.ts` | — | all pass, ≥ 14 tests | 0 |
| A5 | AC1 | `npx vitest run src/body/facts.test.ts` | — | all pass | 0 |
| A6 | AC4 | `npx vitest run src/programs` | — | all pass (targets resolve against the manifest) | 0 |
| A7 | AC5 | `test ! -e public/data/body.glb && test ! -e public/data/parts.json && test ! -e src/body/viewer.ts && test ! -e src/ui/explore.ts && echo gone` | — | `gone` | 0 |
| A8 | AC5 | `npm run test:pipeline` | — | regex: `^OK` | 0 |
| A9 | AC5 | `make apk` | — | regex: `APK: output/body-model-debug.apk` | 0 |
| A10 | AC6 | `ls docs/reports/r2/*.png \| wc -l` | — | ≥ 27 | 0 |
| A11 | AC2 | `ls docs/reports/r2/390-male-skin.png docs/reports/r2/768-female-5.png docs/reports/r2/1440-female-bones.png` | — | all three exist | 0 |
| A12 | AC6 | `grep -ciE "fps\|load time" docs/reports/R2.md` | — | ≥ 2 | 0 |
| A13 | AC1 | `node -e "const f=require('./public/data/facts.json');const k=Object.keys(f.facts);console.log(k.length>=100&&k.every(n=>f.facts[n].length>=2&&f.facts[n].length<=4))"` | — | `true` | 0 |

## AC → tests
| AC | Tests |
|---|---|
| AC1 | A5, A13, M1 |
| AC2 | A11, M2 |
| AC3 | A2, A4 |
| AC4 | A6, M3 |
| AC5 | A1, A3, A7, A8, A9 |
| AC6 | A10, A12, M4 |

## Manual checks (not run by tester)
| ID | AC | What to check | How | Passes when |
|---|---|---|---|---|
| M1 | AC1 | Body page controls | Built-in browser, 1440×900 and 390×844 | depth, systems, colour, labels, list, card, isolate/hide/zoom, see-through, ghost, sex, skin tone all work |
| M2 | AC2 | Phone layout | 390×844 | sheet collapsed to the depth slider; body not covered; sheet opens to 72% |
| M3 | AC4 | Programs | Workouts → Programs → Hamstring curl | targets yellow, visible above the sheet |
| M4 | AC6 | Phone fps and load | `make install`, open with `?fps=1` via chrome://inspect, Outer and Skin | ≥ 30 fps at Outer, ≥ 45 at Skin; note the load time |
