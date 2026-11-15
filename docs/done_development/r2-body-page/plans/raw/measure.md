# R2 measurements (T9)

Environment: headless Chrome (new headless), software GL (SwiftShader/ANGLE), 1440x900, deviceScaleFactor 1, Vite DEV server (unminified, port 5200). These are software-rendered numbers, not a phone or a GPU; use them only for relative comparison. Phone numbers are a manual check.

| Measure | Skin | Outer |
|---|---|---|
| Body load time (console line, male, depth set by URL) | 2856 ms | 3054 ms |
| fps (`?fps=1` overlay, sampled 5 x 1 s after 12 s settle) | 5, 5, 5, 5, 6 | 4, 4, 4, 4, 4 |

APK (`make apk`, debug): output/body-model-debug.apk = 20,067,991 bytes (19.1 MiB).

Screenshots: 27 PNG in docs/reports/r2/ (24 Body: widths 390/768/1440 x male/female x skin/outer/5/bones; plus programs-390 (hamstring-curl, anterior-pelvic-tilt), list-390 (outer, open=list), card-390 (Long head of biceps brachii)).

## Look at the 390 shots (390-male-outer, 390-female-bones, list-390, card-390, programs-390)
- Nothing broken: body renders, no load error, no UI covering the body in the default view.
- Labels are truncated with an ellipsis ("Sternocostal head of...", "External abdomina...") at 390 wide. Cosmetic.
- list-390: the open list sheet covers most of the body (only head and shoulders visible); the Depth slider is scrolled partly under the sheet header. Expected for an open list, but the body is mostly covered, against "body never covered by UI".
- card-390: the camera zooms in and both biceps heads highlight in yellow; card sits below the body. OK. The Skin tone circle row overlaps the face area at the top (small).
- programs-390: hamstrings highlighted yellow from behind, labels shown, item card and Show button visible; sheet covers lower legs partly. OK.
- 390-female-bones: female skeleton and organs render, skin shown as faint see-through outline. OK.
- Yellow-pixel counts from the script: list-390 and 390-male-skin have 0 visible yellow, as expected (nothing selected).

## Main session check (built-in browser)
Real GPU: ANGLE Metal, Apple M4 Pro. The pane was hidden, so frame timing is throttled and not reported. Phone fps and load time remain the manual check M4.
