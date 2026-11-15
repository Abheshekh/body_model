# r3-rig-move: baseline (before any change)

Taken 2026-11-15 on r3-rig-move (= r2-body-page 8a1914f), from R2's final checks.

| Command | Pass | Fail | Notes |
|---|---|---|---|
| npm run lint | yes | 0 | |
| npm test | 91 | 0 | |
| npm run build | yes | 0 | chunk-size warning pre-existing |
| npm run test:pipeline | 50 | 0 | v5 only |

Failing before this feature:
- none
