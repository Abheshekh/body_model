# m1-body-pipeline: test plan

## Automated tests
| ID | AC | Command (from repo root) | Input | Expected output | Exit code |
|---|---|---|---|---|---|
| A1 | AC7 | `npm run lint` | repo | no errors | 0 |
| A2 | AC7 | `npm test` | repo | regex: `Tests\s+\d+ passed` and no `failed` | 0 |
| A3 | AC7 | `npm run build` | repo | regex: `built in` | 0 |
| A4 | AC2,AC3,AC4,AC7 | `npm run test:pipeline 2>&1` | committed outputs + config | regex: `(?m)^OK$` | 0 |
| A5 | AC2 | `npx vitest run src/body/data.test.ts` | parts.json | all pass | 0 |
| A6 | AC5 | `npx vitest run src/body/model.test.ts` | — | all pass (layerOf, searchParts edge cases, mixColor clamping, parseLayersParam) | 0 |
| A7 | AC3 | `tools/pipeline/.venv/bin/python -I -c "import json;d=json.load(open('public/data/parts.json'));print(d['triangles']<=420000, len(d['parts']))"` | parts.json | regex: `^True \d{3}$` | 0 |
| A8 | AC2 | `tools/pipeline/.venv/bin/python -I -c "import json;n={p['name'] for p in json.load(open('public/data/parts.json'))['parts'] if p['kind']=='organ'};print('wall of heart' in n,'pancreas' in n)"` | parts.json | `True True` | 0 |
| A9 | AC3 | `ls -l public/data/body.glb` | — | size ≤ 10485760 bytes | 0 |
| A10 | AC6 | `grep -c "BodyParts3D" public/data/credits.json` | — | regex: `^[1-9]` | 0 |
| A11 | AC1 | `git check-ignore tools/pipeline/cache tools/pipeline/.venv` | — | both paths printed | 0 |

## AC → tests
| AC | Tests |
|---|---|
| AC1 | A11, M1 |
| AC2 | A4, A5, A8 |
| AC3 | A4, A7, A9 |
| AC4 | A4 |
| AC5 | A6, M2–M6 |
| AC6 | A10, M7 |
| AC7 | A1–A4 |
| AC8 | M8 |
| AC9 | M9, M10 (numbers recorded after these) |

## Manual checks (not run by tester)
| ID | AC | What to check | How | Passes when |
|---|---|---|---|---|
| M1 | AC1 | Clean pipeline run | `rm -rf tools/pipeline/cache && npm run pipeline` | exits 0, cache holds only the selected STLs (`ls tools/pipeline/cache/BodyParts3D/assets/BodyParts3D_data/stl \| wc -l` ≈ selected part count, not 934) |
| M2 | AC5 | Views | `npm run dev`, click Front/Side/Back | camera matches each preset; side shows the body's left |
| M3 | AC5 | Layers | toggle each of the 5 | only that layer's parts appear/disappear; skin covers the body; organs visible inside the trunk with muscles off |
| M4 | AC5 | Tap card | tap the biceps; then drag the view | card shows "Biceps, left" or "…right" + anatomical name; a drag never opens the card; an empty tap closes it |
| M5 | AC5 | Search + fly | type "pectoralis major", Enter; type "zzz" | camera flies to the chest, part turns yellow, card opens; "zzz" shows "No match" |
| M6 | AC5 | Highlight API | console: `bodyModel.setPartColor('<a biceps id>', '#ff0000', 0.5)`, then `bodyModel.setPartColor('nope','#f00',1)`, then `bodyModel.clearHighlights()` | half-red biceps; `false` + warning; colour restored |
| M7 | AC6 | Credits | click Credits in the footer | verbatim licence text, Back works |
| M8 | AC8 | Matches the preview | compare `docs/reports/m1/front.png`/`back.png` with `docs/preview/body-1-front-back.png` | same shape, no missing limbs, hands, feet or head |
| M9 | AC9 | Desktop numbers | `npm run build && npx vite preview --host`, open `http://localhost:4173/?fps=1` in Chrome | record fps and load time in M1.md |
| M10 | AC9 | Android over LAN | same server, phone on the same Wi-Fi opens `http://192.168.1.6:4173/?fps=1` | record phone model, fps, load time in M1.md; target ≥ 30 fps |
