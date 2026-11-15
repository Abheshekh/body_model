# r3-rig-move: test plan

## Automated tests
| ID | AC | Command (from repo root) | Input | Expected output | Exit code |
|---|---|---|---|---|---|
| A1 | AC5 | `npm run lint` | — | no errors | 0 |
| A2 | AC5 | `npm test` | — | regex: `Tests\s+\d+ passed`, no failures | 0 |
| A3 | AC5 | `npm run build` | — | regex: `built in` | 0 |
| A4 | AC5 | `npm run test:pipeline` | — | regex: `^OK` | 0 |
| A5 | AC1 | `tools/pipeline/.venv/bin/python -I -m unittest discover -s tools/pipeline/v5 -t tools/pipeline -p 'test_rig.py' -v` | built data | regex: `OK` | 0 |
| A6 | AC2 | `npx vitest run src/rig` | — | all pass | 0 |
| A7 | AC3 | `npx vitest run src/library` | — | all pass | 0 |
| A8 | AC4 | `node -e "const m=require('./public/data/body/manifest.json');const s=m.packs.filter(p=>p.load==='first').reduce((a,p)=>a+p.gzBytes,0);console.log(s<=10000000, !m.packs.some(p=>p.name==='weights'), !!(m.rig&&m.rig.weights&&m.rig.file==='rig.json'))"` | — | `true true true` | 0 |
| A9 | AC4 | `test -s public/data/body/weights.bin.gz && test -s public/data/body/rig.json && echo ok` | — | `ok` | 0 |
| A10 | AC3 | `node -e "const e=require('./public/data/exercises.json'),t=require('./public/data/tasks.json');console.log(e.exercises.length,t.tasks.length)"` | — | `11 5` | 0 |
| A11 | AC6 | `ls docs/reports/r3/pose-*.png \| wc -l` | — | `20` | 0 |
| A12 | AC5 | `make apk` | — | regex: `APK: output/body-model-debug.apk` | 0 |

## AC → tests
| AC | Tests |
|---|---|
| AC1 | A5, M1 |
| AC2 | A6, M2 |
| AC3 | A7, A10, M3 |
| AC4 | A8, A9 |
| AC5 | A1–A4, A12 |
| AC6 | A11 |

## Manual checks (not run by tester)
| ID | AC | What to check | How | Passes when |
|---|---|---|---|---|
| M1 | AC1 | Pose screenshots | Open docs/reports/r3/pose-*.png | no torn muscle, no inside-out mesh, skin follows |
| M2 | AC2 | Move screen by hand | Built-in browser 390×844 and desktop | drag, sliders, IK squat with planted feet, undo/redo, keyframes |
| M3 | AC3 | Play content | Workouts → Exercises / Tasks | every variant animates, provisional label shown |
