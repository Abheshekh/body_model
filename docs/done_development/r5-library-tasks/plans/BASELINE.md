# r5-library-tasks: baseline (before any change)
| Command | Pass | Fail | Notes |
|---|---|---|---|
| npm run lint | clean | 0 | Node 24 |
| npm test | 332 | 0 | 26 files, Node 24 |
| npm run test:pipeline | not run | - | pipeline untouched by R5 |

Failing before this feature:
- none (R3 AC1 tear/flip limits are checked by acceptance_rig.py, not the test suite)
