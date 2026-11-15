# r0-clean-slate: plan

## 1. Goal and requirements
Archive M1b and move main up to M1 plus the v5 docs. On `r0-clean-slate`, keep all M1b code, remove the "Below" button, fix Programs "Show" (sheet covering the body, hidden deep targets, and anything the reproduction finds), check in `tools/sample/`, delete `docs/REBUILD-PLAN.md`, and report real numbers.

- **R1 Archive.** Branch `m1b-archive` from the current HEAD (334862f) holds one commit with all the uncommitted M1b work: modified and untracked files, including the v5 docs, `docs/REBUILD-PLAN.md`, `tools/sample/`, `android/` (tracked set only; android/.gitignore already drops build output) and `docs/done_development/m1b-android-programs/`. It excludes `.DS_Store`, `body_model_v5_docs.tgz` and `docs/done_development/r0-clean-slate/`.
- **R2 Main.** `main` fast-forwards to 334862f (`feat/m1-body-pipeline`). It then gets one commit, "Docs: plan v5.1", with `CLAUDE.md`, `docs/PLAN.md`, `docs/SPEC.md` and `docs/PROMPTS.md` from `m1b-archive`. Nothing is pushed.
- **R3 R0 branch.** `r0-clean-slate` is cut from the new main. Every file from `m1b-archive` is checked out onto it, then `docs/REBUILD-PLAN.md` is removed. `.gitignore` gains `.DS_Store` and `*.tgz`. These changes stay uncommitted until the checkpoint.
- **R4 No Below.** The Explore view buttons are Front, Side and Back only, and the Below banner logic is gone from Explore. `Viewer.setView` accepts only `'front' | 'side' | 'back'`. `VIEWS.below` stays, used only by `setPelvicView`. The pelvic camera opens only when a Programs item whose targets are all pelvic-floor parts is selected.
- **R5 Reproduce first.** Before any fix, reproduce Show on desktop (1280×800) and at 390×844 for these items: a superficial one (`posture-correction/wall-slide`), a deep one (`posture-correction/dead-bug`, with transversus abdominis and internal oblique), a leg one (`anterior-pelvic-tilt/hamstring-curl`) and a pelvic one (`pelvic-floor/slow-holds`). For each, record whether a part turns yellow (#ffd400), whether it can be seen, and what covers it. Findings go to `plans/raw/show-repro.md` with PNGs. If the reproduction finds a defect that §4 does not cover, stop and report it.
- **R6 Shared highlight path.** One pure function, `highlightPlan`, decides what a selection resolves to. Programs uses it. It is the path the Workouts page reuses later.
- **R7 Body never covered.** While the Programs sheet is mounted, the viewer centres its projection in the part of the canvas that is not under the nav bar or the sheet (`setViewInset`). On a phone, selecting an item collapses the sheet to a 40vh peek, and a handle button toggles peek and full. A non-pelvic selection frames the target parts in the visible area (`frameIds`). Edge cases: no resolved ids → no framing; the inset is re-applied whenever the sheet's size or the window changes; unmounting resets the inset to zero.
- **R8 Deep targets visible.** When a non-pelvic selection includes a deep-muscle target, superficial muscles turn see-through (opacity 0.35) until the next selection or unmount. A pelvic selection sets the superficial opacity back to 1 before entering the pelvic view, so the pelvic view saves a clean state.
- **R9 DEV deep link.** DEV builds only: the query param `item=<itemId>`, next to the existing `seed` and `adult` params (e.g. `/?seed=male&adult=1&item=dead-bug#programs/posture-correction`), selects that item once the program detail renders. An unknown id does nothing. Production builds strip it.
- **R10 Checks.** `npm run build`, `npm test` and `npm run lint` pass. `make apk` builds, and the APK size in bytes is reported. `docs/reports/R0.md` holds screenshots and measured numbers. `docs/PLAN.md` records the changed R0 decisions.

## 2. Context for the builder
Subagent rules:
```
- Builder: do your tasks in order. Tick [x] only after the task's verify passes.
  In a parallel wave you do not tick; report the task as verified and main ticks.
- Builder: touch only the task's files. Need another file or a dependency?
  Stop and report.
- Builder: never edit a test from an earlier task to make it pass.
  If a test looks wrong, report it.
- Tester: run TEST_PLAN.md only. Record results in TEST_RESULTS.md. Fix nothing.
- All: reply to main in ≤10 lines. Details go in files.
```
Decisions from the chat:
- Keep all M1b code on the R0 branch. R0's keep list is widened, and PLAN.md records this (T5).
- Main fast-forwards to M1, and the v5 docs are committed on main. R0 work goes on `r0-clean-slate`. Nothing is pushed. Builders do not commit, with one exception: T1 makes exactly the two commits its steps list (`M1b archive…` on m1b-archive, `Docs: plan v5.1` on main). The R0 commit on `r0-clean-slate` is made by main at the checkpoint.
- No new dependencies. Screenshots come from headless Google Chrome (`/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`) driven over the DevTools protocol by a Node 24 script that uses the built-in `WebSocket` and `fetch`, with no npm package.

Repo conventions: TypeScript, two-space indentation, single quotes, small `h()` DOM helper in `src/ui/programs.ts`. `src/body/model.ts` is pure (no three.js). Tests are Vitest, next to the source, with the `mk()` fixture in `src/body/model.test.ts`. Deliberate shortcuts get a `// ponytail:` comment.

Reference code to imitate:
- `src/body/viewer.ts: flyTo` for the tween. `frameIds` generalises it, and `flyTo(id)` stays in the interface, implemented as `frameIds([id])` (Explore search keeps calling `flyTo`).
- `src/main.ts` DEV-only seed block for the `item` param pattern (`import.meta.env.DEV`).
- `src/body/model.ts: partIdsByName, layerOf, flyDistance` are reused inside `highlightPlan` and `fitDistance`.

Gotchas:
- `git add -A` in T1 must use pathspec excludes, otherwise it sweeps in `.DS_Store`, the tgz and the r0 plan folder.
- `camera.setViewOffset` must be re-applied in the viewer's `resize`, because it holds the full size.
- `setPelvicView(true)` snapshots opacities. Set the superficial opacity to 1 before calling it.
- The sheet has no max-height transition (only `transition: transform`). Do not add one: `select` measures the sheet synchronously right after toggling `peek`. A `ResizeObserver` covers later size changes; no timers.
- `npm run lint` lints `docs/`: `cdp-shot.mjs` starts with `/* eslint-disable */`.
- `make apk` needs JDK 21 and the Android SDK (both present here; it built before). If it fails, put the error output in R0.md, mark AC5 failed, and report; do not stop the other T5 steps.
- The dev server port is 5173 (Vite default). Only one task at a time runs it.

## 3. Files
| Path | Create / Change | Why |
|---|---|---|
| (git) branches `m1b-archive`, `main`, `r0-clean-slate` | Change | R1–R3 |
| .gitignore | Change | `.DS_Store`, `*.tgz` |
| docs/REBUILD-PLAN.md | Delete (on r0 branch) | R3 |
| src/body/model.ts, src/body/model.test.ts | Change | `PELVIC_FLOOR` moved here; `viewOffset`, `visibleFraction`, `fitDistance`, `highlightPlan` + tests |
| src/body/viewer.ts | Change | `setViewInset`, `frameIds`, `setView` type without below |
| src/ui/explore.ts | Change | Below button and its banner removed; imports nothing pelvic |
| src/ui/programs.ts | Change | uses `highlightPlan`, inset, peek, handle, see-through, frame, DEV `item` |
| src/style.css | Change | `.sheet.peek`, `.sheet-handle` |
| docs/done_development/r0-clean-slate/plans/raw/cdp-shot.mjs | Create | headless screenshot script (no deps) |
| docs/done_development/r0-clean-slate/plans/raw/show-repro.md, raw/repro-*.png | Create | R5 findings |
| docs/reports/r0/pixels.json | Create | measured yellow-pixel counts per checkpoint screenshot |
| docs/reports/r0/*.png, docs/reports/R0.md | Create | checkpoint report |
| docs/PLAN.md | Change | R0 row and M1b row: keep list widened, main fast-forwarded |

## 4. Interfaces
| Name | Signature | Returns | Job |
|---|---|---|---|
| `PELVIC_FLOOR` | `string[]` in model.ts | — | moved from explore.ts unchanged |
| `Inset` | `{ top: number; right: number; bottom: number; left: number }` | type | exported from model.ts |
| `viewOffset` | `(vp: { w: number; h: number }, inset: Inset) => { x: number; y: number }` | px | `x = (right-left)/2`, `y = (bottom-top)/2` |
| `visibleFraction` | `(vp, inset) => number` | 0.2–1 | `min((w-l-r)/w, (h-t-b)/h)`, clamped to ≥ 0.2 |
| `fitDistance` | `(radius: number, fovDeg: number, fraction: number) => number` | metres | `flyDistance(radius,fovDeg) / max(0.2, fraction)` |
| `highlightPlan` | `(parts: Part[], names: string[]) => { ids: string[]; missing: string[]; pelvic: boolean; layers: LayerKey[]; seeThroughSuperficial: boolean; facing: 'front' \| 'back' }` | object | the shared highlight decision |
| `Viewer.setViewInset` | `(inset: Inset) => void` | — | stores the inset; all zero → `camera.clearViewOffset()`; else `camera.setViewOffset(w,h,x,y,w,h)` with `{x,y} = viewOffset({w,h}, inset)`; `resize` re-applies the stored inset; then `request()` |
| `Viewer.frameIds` | `(ids: string[], facing?: 'front' \| 'back') => void` | — | union `Box3` of the meshes of known ids (unknown ids skipped) → bounding sphere; no known ids → return. Direction: `facing` given → horizontal `(0,0,1)` for front, `(0,0,-1)` for back; omitted → current camera direction (as `flyTo`). Distance `fitDistance(r, FOV, visibleFraction({w,h}, storedInset))`. Tween as `flyTo`. |
| `Viewer.flyTo` | `(id: string) => void` | — | `frameIds([id])` |

`highlightPlan` steps:
1. `{ids, missing} = partIdsByName(parts, names)`.
2. `pelvic = ids.length > 0 && names.every(n => PELVIC_FLOOR.includes(n))`.
3. `layers` = the distinct `layerOf` values of the resolved parts, in `LAYER_KEYS` order.
4. `seeThroughSuperficial = !pelvic && layers.includes('deepMuscles')`.
5. `facing`: `midZ` = mean of `center[2]` over all parts with `kind === 'muscle'` (0 if none). `targetZ` = mean `center[2]` of the resolved parts. `facing = ids.length > 0 && targetZ < midZ ? 'back' : 'front'` (the body faces +z).

Programs `select(prog, item, row)` steps:
1. Mark the row active and set the banner as today.
2. `plan = highlightPlan(viewer.parts, item.targets.parts)`. Warn for each missing name, then `clearHighlights()`.
3. Pelvic: `setLayerOpacity('superficialMuscles', 1)`, then `setPelvicView(true, ids)`, show the banner.
   Else: `leavePelvic()`, make each layer in `plan.layers` visible, then `setLayerOpacity('superficialMuscles', plan.seeThroughSuperficial ? 0.35 : 1)`.
4. Colour each id `#ffd400` at level 1.
5. If `matchMedia('(max-width: 899px)')` matches, add `peek` to the sheet. Then call `applyInset()` synchronously (it measures the sheet right away).
6. Non-pelvic with ids → `viewer.frameIds(ids, plan.facing)`. Then `row.scrollIntoView({ block: 'nearest' })`.

Inset (`applyInset()`): called at mount, by a `ResizeObserver` on the sheet, by a window `resize` listener and by `select`/the handle. `topCover` = the largest `getBoundingClientRect().bottom` among `.nav` and `.explore .toolbar`, counting only elements that are displayed (`offsetParent !== null`). Phone (< 900 px): `{top: topCover, bottom: innerHeight - sheetRect.top, left: 0, right: 0}`. Wide (≥ 900 px): `{top: topCover, right: innerWidth - sheetRect.left, bottom: 0, left: 0}`. Then `viewer.setViewInset(inset)`. The inset applies the whole time the sheet is mounted.

Handle: `<button class="sheet-handle" type="button">` is the first child of the sheet. Its `aria-label` is "Collapse list" when the sheet is full and "Expand list" when peeked. Clicking it toggles `peek` and calls `applyInset()`. It replaces `.sheet::before` (remove that rule), looks the same (40×4 px bar inside a 44 px tall touch target), and is hidden at ≥ 900 px. CSS: `.sheet` keeps `max-height: 60vh`; `.sheet.peek { max-height: 40vh; }`. A short sheet may be shorter than either. No max-height transition.

Dispose, in order: disconnect the observer and remove the resize listener; `clearHighlights()`; `setPelvicView(false)` (+ `setView('front')` if it was pelvic); `setLayerOpacity('superficialMuscles', 1)`; `setViewInset({top:0,right:0,bottom:0,left:0})`; empty the root.

Explore (R4): the view loop is `['front','side','back']`. Each button keeps calling `viewer.setPelvicView(false)` before `viewer.setView(v)` (needed when Programs left the pelvic view on). Remove the `.banner` element and every `banner` line from explore.ts (only Below used it). Explore imports nothing pelvic. `?view=` handling is unchanged.

Highlight glow (T4 finding: from behind the lit yellow renders at about (110, 95, 3)): `setPartColor(id, color, level)` also sets the material's `emissive` to `mixColor(0x000000, colorNumber(color), level * 0.35)`; `clearHighlights()` resets every `emissive` to `0x000000`. The yellow rule in cdp-shot stays as it is.

Scroll margin (T4 finding): `.item { scroll-margin-top: 64px; }` so `scrollIntoView` keeps the active row below the sticky banner.

`topCover` displayed test (T4 finding: `.nav` is `position: fixed`, so `offsetParent` is always null): an element counts when `getComputedStyle(el).display !== 'none'` and it has no `hidden` ancestor (`!el.closest('[hidden]')`), not `offsetParent`.

Wide peek (T4, accepted): at ≥ 900 px `.sheet.peek { max-height: none; }`.

Toolbar at ≥ 900 px (T2 defect 6): inside the existing `@media (min-width: 900px)` block add `body:has(.programs-root:not(:empty)) .explore .toolbar { right: 420px; }` so the sheet no longer hides the search box.

Duplicate banner (T2 defect 7): in `showDetail`, skip any `prog.notes` entry whose text equals the sticky banner's text (`The body shown is male anatomy.`); the sticky banner stays the single place it shows.

DEV `item`: in `showDetail`, after rendering, `if (import.meta.env.DEV)`, read `new URLSearchParams(location.search).get('item')`. Find the `li[data-item="<id>"]` (every item `li` gets `dataset.item = item.id`) and call `select`. Unknown id → nothing.

`raw/cdp-shot.mjs` (first line `/* eslint-disable */`, Node 24 built-ins only). Usage: `node cdp-shot.mjs <url> <out.png> <width> <height> [js] [wait-ms]`.
1. Start Chrome with `--headless=new --remote-debugging-port=9333 --use-angle=swiftshader --enable-unsafe-swiftshader --hide-scrollbars --window-size=W,H --user-data-dir=<fresh tmp dir>`; poll `http://127.0.0.1:9333/json/version` until ready; open a page target; `Emulation.setDeviceMetricsOverride` W×H, deviceScaleFactor 1, `mobile: W < 900`.
2. Navigate; wait for load, then wait-ms (default 8000). If `document.querySelector('.load-error')` exists or no `canvas` exists, print `{"error":"webgl"}`, kill Chrome, exit 2.
3. If `js` is given, evaluate it (awaitPromise), keep its result, wait 1500 ms.
4. `Page.captureScreenshot` → write the PNG.
5. Measure in the page: load the PNG (data URL) into an `Image`, draw it on a 2D canvas, and sample every 4th pixel in x and y. A sample counts as yellow when `r > 120 && g > 90 && b < 60 && r - b > 100` (the lit #ffd400 renders at about (144–172, 114–140, 0–11); measured in T2). It counts as visible yellow when `document.elementFromPoint(x, y)` is a `CANVAS`.
6. Print one JSON line, `{"png", "yellow", "yellowVisible", "js"}`, kill Chrome, and exit 0.

Item → program URL map (use these everywhere):
| item | program id | short name |
|---|---|---|
| wall-slide | posture-correction | wall |
| dead-bug | posture-correction | deep |
| hamstring-curl | anterior-pelvic-tilt | leg |
| slow-holds | pelvic-floor | pelvic |

## 5. Data models / schemas
No data file changes. `programs.json` is untouched.
`docs/reports/r0/pixels.json`: `{ "<png file name>": { "yellow": n, "yellowVisible": n } }` for every `show-*.png`, copied from the cdp-shot output.

## 6. Decisions and things to avoid
| Decision | Reason |
|---|---|
| Projection offset (`setViewOffset`), not a smaller canvas | keeps one WebGL canvas; works for the phone sheet and the wide side panel |
| Inset top includes the Explore toolbar | the toolbar stays over the canvas on the Programs route |
| Frame posterior targets from behind (`facing`) | hamstrings and back muscles are not visible from the front |
| Superficial layer at 0.35, layer-wide | the viewer has per-layer opacity only; a yellow target at 0.35 still reads |
| 40vh peek on Show | the body band becomes about 460 px of 844 at 390×844 |
| Pure helpers in model.ts | engine/data rule: logic is tested without three.js |
| No DOM test library; pixel counts from screenshots | no new dependency; "visible" = yellow pixel whose top element is the canvas |

Avoid: new npm packages; editing `programs.json`; touching `tools/pipeline/`; pushing; commits beyond T1's two; a timer-based inset; a max-height transition.

## 7. Allowed dependencies
None. Tools already on this machine: Google Chrome, Node 24, JDK 21, Android SDK.

## 8. Tasks
- [x] T1: git restructure per R1–R3. Run these steps in order and stop at the first that fails (report its output; run nothing after it). Steps: `git switch -c m1b-archive`; `git add -A -- . ':!.DS_Store' ':!body_model_v5_docs.tgz' ':!docs/done_development/r0-clean-slate'`; `git commit -m "M1b archive: Android, profile, Programs, v5 docs"`; `git switch main`; `git merge --ff-only feat/m1-body-pipeline`; `git checkout m1b-archive -- CLAUDE.md docs/PLAN.md docs/SPEC.md docs/PROMPTS.md`; `git commit -m "Docs: plan v5.1"`; `git switch -c r0-clean-slate`; `git checkout m1b-archive -- .`; `git rm -qf docs/REBUILD-PLAN.md` (-f because the checkout staged it; the file stays on m1b-archive); append `.DS_Store` and `*.tgz` lines to `.gitignore`. These two commits are allowed (§2) | size: M | wave: 1 | files: git, .gitignore, docs/REBUILD-PLAN.md | verify: `git branch --show-current` → `r0-clean-slate`; `git log --format=%s -1 m1b-archive` → starts `M1b archive`; `git log --format=%s main -2` → `Docs: plan v5.1` then starts `M1: body pipeline`; `test ! -e docs/REBUILD-PLAN.md`; `git diff --cached --name-only m1b-archive -- src | wc -l` → 0
- [x] T2: reproduce Show (R5) before any code change: write `raw/cdp-shot.mjs` (§4); start `npm run dev` in the background (port 5173); for each item in the §4 map at 1280×800 and 390×844, run cdp-shot on `http://localhost:5173/?seed=male&adult=1#programs/<program id>` with js `document.querySelectorAll('.item-head')[i].click()` (i = the item's index in that program's `items` in programs.json), saving `raw/repro-<short>-<width>.png`. Write `raw/show-repro.md`: one row per item × width with yellow, yellowVisible, what covers the targets (from looking at the PNG), plus any other defect seen. If WebGL fails (exit 2), stop and report. Stop the dev server | size: L | wave: 2 | files: docs/done_development/r0-clean-slate/plans/raw/* | verify: `ls docs/done_development/r0-clean-slate/plans/raw/repro-*.png | wc -l` → 8; `test -s docs/done_development/r0-clean-slate/plans/raw/show-repro.md`
- [x] T3: test first, then code. Add the `model.ts` helpers from §4, with tests in `model.test.ts` under `describe('viewOffset')`, `describe('visibleFraction')`, `describe('fitDistance')` and `describe('highlightPlan')`, one `it` per case: viewOffset (390×844, inset {top:44,right:0,bottom:338,left:0} → {x:0,y:147}; 1280×800, inset {top:44,right:420,bottom:0,left:0} → {x:210,y:-22}); visibleFraction (first case → 462/844 to 4 dp; second → 0.671875; 390×844 with {top:44,right:0,bottom:900,left:0} → 0.2); fitDistance (r=0.1, fov 30, 0.5 → 2 × flyDistance(0.1,30); fraction 0.05 → 5 × flyDistance(0.1,30)); highlightPlan with a fixture (`mk` plus centers: superficial `left rectus abdominis` center z 0.10, deep `transversus abdominis` z 0.08, deep `pubococcygeus` z 0.0, superficial `left gluteus maximus` z -0.10, bone `left femur` z 0): deep only → layers ['deepMuscles'], seeThrough true, pelvic false; `rectus abdominis` → [its id], seeThrough false, facing 'front'; `gluteus maximus` → facing 'back'; the full PELVIC_FLOOR list (only pubococcygeus present) → pelvic true, seeThrough false, missing = the 4 absent names; [] → ids [], pelvic false, facing 'front'; ['nope'] → missing ['nope']. Move `PELVIC_FLOOR` to model.ts; explore.ts re-exports it until T4 | size: M | wave: 3 | files: src/body/model.ts, src/body/model.test.ts, src/ui/explore.ts | verify: `npx vitest run src/body/model.test.ts` → all pass; `npx tsc --noEmit` → exit 0
- [x] T4: fixes R4, R7, R8, R9 per §4 in viewer, explore, programs and style. Read `raw/show-repro.md` first; any defect it lists that §4 does not cover → stop and report. Also apply the highlight glow, scroll margin, `topCover` displayed test, toolbar and duplicate-banner fixes and change the yellow rule in `raw/cdp-shot.mjs` step 5 (§4). Remove the re-export of PELVIC_FLOOR from explore.ts and import it from model.ts in programs.ts | size: L | wave: 4 | files: src/body/viewer.ts, src/ui/explore.ts, src/ui/programs.ts, src/style.css, docs/done_development/r0-clean-slate/plans/raw/cdp-shot.mjs | verify: `npm run build && npm test && npm run lint` → exit 0; `grep -c "'below'" src/ui/explore.ts src/body/viewer.ts` → 0 for both; with `npm run dev` running, `node docs/done_development/r0-clean-slate/plans/raw/cdp-shot.mjs "http://localhost:5173/?seed=male&adult=1&item=dead-bug#programs/posture-correction" <scratch png> 390 844` and the same for hamstring-curl/anterior-pelvic-tilt → `yellowVisible` ≥ 50 in both; stop the dev server
- [x] T5: checkpoint material. Run `make apk` and record `stat -f %z output/body-model-debug.apk` as "<n> bytes" in R0.md. Run `npm run build` and record the `dist/` asset sizes from its output. Run `npm test` and record the counts. With `npm run dev` running, take screenshots with cdp-shot into `docs/reports/r0/`: explore-390.png (`/?seed=male#`), programs-list-390.png (`/?seed=male#programs`), and `show-<short>-390.png` for all four items in the §4 map (`/?seed=male&adult=1&item=<item>#programs/<program id>`), plus show-deep-1280.png at 1280×800. Write their counts to `docs/reports/r0/pixels.json` (§5). Write `docs/reports/R0.md`: what changed, a before/after table (show-repro.md rows vs pixels.json), the numbers, the screenshots, and the decisions changed. Update `docs/PLAN.md`: the R0 row's result text contains the exact phrase `all M1b code kept`, and the M1b row says main was fast-forwarded to M1 | size: M | wave: 5 | files: docs/reports/R0.md, docs/reports/r0/*, docs/PLAN.md | verify: `ls docs/reports/r0/*.png | wc -l` → 7; `grep -E "[0-9]{6,} bytes" docs/reports/R0.md` → a match; `grep -E "R0.*all M1b code kept" docs/PLAN.md` → a match

## 9. Out of scope
R1+ work; the female body; `tools/pipeline/`; Play Store `make aab` (needs a keystore); pushing; failures already listed in BASELINE.md.

## 10. Acceptance criteria
- AC1: Branches are as described in R1–R3, and nothing excluded is committed.
- AC2: `npm run build`, `npm test` and `npm run lint` pass. The new model helper tests pass.
- AC3: Explore has no Below button. The pelvic view appears only from a pelvic program item.
- AC4: At 390×844, every shown item's yellow targets are visible (yellowVisible ≥ 50 in pixels.json for all four 390 shots and the 1280 shot). Deep targets show through the superficial muscles.
- AC5: `make apk` builds, and the APK size in bytes is in R0.md.
- AC6: `tools/sample/` is present as given, and `docs/REBUILD-PLAN.md` is gone.
- AC7: R0.md exists with screenshots and measured numbers. PLAN.md records the changed keep list.

## 11. Open questions
None.

## 12. Changelog
| When | Change | Why |
|---|---|---|
| 2026-11-15 10:20 | Critic round 1: added `facing` to highlightPlan/frameIds; inset top includes the Explore toolbar; `applyInset()` called synchronously after peek; no max-height transition; cdp-shot gets `--enable-unsafe-swiftshader`, a WebGL check, pixel counting and `eslint-disable`; item→program map and PNG names; Explore keeps `setPelvicView(false)` and drops the banner; flyTo = frameIds([id]); exact test names and inputs; T1 commit exemption and stop rule, sized M; repro moved to its own wave before any code change (now T2, sized L), model helpers now T3; T4 verify checks pixels; T5 adds the wall shot and pixels.json; make apk failure rule | Plan critic listed 18 gaps |
| 2026-11-15 10:20 | Branch: main does not create `feat/r0-clean-slate`; T1 creates `r0-clean-slate` | user chose a milestone-named branch; T1 must archive first |
| 2026-11-15 10:30 | T1: `git rm -qf` instead of `git rm -q` for REBUILD-PLAN.md | the preceding checkout stages it, so plain rm refuses; the archive keeps the file |
| 2026-11-15 10:45 | After T2: yellow rule loosened to `r>120 && g>90 && b<60 && r-b>100` (T4 edits cdp-shot.mjs); T4 also fixes the toolbar hidden under the sheet at ≥ 900 px and the duplicate male-anatomy banner | T2 defects 1, 6, 7 (raw/show-repro.md) |
| 2026-11-15 11:05 | T4 round 2: emissive glow on highlights (instead of loosening the pixel rule again), `.item` scroll-margin-top 64px, `topCover` uses computed display not offsetParent, accepted `.sheet.peek {max-height:none}` at ≥ 900 px | T4 report: leg-390 yellowVisible 15, pelvic-390 47; row under sticky banner; nav never counted |
