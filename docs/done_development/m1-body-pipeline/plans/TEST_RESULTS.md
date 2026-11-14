
## Run 1: build
| ID | Result | Actual (short) | Notes |
|---|---|---|---|
| A1 | PASS | eslint . exit 0, no output | |
| A2 | PASS | Tests  20 passed (20), exit 0 | 2 files |
| A3 | PASS | vite build "built in 138ms", exit 0 | chunk-size warning only |
| A4 | PASS | "OK" line, Ran 21 tests, exit 0 | ResourceWarning on body.glb open in test_output.py:17 (not a failure) |
| A5 | PASS | 6 passed, exit 0 | data.test.ts |
| A6 | PASS | 14 passed, exit 0 | model.test.ts |
| A7 | PASS | "True 693" | triangles <= 420000, 693 parts |
| A8 | PASS | "True True" | |
| A9 | PASS | 2759628 bytes | limit 10485760 |
| A10 | PASS | count 4 | |
| A11 | PASS | tools/pipeline/cache and tools/pipeline/.venv both printed | |

## Run 2: manual (main session, Phase C)
| ID | Result | Actual (short) | Notes |
|---|---|---|---|
| A1–A4 re-run by main | PASS | lint clean; 20 vitest pass; build OK; 21 unittest OK | same as Run 1 |
| M8 | PASS (shape), NOTE (shading) | front.png/back.png: head, hands, feet, all limbs present, 693 parts | Back view is much darker than docs/preview/body-1-front-back.png and the lateral thighs read grey (tendon tract). Lighting looks fixed to the front; the spike moved the key light with the camera. Cosmetic, not fixed in M1. |
| M1–M7, M9, M10 | NOT RUN | needs a browser session / phone | left for the user |
