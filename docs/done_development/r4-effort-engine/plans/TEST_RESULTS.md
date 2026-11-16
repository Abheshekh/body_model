# r4-effort-engine: test results

## Run 1: build
| ID | Result | Actual (short) | Notes |
|---|---|---|---|
| A1 | PASS | lint exit 0, no errors | |
| A2 | PASS | 26 files, 328 tests passed, exit 0 | Baseline was 207 tests / 12 files; counts differ, no failures |
| A3 | PASS | built, exit 0 | |
| A4 | PASS | 12 passed (1 file), exit 0 | |
| A5 | PASS | no output, exit 1 | |
| A6 | PASS | 2 files, 15 passed, exit 0 | |
| A7 | PASS | no output, exit 1 | |
| A8 | PASS | exit 0 | |
| A9 | PASS | output/body-model-debug.apk, 20917550 bytes, exit 0 | Ran with PATH="$HOME/.nvm/versions/node/v24.15.0/bin:$PATH" (Node >= 22 for Capacitor) |
| A10 | FAIL | `ugrep: warning: docs/prompts/next.md: No such file or directory`, exit 2 | cannot run: docs/prompts/next.md does not exist |
| A11 | PASS | Ran 70 tests, OK, exit 0 | |


## Run 2: final (main, after review fixes)
| ID | Result | Actual (short) | Notes |
|---|---|---|---|
| A1 lint | PASS | clean | |
| A2 npm test | PASS | 332 tests, 26 files | baseline 207 / 12 |
| A3 build | PASS | built | |
| A4 cases | PASS | in A2 | |
| A5 purity grep | PASS | no output | |
| A6 data tests | PASS | in A2 | |
| A7 provisional grep | PASS | no output | |
| A8 file deleted | PASS | | |
| A9 make apk | PASS | 20,917,635 bytes | Node 24 on PATH (Capacitor needs >= 22) |
| A10 next.md | PASS | 1 | |
| A11 pipeline | PASS | 70 tests OK | |
