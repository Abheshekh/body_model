# r5-library-tasks: test plan

## Automated tests
| ID | AC | Command (from repo root) | Input | Expected output | Exit code |
|---|---|---|---|---|---|
| A1 | AC6 | `PATH=$HOME/.nvm/versions/node/v24.15.0/bin:$PATH npm run lint` | — | no errors | 0 |
| A2 | AC6 | `PATH=$HOME/.nvm/versions/node/v24.15.0/bin:$PATH npm test` | — | regex: `Tests\s+\d+ passed` and no failed | 0 |
| A3 | AC6 | `PATH=$HOME/.nvm/versions/node/v24.15.0/bin:$PATH npm run build` | — | built | 0 |
| A4 | AC1 | `PATH=$HOME/.nvm/versions/node/v24.15.0/bin:$PATH npx vitest run src/library/exercises.test.ts src/library/data.test.ts` | v2 schema, search, filters, empty result, unknown refs | pass | 0 |
| A5 | AC1 | `PATH=$HOME/.nvm/versions/node/v24.15.0/bin:$PATH node tools/library/check.mjs` | 50 records × 2 sexes | `failing: 0 of 50` | 0 |
| A6 | AC1 | `node --input-type=module -e "import {readFileSync as r} from 'fs';const d=JSON.parse(r('public/data/exercises.json'));process.exit(d.exercises.length===50&&d.exercises.every(e=>e.reviewed&&e.sources.length&&e.keyframes.length>=2)?0:1)"` | — | — | 0 |
| A7 | AC6 | `PATH=$HOME/.nvm/versions/node/v24.15.0/bin:$PATH npx vitest run src/library/form.test.ts` | each check pass + fail fixture | pass | 0 |
| A8 | AC5 | `PATH=$HOME/.nvm/versions/node/v24.15.0/bin:$PATH npx vitest run src/library/taskgen.test.ts` | all combos both sexes; stoop vs squat; one vs split carry | pass | 0 |
| A9 | AC3 | `PATH=$HOME/.nvm/versions/node/v24.15.0/bin:$PATH npx vitest run src/library/compare.test.ts src/body/ghost.test.ts` | rise/fall/none/lumbar/balance; ghost add/remove | pass | 0 |
| A10 | AC2 | `PATH=$HOME/.nvm/versions/node/v24.15.0/bin:$PATH npx vitest run src/library/equipment.test.ts` | placement transforms | pass | 0 |
| A11 | AC6 | `grep -rln "from 'three'" src/engine src/library` | — | empty output | 1 |
| A12 | AC6 | `grep -rnE "(muscles|primary|secondary|prime|stabilisers)\"\s*:" public/data/exercises.json public/data/taskbuilder.json` | — | empty output | 1 |
| A13 | AC2 | `node --input-type=module -e "import {readFileSync as r} from 'fs';const d=JSON.parse(r('public/data/equipment.json'));const all=[...d.items,...d.objects];process.exit(all.every(i=>i.source&&i.licence)?0:1)"` | — | — | 0 |
| A14 | AC5 | `test ! -e public/data/tasks.json && test ! -e src/ui/workouts/props.ts` | — | — | 0 |
| A15 | AC6 | `rm -f output/body-model-debug.apk && PATH=$HOME/.nvm/versions/node/v24.15.0/bin:$PATH make apk && ls -l output/body-model-debug.apk` | — | `ls -l` shows output/body-model-debug.apk with size > 0 | 0 |
| A16 | AC1 | `ls docs/reports/r5/contact-male.png docs/reports/r5/contact-female.png` | — | both listed | 0 |
| A17 | AC7 | `grep -c "At the checkpoint" docs/prompts/next.md` | — | `1` | 0 |
| A19 | AC3 | `node --experimental-websocket tools/library/layout.mjs` (dev server on 5300) | 390×844, collapsed and open sheets of library, player, editor, builder | `layout ok` | 0 |
| A20 | AC2 | `grep -c "built for the project" src/ui/credits.ts` | — | ≥ 1 | 0 |
| A21 | AC4 | `PATH=$HOME/.nvm/versions/node/v24.15.0/bin:$PATH npx vitest run src/library/edits.test.ts` | add/remove/reorder, ≥ 2 kept, save/revert, throwing storage | pass | 0 |
| A18 | AC4 | `PATH=$HOME/.nvm/versions/node/v24.15.0/bin:$PATH npx tsc --noEmit` | editor types | no output | 0 |

## AC → tests
| AC | Tests |
|---|---|
| AC1 | A4, A5, A6, A16, M1 |
| AC2 | A10, A13, A20, M0 |
| AC3 | A9, A19, M2, M3 |
| AC4 | A18, A21, M4 |
| AC5 | A8, A14, M5 |
| AC6 | A1, A2, A3, A7, A11, A12, A15 |
| AC7 | A17, M6 |

## Manual checks (not run by tester)
| ID | AC | What to check | How | Passes when |
|---|---|---|---|---|
| M0 | AC2 | Equipment looks real | GATE: user views docs/reports/r5/equipment-*.png | user approves |
| M1 | AC1 | 50 tiles look like correct form | view contact-male/female.png | no wrong form, no body through equipment |
| M2 | AC3 | Exercise screen at 390×844 | `npx vite --port 5300`, phone emulation: search "curl", filter Dumbbell, open, change variation, move load slider, Compare → A/B + ghost, Edit | each works; collapsed sheet = title, variation, transport, legend, one line; body not covered |
| M3 | AC3 | Compare at ≥ 900 px | same, 1280 wide | columns side by side |
| M4 | AC4 | Editor | open Edit on bench-press, drag elbow, Save, reload, Revert | effort and checks update; version persists then reverts; nothing sent over the network (DevTools Network tab) |
| M5 | AC5 | Task builder | presets stoop vs squat, carry one vs both; Compare | lumbar band and words show the shifts; balance warning when forced |
| M6 | AC7 | Phone fps | `make install` on a phone, Workouts player 10 s | fps recorded or "unmeasured" stated |
