# r4-effort-engine: baseline (before any change)
| Command | Pass | Fail | Notes |
|---|---|---|---|
| npm run lint | clean | 0 | |
| npm test | 207 | 0 | 12 files |
| npm run test:pipeline | 70 | 0 | OK |

Failing before this feature:
- none (R3 AC1 tear/flip limits are checked by acceptance_rig.py, not the test suite)
