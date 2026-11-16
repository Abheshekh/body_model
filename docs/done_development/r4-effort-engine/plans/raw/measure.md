# R4 T7 measurements

Machine: Apple M4 Pro, macOS (Darwin 27.2.0), Node v20.19.6 (default shell). Timing run through Vite SSR loader (`node tools/engine/cases.mjs --time`), real data files, 20 warm-up calls, then median of 200.

## Engine timing (median of 200 calls, ms)
| sex | variant | effort() | effortOverMove(9 samples) |
|---|---|---|---|
| male | curl/stand | 0.27 | 2.60 |
| male | squat/back | 0.26 | 2.54 |
| male | bucket/stoop | 0.26 | 2.50 |
| male | pull/pullup | 0.25 | 2.46 |
| female | curl/stand | 0.26 | 2.49 |
| female | squat/back | 0.26 | 2.53 |
| female | bucket/stoop | 0.26 | 2.50 |
| female | pull/pullup | 0.25 | 2.46 |

effort() is about 0.26 ms, so the player's per-frame call and Move's 10 Hz live call cost far less than one 60 Hz frame (16.7 ms). Desktop M4 Pro numbers: the phone is slower by an unmeasured factor (M3 on the APK is still open).

## Dev-server loop
`node --experimental-websocket tools/engine/shots.mjs male` (Node 20, dev server on port 5300): `opened 33 of 33`, no console errors (the favicon 404 is filtered out).

## Screenshots (390x844, docs/reports/r4/, headless Chrome + SwiftShader, depth=outer; retaken after the T6b sheet fix, all 7 looked at)
Collapsed sheet shows title, variant, transport, legend and one "Most effort" line; the open sheet is capped at 45vh.
- curl-male.png (collapsed): head to feet visible above the sheet; panel is the one-line summary.
- curl-female.png (collapsed): head to feet visible; same layout.
- bucket-stoop-male.png (collapsed): whole bent body, bucket and feet visible.
- bucket-squat-male.png (collapsed): whole squatting body, bucket and feet visible.
- move-male.png (collapsed): head to feet visible, joint handles visible; sheet shorter than the others (undo/redo, view buttons, summary line).
- move-female.png (collapsed): head to feet visible; same.
- curl-male-open.png (expanded): head to the lower shins visible; feet are under the sheet. Load field readable, the Muscles heading starts at the nav edge (rows need scrolling inside the sheet).
shots.mjs after the fix: opened 33 of 33, no console errors.

## APK
`make apk` with the default Node 20 fails: `npx cap sync android` -> "The Capacitor CLI requires NodeJS >=22.0.0" (Capacitor needs Node >= 22; default node is v20.19.6). Built by main with Node 24: `PATH=$HOME/.nvm/versions/node/v24.15.0/bin:$PATH make apk`.
output/body-model-debug.apk = 20917635 bytes (final build; earlier builds 20917543 and 20917550) (`ls -l`). R3: 20971655 bytes (54112 bytes smaller).
