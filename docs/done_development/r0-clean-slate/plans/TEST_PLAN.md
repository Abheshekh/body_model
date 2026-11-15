# r0-clean-slate: test plan

## Automated tests
| ID | AC | Command (from repo root) | Input | Expected output | Exit code |
|---|---|---|---|---|---|
| A1 | AC1 | `git branch --show-current` | — | `r0-clean-slate` | 0 |
| A2 | AC1 | `git log --format=%s -1 m1b-archive` | — | regex: `^M1b archive` | 0 |
| A3 | AC1 | `git log --format=%s main -2` | — | `Docs: plan v5.1` then regex: `^M1: body pipeline` | 0 |
| A4 | AC1 | `git ls-tree -r --name-only m1b-archive \| grep -E "DS_Store\|\.tgz$\|r0-clean-slate" \| wc -l` | — | `0` | 0 |
| A5 | AC2 | `npm run lint` | — | no errors | 0 |
| A6 | AC2 | `npm test` | — | regex: `Tests\s+\d+ passed` and no failures | 0 |
| A7 | AC2 | `npm run build` | — | regex: `built in` | 0 |
| A8 | AC2 | `npx vitest run src/body/model.test.ts -t "highlightPlan\|viewOffset\|visibleFraction\|fitDistance"` | — | all pass, ≥ 13 tests | 0 |
| A9 | AC3 | `grep -c "'below'" src/ui/explore.ts` | — | `0` | 1 |
| A10 | AC3 | `grep -c "'below'" src/body/viewer.ts` | — | `0` | 1 |
| A11 | AC4 | `ls docs/reports/r0/show-*-390.png \| wc -l` | — | `4` | 0 |
| A12 | AC5 | `make apk` | — | regex: `APK: output/body-model-debug.apk` | 0 |
| A13 | AC5 | `grep -E "[0-9]{6,} bytes" docs/reports/R0.md` | — | a match | 0 |
| A14 | AC6 | `test -f tools/sample/README.md && test ! -e docs/REBUILD-PLAN.md && echo ok` | — | `ok` | 0 |
| A15 | AC7 | `grep -cE "R0.*all M1b code kept" docs/PLAN.md` | — | ≥ 1 | 0 |
| A17 | AC4 | `node -e "const p=require('./docs/reports/r0/pixels.json');const k=Object.keys(p).filter(n=>n.startsWith('show-'));if(k.length<5||k.some(n=>p[n].yellowVisible<50))process.exit(1);console.log('ok',k.length)"` | — | `ok 5` | 0 |
| A16 | AC1 | `git diff --name-only m1b-archive -- src public android Makefile capacitor.config.ts` | — | only src/body/model.ts, src/body/model.test.ts, src/body/viewer.ts, src/ui/explore.ts, src/ui/programs.ts, src/style.css | 0 |

## AC → tests
| AC | Tests |
|---|---|
| AC1 | A1–A4, A16 |
| AC2 | A5–A8 |
| AC3 | A9, A10, M1 |
| AC4 | A11, A17, M2, M3 |
| AC5 | A12, A13 |
| AC6 | A14 |
| AC7 | A13, A15 |

## Manual checks (not run by tester)
| ID | AC | What to check | How | Passes when |
|---|---|---|---|---|
| M1 | AC3 | No Below; pelvic only from a program | Built-in browser at 390×844, `npm run dev` | Explore shows Front/Side/Back; Pelvic floor → Slow holds opens the pelvic view |
| M2 | AC4 | Show at 390×844 and desktop | Tap Dead bug, Hamstring curl, Wall slide | Yellow targets are visible above the sheet; the handle toggles peek; leaving Programs restores the full view |
| M3 | AC4 | On your phone | `make install`, then the same steps | Same as M2 on the real device |
