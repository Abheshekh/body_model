# r2-body-page: baseline (before any change)

Taken 2026-11-15 on r2-body-page (= r1-body-pipeline 2bf9323), from R1's final tester run (Run 4) and fix round 3.

| Command | Pass | Fail | Notes |
|---|---|---|---|
| npm run lint | yes | 0 | |
| npm test | 84 | 0 | |
| npm run build | yes | 0 | chunk-size warning pre-existing |
| npm run test:pipeline | 69+ | 0 | M1 + v5 tests (v5 50 after fix round 3) |

Failing before this feature:
- none
