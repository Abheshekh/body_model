# m1b-android-programs: baseline (before any change)
| Command | Pass | Fail | Notes |
|---|---|---|---|
| npm run lint | 0 | 1418 errors | all in android/app/src/main/assets/public/assets/index-D0TLFrCy.js (copied web build). Fixed by T4 (ignore android, output). |
| npm test | 20 | 0 | 2 files |
| npm run build | pass | 0 | chunk > 500 kB warning (known) |

Failing before this feature:
- npm run lint (android/ build copy, see above)
