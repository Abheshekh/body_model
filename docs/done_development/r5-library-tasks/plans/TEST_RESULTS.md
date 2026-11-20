## Run 1: build (Haiku tester; table written by main because the tester may not edit files)
| ID | Result | Actual (short) | Notes |
|---|---|---|---|
| A1 lint | PASS | | |
| A2 npm test | PASS | 504 passed, 34 files | |
| A3 build | PASS | | |
| A4 | PASS | 60 passed | |
| A5 check.mjs | PASS | failing: 0 of 50 | |
| A6 | FAIL (expected) | exit 1: 25 of 50 records have reviewed:false | Needs reviewed on all 50. User decision 2026-11-21 (Changelog): only the 25 tiles whose review line says OK are reviewed; the other 25 are finished in step 2. Test left unchanged, not weakened. |
| A7–A18, A20, A21 | PASS | | A11 and A12 greps empty as expected; A15 APK 20,963,609 bytes |
| A19 layout.mjs | PASS | layout ok | |
Pass 20, Fail 1.
