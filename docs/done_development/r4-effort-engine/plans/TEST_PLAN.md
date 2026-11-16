# r4-effort-engine: test plan
| ID | AC | Command | Expected | Exit |
|---|---|---|---|---|
| A1 | AC4 | `npm run lint` | no errors | 0 |
| A2 | AC4 | `npm test` | all pass | 0 |
| A3 | AC4 | `npm run build` | built | 0 |
| A4 | AC1 | `npx vitest run src/engine/cases.test.ts` | 6 cases × 2 sexes pass | 0 |
| A5 | AC1 | `grep -rn "from 'three'" src/engine` | no output | 1 |
| A6 | AC2 | `npx vitest run src/engine/actions.test.ts src/engine/data.test.ts` | pass | 0 |
| A7 | AC3 | `grep -rn "provisional_muscles" src public tools/content` | no output | 1 |
| A8 | AC3 | `test ! -e public/data/provisional_muscles.json` | — | 0 |
| A9 | AC4 | `rm -f output/body-model-debug.apk && make apk && ls -l output/body-model-debug.apk` | regex: `body-model-debug\.apk` | 0 |
| A10 | AC5 | `grep -c "At the checkpoint" docs/prompts/next.md` | 1 | 0 |
| A11 | AC1 | `npm run test:pipeline` | OK, 70 tests (BASELINE.md) | 0 |

Manual: M1 panel readable at 390×844 and body visible (screenshots); M2 Move live effort by hand; M3 phone frame rate on the APK.

## Verification
Tester runs TEST_PLAN; main checks git diff against §3, no new deps, no weakened tests, compares to BASELINE, looks at the shots; Sonnet reviewer reads the diff. Then main commits on r4-effort-engine, shows next.md in chat and stops for your review.
