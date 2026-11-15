# r1-body-pipeline: baseline (before any change)

Taken 2026-11-15 10:58 on r1-body-pipeline (= r0-clean-slate cb7909e).

| Command | Pass | Fail | Notes |
|---|---|---|---|
| npm run lint | yes | 0 | exit 0 |
| npm test | 84 | 0 | 5 files |
| npm run build | yes | 0 | pre-existing chunk-size warning |
| npm run test:pipeline (M1) | 21 | 0 | |
| npm run test:pipeline:v5 | — | — | does not exist yet |

Failing before this feature:
- none
