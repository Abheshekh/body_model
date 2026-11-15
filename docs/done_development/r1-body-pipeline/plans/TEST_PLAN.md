# r1-body-pipeline: test plan

`PY` = `tools/pipeline/.venv/bin/python -I`. Run from the repo root.

## Automated tests
| ID | AC | Command (from repo root) | Input | Expected output | Exit code |
|---|---|---|---|---|---|
| A1 | AC1 | `npm run test:pipeline:v5` | — | regex: `^OK` and regex: `Ran \d+ tests` | 0 |
| A2 | AC1 | `PY -m unittest discover -s tools/pipeline/v5 -t tools/pipeline -p 'test_output.py' -v` | built packs | regex: `counts.*ok`, `label.*ok`, `layer.*ok`, `sex.*ok`, `height.*ok`, `nan.*ok`, `budget.*ok` (test names contain these words) | 0 |
| A3 | AC2 | `node -e "const m=require('./public/data/body/manifest.json');console.log(m.packs.map(p=>p.name).sort().join(','))"` | — | `bone,joint,lymph,muscle,nerve,organ,skin,tendon,vessel` | 0 |
| A4 | AC2 | `node -e "const m=require('./public/data/body/manifest.json');const h=m.parts.filter(p=>p.system==='Heart');console.log(h.length>0&&h.every(p=>p.kind==='organ'))"` | — | `true` | 0 |
| A5 | AC2 | `node -e "const m=require('./public/data/body/manifest.json');const s=m.packs.filter(p=>p.load==='first').reduce((a,p)=>a+p.gzBytes,0);console.log(s<=10000000,s)"` | — | regex: `^true \d+` | 0 |
| A6 | AC3 | `node -e "const c=JSON.stringify(require('./public/data/body/credits.json'));console.log(/Z-Anatomy/.test(c)&&/BodyParts3D/.test(c)&&/MakeHuman/.test(c)&&/CC BY-SA 4\.0/.test(c)&&/CC0/.test(c))"` | — | `true` | 0 |
| A7 | AC4 | `ls docs/reports/r1/sheet-*.png \| wc -l` | — | `10` | 0 |
| A8 | AC5 | `grep -c "^| " docs/reports/R1.md` | — | ≥ 40 | 0 |
| A9 | AC5 | `grep -ci "doubtful" docs/reports/R1.md` | — | ≥ 1 | 0 |
| A10 | AC6 | `npm test` | — | regex: `Tests\s+\d+ passed`, no failures | 0 |
| A11 | AC6 | `npm run lint` | — | no errors | 0 |
| A12 | AC6 | `npm run build` | — | regex: `built in` | 0 |
| A13 | AC6 | `git diff --name-only r0-clean-slate -- src public/data/body.glb public/data/parts.json public/data/credits.json public/data/programs.json \| wc -l` | — | `0` | 0 |
| A14 | AC1 | `npm run test:pipeline` | — | the M1 pipeline tests still pass (OK) | 0 |
| A15 | AC2 | `node -e "const m=require('./public/data/body/manifest.json');console.log(m.parts.every(p=>m.packs.some(k=>k.name===p.pack)), m.parts.filter(p=>p.simplified).every(p=>p.sex==='female'))"` | — | `true true` | 0 |

## AC → tests
| AC | Tests |
|---|---|
| AC1 | A1, A2, A14 |
| AC2 | A3, A4, A5, A15 |
| AC3 | A6 |
| AC4 | A7, M1 |
| AC5 | A8, A9 |
| AC6 | A10–A13 |

## Manual checks (not run by tester)
| ID | AC | What to check | How | Passes when |
|---|---|---|---|---|
| M1 | AC4 | Contact sheets look right | Open docs/reports/r1/*.png | Both sexes standing in the same pose; skin opaque on the skin sheet; muscles peel deeper sheet by sheet; female chest and pelvis plausible; no exploded or inside-out parts |
| M2 | AC1 | Full rebuild from scratch | `npm run pipeline:v5 -- --force` | Finishes; timings in the report match within ±30% |
