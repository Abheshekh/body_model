# r2-body-page: plan

## 1. Goal and requirements
The Body page from the sample (`tools/sample/viewer.html`), rebuilt as app code on the R1 data (`public/data/body/`), for both sexes, on phone, tablet and desktop. An app shell with three pages: Body, Workouts, Me. The M1 viewer and data are removed. Programs keep working on the new body.

- **R1 Loader** (`src/body/load.ts`): `loadManifest()`, `loadPack(pack)`. Fetch from `${BASE_URL}data/body/`. Gzip sniff: bytes start `1f 8b` → `DecompressionStream('gzip')`, else use as is (Vite and some servers already decode). First-load packs load in parallel at start; demand packs load on first need (a system toggled on, or a part selected from that pack) and only once. A failed fetch shows "Could not load the body: <reason>" and the page stays usable.
- **R2 State rules** (`src/body/state.ts`, pure, no three.js, tested): see §4 `visibility`. Depth steps: `skin`, 1…6, `bones`. Systems: organs, heart (Heart and vessels), nerves (Brain and nerves), lymph, joints (Ligaments and cartilage), skeleton. Defaults: depth `skin`, systems organs + skeleton on, see-through off, ghost on, colour natural, hidden = defaultHidden ids, isolate none, sex from the profile.
- **R3 Renderer** (`src/body/scene.ts`, `src/body/materials.ts`): one `THREE.Mesh` per pack. Positions as normalized `Uint16` attributes decoded in the vertex shader with the manifest box; normals, fibre as normalized `Int8`; `acr` Int16; `ao` Uint8 normalized; `mid` as a float attribute. Sex switch swaps `posM/posF` and `nrmM/nrmF` (both kept in memory). A per-part state texture (64×64 RGBA8, index = part id; R8 may add parts up to 4,096) holds visibility (hidden/shown/ghost), highlight and colour-mode colour; the vertex shader collapses hidden vertices. Materials per SPEC §1.4 ported from the sample's `tissueMat`, including fibre striation from `fib`/`acr`, baked AO, studio key + rim + fill, room environment, ACES, teal backdrop, contact shadow. Skin tone swatches light / medium / dark. Render on demand (only when something changed), as M1.
- **R4 Picking and labels** (`src/body/pick.ts`, `src/body/labels.ts`): GPU id pass at reduced size into a render target; tap → part id. Labels: per visible part pixel area and nearest-own-pixel anchor; top 14 (≥ 760 px) or 6 (< 760 px) as left/right columns with leader lines; redrawn 140 ms after the camera stops; tap a label to select. As the sample's `renderIds`/`drawLabels`.
- **R5 Body page UI** (`src/ui/body/`): top bar (sex switch, skin tone, see-through, ghost, colour mode with legend, labels toggle, list button); depth slider (Skin, Outer, 2…6, Bones); systems toggles; list with tabs (Muscles, Organs, Bones, Vessels, Nerves, Lymph, Ligaments), grouped (muscles and bones by region, others by system), search across all, peeled rows dimmed; part card (name, kind, region, side, layer or system, "simplified" note, facts with sources, Isolate, Hide, Zoom to it, Show hidden); selecting from the list peels to the part's layer or turns its system on, then zooms. Phone (< 760 px): bottom sheet collapsed to the depth slider, opens to 72% height; canvas sized above the collapsed sheet; compact scrolling top bar; no title. The body is never covered by UI when the sheet is collapsed.
- **R6 Facts** (`public/data/facts.json`): 100 parts (major muscles, organs, bones) keyed by plain name (applies to both sides), 2–4 short facts each, each fact with `source {title, url}`. Sources: OpenStax *Anatomy and Physiology 2e* chapter pages only (licence as stated on the pages: CC BY-NC-SA 4.0; facts are our own short paraphrases with a citation, no text copied), each URL checked to return HTTP 200 with curl. Education wording, no diagnosis, no treatment advice. A `sources` field at the top.
- **R7 App shell** (`src/main.ts`, `src/ui/shell.ts`): bottom tab bar on phone, top bar on wide: Body (default), Workouts, Me. Hash routes `#body`, `#workouts`, `#workouts/programs[/<id>]`, `#me`, `#me/credits`. The body viewer is created once and kept (never re-created). Workouts page: a list of what is coming (Exercise library — R5, Task builder — R5, Move — R3) and the working Programs entry. Me page: the profile form from M1b (`src/ui/profile.ts`) plus a Credits link. First launch with no profile shows the profile form (as today).
- **R8 Remove M1**: delete `src/ui/explore.ts`, `src/body/viewer.ts`, `public/data/body.glb`, `public/data/parts.json`, the M1 pipeline (`tools/pipeline/build.py`, `classify.py`, `config.json`, `plain_names.json`, `test_classify.py`, `test_output.py`), and point `npm run pipeline` / `test:pipeline` at v5. Credits screen reads `data/body/credits.json` (replaces `public/data/credits.json`, deleted).
- **R9 Programs on the new body**: `programs.json` target names become R1 plain names (e.g. `serratus anterior` → `Serratus anterior muscle`); `src/programs/data.test.ts` resolves every target against `public/data/body/manifest.json`. `src/ui/programs.ts` uses the new viewer: highlight ids yellow with glow, peel to the deepest needed depth (min layer of the targets) instead of see-through, frame targets (front/back facing as R0), keep the R0 view inset, peek sheet and handle. Pelvic items: depth `bones` with the pelvic-floor muscles shown (isolate-like set), camera from below, as R0. Banner rules unchanged. Programs show on the body of the profile's sex.
- **R10 Checks**: screenshots at 390×844, 768×1024, 1440×900, both sexes, at Skin, Outer, Deep (layer 5), Bones (24 PNGs); desktop fps and load time measured; phone fps and load time are a manual check for the user (no device connected). `npm run build`, `npm test`, `npm run lint` pass; `make apk` builds.

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
- User approved running R1–R7 back to back; no review stop. No new dependencies (three 0.187 is installed; use `three/addons` for OrbitControls and RoomEnvironment).
- Branch `r2-body-page` (from `r1-body-pipeline`). Builders don't commit.
- Phone first: check every screen at 390×844. The body is never covered by UI (collapsed sheet).
- Medical wording: education only; every fact on screen has a source. Nothing personal leaves the device.

Repo conventions: TypeScript strict, two-space indentation, single quotes, small DOM helper `h()` as in `src/ui/programs.ts`, Vitest tests next to the source, `// ponytail:` comments for deliberate shortcuts. `src/body/state.ts` and `src/body/load.ts` (parsing parts) stay free of three.js so they test in Node.

Reference code: `tools/sample/viewer.html` (materials `tissueMat`, state texture, `applyState`, list, card, `select`, `focusOn`, `renderIds`, `drawLabels`, `setView`, phone sheet CSS). `src/body/viewer.ts` (M1: render on demand, tween `frameIds`, `setViewInset`, emissive glow) is deleted in T7 — read it before T3 to carry those features over. `src/body/model.ts` keeps its pure helpers; `highlightPlan` changes in T8 to the new Part type. `tools/pipeline/v5/FORMAT.md` is the data contract (`defaultHidden` included).

Gotchas:
- Vite serves `.gz` with `Content-Encoding: gzip`, so `fetch` already gives decoded bytes there; Capacitor on Android does not. Always sniff `1f 8b`.
- Keep one WebGL context for the whole app; pages hide, the viewer stays.
- Dev server for screenshots: port 5200 (`npx vite --port 5200 --strictPort`), one task at a time, stopped afterwards. Screenshot script: copy `docs/done_development/r0-clean-slate/plans/raw/cdp-shot.mjs` to `tools/shots/cdp-shot.mjs` (T9).
- `?fps=1` shows an fps overlay (keep from M1). DEV-only `?seed=male|female&adult=1` profile seed stays.

### 2b. Clarifications (binding; critic round 1)
1. **Order.** M1 files are deleted only after Programs run on the new body (T8b). T7 does not delete anything.
2. **Routes.** T7 owns `parseRoute` and its `Route` type in `src/programs/programs.ts` and rewrites `src/programs/programs.test.ts` for the new routes: `#body` (default, also `#`), `#workouts`, `#workouts/programs`, `#workouts/programs/<id>`, `#me`, `#me/credits`. Unknown hash → body. T7 also changes the back link in `src/ui/programs.ts` to `#workouts/programs` (that line only).
3. **Isolate is a set.** `BodyState.isolate: Set<number> | null`. Rule 2 becomes: isolate set → a part is shown if its id is in the set, or if it is a bone and `skeleton` is on (context); everything else hidden (skin too). Pelvic view = isolate the pelvic-floor ids with skeleton on; the viewer draws bones at 25% opacity while an isolate is active. (T2b.)
4. **Groups by plain name.** List rows, select, Hide, Isolate, Zoom and the card act on every id that shares the plain name (left + right). `idsOfPlain(m, plain): number[]` in state.ts. Facts are keyed by plain name.
5. **Types.** `Part`, `Manifest`, `PackData` live in `load.ts`; `state.ts` imports them (T2b removes its local copies).
6. **PackData** = `{ idx: Uint32Array; posM: Uint16Array; posF: Uint16Array; nrmM: Int8Array; nrmF: Int8Array; fib: Int8Array; acr: Int16Array; mid: Uint16Array; ao: Uint8Array }` (views into the decompressed buffer). T2b aligns load.ts if T1 differs. `mid` becomes a non-normalized float attribute.
7. **Initial state** = T2's `defaultState(m, sex)`.
8. **State texture** 64×128 RGBA8. Texel (id % 64, floor(id / 64)) in rows 0–63: R = visibility (0 hidden, 1 shown, 2 ghost), G = highlight (0/255), B = 255 when the part is in the isolate set, A unused. Same texel + 64 rows: RGB = colour-mode colour (layer or system colour). Highlight colour is one uniform (#ffd400).
9. **Bounds.** scene.ts decodes positions on the CPU once per sex to compute a `THREE.Box3` per part; `viewer.bounds(id): Box3 | null`; meshes use `frustumCulled = false`. Facing for programs: centre z of the targets' union box vs the body box centre z (T8 changes `highlightPlan` to take a `centreZ(id)` function instead of `Part.center`).
10. **Factory.** `createBodyViewer(canvas: HTMLCanvasElement, opts: { fps: boolean }): Promise<BodyViewer>` loads the manifest and first-load packs and resolves after the first frame. On failure it appends `<div class="load-error">Could not load the body: <reason></div>` to the canvas parent and rejects. `viewer.manifest` exposes the manifest. `pick(x, y): number | null` (part id). `onChange(cb)` fires after any state, selection or highlight change. The first frame logs `Body load time: <n> ms` with `console.info`.
11. **DEV hooks** (stripped from production by `import.meta.env.DEV`): `window.bodyViewer = viewer`; query params `depth=skin|outer|1..6|bones`, `sex=male|female` (view sex, not the profile), `open=list|card`, `part=<plain name>` applied once at load. `seed`, `adult`, `item`, `fps` stay.
12. **Screenshot script.** T4a copies `docs/done_development/r0-clean-slate/plans/raw/cdp-shot.mjs` to `tools/shots/cdp-shot.mjs`; later tasks use it.
13. **Screenshot names**: `<w>-<sex>-<depth>.png` with depth in `skin|outer|5|bones`.
14. **Program target names.** Map to manifest plain names. `puborectalis` → `Pubo-analis muscle` (closest Z-Anatomy part of the levator ani; record the mapping in a data.test.ts comment and in R2.md). `multifidus` → all manifest parts whose plain name contains "multifidus". Left/right targets collapse to one plain name (both sides highlight; programs are bilateral). `PELVIC_FLOOR` in model.ts uses the new plain names.
15. **Banner.** The female body now exists. Programs show on the profile's sex. The note/banner "The body shown is male anatomy." is replaced, for female profiles, by "Female anatomy here is adapted from the male model; pelvic organs are simplified." and removed for male profiles on all-audience programs. T8 updates programs.json notes and data.test.ts accordingly.
16. **Programs and Body state.** Programs snapshot the viewer's BodyState on mount and restore it on dispose. Programs set the view sex to the profile's sex while mounted.
17. **Sex switch.** The Body page sex switch is a view toggle initialised from the profile; it does not write the profile. Sex-only parts follow the viewed sex. T10 updates SPEC §1A ("follow the viewed sex"; facts keyed by plain name).
18. **Credits.** The Credits screen lists `data/body/credits.json` (an array of sources) and `facts.json` `sources` (OpenStax A&P 2e, CC BY-NC-SA 4.0 as stated, facts paraphrased). T8b.
19. **Split.** T4 → T4a (core scene) + T4b (interactions); T6 → T6a (page, sheet, top bar, depth, systems, legends) + T6b (list, card, facts, isolate/hide/zoom/show hidden). New T2b and T8b. See §8.

## 3. Files
| Path | Create / Change / Delete | Why |
|---|---|---|
| src/body/load.ts, load.test.ts | Create | R1 |
| src/body/state.ts, state.test.ts | Create | R2 |
| src/body/scene.ts, materials.ts | Create | R3 |
| src/body/pick.ts, labels.ts | Create | R4 |
| src/ui/body/*.ts | Create | R5 |
| src/style.css | Change | R5, R7 |
| public/data/facts.json, src/body/facts.test.ts | Create | R6 |
| src/main.ts, src/ui/shell.ts, src/ui/workouts.ts, src/ui/me.ts, src/ui/credits.ts | Create / Change | R7 |
| src/ui/explore.ts, src/body/viewer.ts, public/data/body.glb, public/data/parts.json, public/data/credits.json, tools/pipeline/{build.py,classify.py,config.json,plain_names.json,test_classify.py,test_output.py} | Delete | R8 |
| package.json | Change | pipeline scripts → v5 |
| public/data/programs.json, src/programs/data.test.ts, src/ui/programs.ts, src/body/model.ts, src/body/model.test.ts | Change | R9 |
| tools/shots/cdp-shot.mjs, docs/reports/r2/*.png, docs/reports/R2.md | Create | R10 |
| docs/PLAN.md, docs/SPEC.md | Change | decisions changed |

## 4. Interfaces
| Name | Signature | Job |
|---|---|---|
| `Part` (load.ts) | manifest part fields as FORMAT.md | |
| `Manifest` | FORMAT.md | |
| `loadManifest()` | `() => Promise<Manifest>` | fetch + validate version 1 |
| `isGzip(b)` | `(b: Uint8Array) => boolean` | first bytes 0x1f 0x8b |
| `loadPack(m, name)` | `(Manifest, string) => Promise<PackData>` | typed arrays per `arrays`; cached promise per name |
| `Depth` | `'skin' \| 1 \| 2 \| 3 \| 4 \| 5 \| 6 \| 'bones'` | |
| `SystemKey` | `'organs' \| 'heart' \| 'nerves' \| 'lymph' \| 'joints' \| 'skeleton'` | |
| `systemOf(p)` | `(Part) => SystemKey \| 'muscle' \| 'skin'` | organ with system Heart → heart; vessel → heart; nerve → nerves; lymph → lymph; joint → joints; bone → skeleton; other organ → organs; muscle/tendon → muscle; skin → skin |
| `BodyState` | `{ sex: 'male'\|'female'; depth: Depth; systems: Set<SystemKey>; hidden: Set<number>; isolate: number \| null; seeThrough: boolean; ghost: boolean; colour: 'natural'\|'layer'\|'system' }` | |
| `visibility(p, s)` | `(Part, BodyState) => 'shown' \| 'ghost' \| 'hidden'` | rules below |
| `packsNeeded(s, m)` | `(BodyState, Manifest) => string[]` | pack names whose parts can be visible |
| `revealFor(p, s)` | `(Part, BodyState) => BodyState` | state that makes p shown: muscle → depth = p.layer; system part → system on; depth skin → Outer; remove from hidden |
| `BodyViewer` (scene.ts) | `parts, state, setState(patch), select(id\|null), frameIds(ids, facing?), setViewInset(inset), setHighlight(ids, colour), clearHighlight(), pick(x,y), onChange(cb), setView('front'\|'side'\|'back'\|'below')` | one instance for the app |

`visibility(p, s)` rules, in order:
1. `p.sex !== 'both' && p.sex !== s.sex` → hidden.
2. `s.isolate !== null` → shown if `p.id === s.isolate`, else hidden.
3. `s.hidden.has(p.id)` → hidden.
4. Skin: shown if `s.depth === 'skin'` or `s.seeThrough`; else hidden. (See-through draws it at 30% opacity; the renderer decides opacity.)
5. Skin opaque (`s.depth === 'skin' && !s.seeThrough`) → every other part hidden.
6. `p.ext` and skin opaque → hidden (covered by 5; keep the explicit check and test).
7. Muscle/tendon: depth `skin` (with see-through) behaves as depth 1. Number depth d: `layer >= d` → shown; `layer < d` → ghost if `s.ghost` else hidden. Depth `bones` → ghost if `s.ghost` else hidden.
8. Other kinds: shown if `systemOf(p)` is in `s.systems`, else hidden.

Programs select (R9) replaces R0's see-through with: depth = min layer of the muscle targets (or keep the current depth if it already shows them); skeleton stays on.

## 5. Data models / schemas
`facts.json`: `{ "sources": [{title, url, licence}], "facts": { "<plain name>": [ { "text": "...", "source": { "title": "...", "url": "https://openstax.org/books/anatomy-and-physiology-2e/pages/..." } } ] } }`. Exactly the plain names used in the manifest.
`programs.json`: unchanged shape; only `targets.parts` strings change.

## 6. Decisions and things to avoid
| Decision | Reason |
|---|---|
| One mesh per pack + state texture | ~2,650 parts; one draw per pack keeps phones fast |
| Quantised attributes decoded on the GPU | keeps memory near pack size |
| Remove the M1 viewer and data in R2 | superseded by R1; smaller APK; no dead code |
| Programs keep highlights via a name rename | avoids a regression from R0 until R6 |
| OpenStax A&P 2e as the only fact source | free, CC BY, citable chapter URLs |

Avoid: new npm packages; per-part meshes; covering the body with UI; facts without a checked source; diagnosis wording; touching `tools/pipeline/v5/`.

## 7. Allowed dependencies
None new.

## 8. Tasks
- [x] T1: loader + tests (manifest parse, isGzip, pack slicing on a tiny hand-made pack, demand caching) | size: M | wave: 1 | files: src/body/load.ts, src/body/load.test.ts | verify: `npx vitest run src/body/load.test.ts` → pass; `npx tsc --noEmit` → exit 0
- [x] T2: state rules + tests (one test per rule 1–8, plus sex switch hides male-only parts, isolate, hidden, ghost, revealFor for a layer-3 muscle and for a nerve, packsNeeded with nerves off/on) | size: M | wave: 1 | files: src/body/state.ts, src/body/state.test.ts | verify: `npx vitest run src/body/state.test.ts` → pass
- [x] T3: facts.json (100 parts, 2–4 facts each, OpenStax URLs each checked with `curl -s -o /dev/null -w "%{http_code}"` → 200; save the check log to plans/raw/facts-urls.log) + facts.test.ts (≥ 100 keys, every key is a manifest plain name, 2–4 facts, every url https openstax.org) | size: M | wave: 1 | files: public/data/facts.json, src/body/facts.test.ts, docs/done_development/r2-body-page/plans/raw/facts-urls.log | verify: `npx vitest run src/body/facts.test.ts` → pass
- [x] T2b: state follow-ups (§2b.3–6): isolate as a set with the skeleton-context rule; `idsOfPlain`; import Part/Manifest/PackData from load.ts; align load.ts PackData to §2b.6; tests for isolate set + skeleton and idsOfPlain | size: M | wave: 2 | files: src/body/state.ts, src/body/state.test.ts, src/body/load.ts, src/body/load.test.ts | verify: `npx vitest run src/body/state.test.ts src/body/load.test.ts` → pass; `npx tsc --noEmit` → 0
- [x] T4a: core scene (R3 + §2b.6, 8, 9, 10, 11, 12): `createBodyViewer`, meshes per pack, GPU decode, state texture, materials per SPEC §1.4 from the sample, sex swap, bounds, render on demand, fps overlay, load-time log, load error, DEV global and query hooks, dev page `src/ui/body/dev.ts` behind `?bodydev=1`, copy cdp-shot to tools/shots/ | size: L | wave: 3 | files: src/body/scene.ts, src/body/materials.ts, src/ui/body/dev.ts, src/main.ts (dev hook only), tools/shots/cdp-shot.mjs | verify: `npx tsc --noEmit` → 0; `npm test` → pass; cdp-shot of `/?seed=male&bodydev=1` at 1440×900 shows the skinned male; with `&depth=outer` shows muscles; `&sex=female&depth=outer` shows the female (look at all three; save to plans/raw/t4a-*.png)
- [x] T4b: interactions: demand packs via packsNeeded, `select`, `frameIds` tween (from M1 viewer), `setViewInset`, highlight with glow, `setView` incl. below, isolate 25% bones | size: L | wave: 4 | files: src/body/scene.ts | verify: `npx tsc --noEmit` → 0; cdp-shot JS on the dev page: turn nerves on → the nerve pack loads (network) and nerves draw; `bodyViewer.frameIds(idsOfPlain(m,'Biceps brachii muscle'))` frames the arm (save plans/raw/t4b-*.png)
- [x] T5: picking + labels (R4) | size: L | wave: 5 | files: src/body/pick.ts, src/body/labels.ts, src/body/scene.ts (pick wiring only) | verify: `npx tsc --noEmit` → 0; cdp-shot JS `bodyViewer.pick(innerWidth/2, innerHeight*0.45)` at depth outer returns a muscle id; labels visible in a 1440×900 shot (plans/raw/t5-labels.png)
- [x] T6a: Body page part 1: `src/ui/body/page.ts` `mountBodyPage(root, viewer)`, top bar (sex, skin tone, see-through, ghost, colour mode + legend, labels toggle, list button), depth slider, systems, phone sheet (< 760 px: collapsed to the depth slider, opens to 72%, canvas above the collapsed sheet, compact scrolling top bar); dev.ts mounts the page | size: L | wave: 6 | files: src/ui/body/page.ts, src/ui/body/topbar.ts, src/ui/body/sheet.ts, src/ui/body/dev.ts, src/style.css, src/body/labels.ts (area threshold + styling via `.body-label` CSS only) | verify: `npm run build && npm test && npm run lint` → 0; shots at 390×844 and 1440×900 (plans/raw/t6a-*.png) show the body uncovered with the sheet collapsed; at 1440×900, depth outer, default view, ≥ 8 labels (count `.body-label` elements); at 390×844 ≤ 6 labels
- [x] T6b: Body page part 2: list (tabs, grouping, search, dimmed peeled rows), part card (fields, simplified note, facts with source links, Isolate, Hide, Zoom to it, Show hidden), select from list = revealFor + frame, tap on body = select | size: L | wave: 7 | files: src/ui/body/list.ts, src/ui/body/card.ts, src/ui/body/page.ts, src/ui/body/sheet.ts, src/style.css, src/body/labels.ts (truncation rule only) | also: the bottom-sheet layout applies below 900 px wide (tablet portrait), not only below 760; labels that would show fewer than 8 characters are dropped | verify: `npm run build && npm test && npm run lint` → 0; shots `open=list` and `open=card&part=Long head of biceps brachii` at 390×844 (plans/raw/t6b-*.png)
- [x] T7: app shell (R7, §2b.2): tabs Body / Workouts / Me, one viewer for the app, Workouts page (coming list + Programs entry), Me page (profile + Credits link), routes; dev.ts deleted | size: L | wave: 8 | files: src/main.ts, src/ui/shell.ts, src/ui/workouts.ts, src/ui/me.ts, src/ui/body/dev.ts (delete), src/programs/programs.ts, src/programs/programs.test.ts, src/ui/programs.ts (back link only), src/style.css | verify: `npm run build && npm test && npm run lint` → 0
- [x] T8: Programs on the new body (R9, §2b.9, 14, 15, 16) | size: L | wave: 9 | files: public/data/programs.json, src/programs/data.test.ts, src/ui/programs.ts, src/body/model.ts, src/body/model.test.ts, src/ui/shell.ts | also: all programs.ts links use `#workouts/programs…` (gate Back, list rows); shell passes the viewer (not null) to Programs; Programs' inset uses the top bar on wide and the bottom tab bar + sheet on phone (cover = every displayed fixed bar); saving the profile on Me sets the viewer's view sex to the new profile sex | verify: `npx vitest run src/programs src/body` → pass; cdp-shot `/?seed=male&adult=1&item=hamstring-curl#workouts/programs/anterior-pelvic-tilt` at 390×844 → yellowVisible ≥ 50; `&item=slow-holds#workouts/programs/pelvic-floor` → yellowVisible ≥ 50
- [x] T8b: remove M1 (R8) + credits (§2b.18): delete the R8 files and `src/body/data.test.ts`; package.json `pipeline`/`test:pipeline` → v5 commands; credits.ts reads body/credits.json + facts sources | size: M | wave: 10 | files: R8 deletions, src/body/data.test.ts (delete), package.json, src/ui/credits.ts | also: the credits back link goes to `#me` | verify: `npm run build && npm test && npm run lint && npm run test:pipeline` → 0; `test ! -e public/data/body.glb && test ! -e src/body/viewer.ts` → 0
- [x] T9: screenshots + measurements (R10): 24 Body PNGs `docs/reports/r2/<w>-<sex>-<depth>.png` (§2b.13), plus programs-390.png, list-390.png, card-390.png; desktop load time and fps at Skin and Outer (`?fps=1`, 1440×900) in headless Chrome (software GL, say so); `make apk` and its size; write plans/raw/measure.md | size: M | wave: 11 | files: docs/reports/r2/*, docs/done_development/r2-body-page/plans/raw/measure.md | verify: `ls docs/reports/r2/*.png | wc -l` → ≥ 27
- [x] T10: report docs/reports/R2.md (numbers from measure.md, screenshots, decisions incl. §2b, the phone manual-check steps); PLAN/SPEC updates (§2b.17) | size: M | wave: 12 | files: docs/reports/R2.md, docs/PLAN.md, docs/SPEC.md | verify: `grep -c "png" docs/reports/R2.md` → ≥ 10

## 9. Out of scope
Rig and Move (R3), engine (R4), exercises (R5), conditions/fat (R6), R8 organs, iOS.

## 10. Acceptance criteria
- AC1: Body page works on both sexes with depth, systems, colour modes, labels, list, card with sourced facts, isolate/hide/zoom, see-through, ghost, skin tone.
- AC2: Phone layout per SPEC §1A at 390×844; tablet and desktop layouts work.
- AC3: State rule tests pass (sex, depth, systems, hidden, isolate, external genitalia under opaque skin).
- AC4: App shell with Body, Workouts, Me; Programs highlight on the new body.
- AC5: M1 viewer and data removed; app builds, tests and lint pass; `make apk` builds.
- AC6: 24+ screenshots and measured desktop numbers in R2.md; phone numbers listed as a manual check.

## 11. Open questions
None.

## 12. Changelog
| When | Change | Why |
|---|---|---|
| 2026-11-15 15:00 | Planned without a review stop | user approved running R1–R7 back to back |
| 2026-11-15 15:25 | T2 added defaultState(m, sex); revealFor clears an isolate on another part; T4 replaces state.ts's local Part/Manifest with imports from load.ts | T1/T2 ran in parallel |
| 2026-11-15 15:40 | Critic round 1: §2b 1–19; tasks re-cut (T2b, T4a/b, T6a/b, T8b), M1 deletion moved after Programs | Opus critic listed 19 gaps |
| 2026-11-15 16:00 | OpenStax licence corrected to CC BY-NC-SA 4.0 (as stated on its pages); facts are paraphrases with citations; free app; R2.md must flag it for the Play Store licence check. 'Heart' has no plain name: the four chambers carry the heart facts | T3 report |
| 2026-11-15 16:25 | BodyViewer gains setSkinTone(light|medium|dark); DEV `open`/`part` hooks belong to T6b | T4a report |
| 2026-11-15 16:50 | select uses the highlight channel (same yellow glow); frameIds waits for demand packs; T6b shot part name → Long head of biceps brachii (no single biceps part) | T4b report |
| 2026-11-15 17:10 | T5: a tendon pick counts as muscle class; T6a tunes the label area threshold to reach ≥ 8 labels at 1440×900 (SPEC says up to 14) | T5 shot had 4 labels |
| 2026-11-15 17:40 | Colour legend sits under the depth slider on phone (T6a); sheet layout below 900 px; labels cut under 8 chars dropped (T6b) | T6a 768×1024 shot: 428 px canvas, labels cut to 'Ext…' |
| 2026-11-15 18:20 | T8 also owns shell viewer wiring, programs links, inset with bottom tab bar, profile sex → view sex; T8b fixes the credits back link | T7 report |
| 2026-11-15 18:40 | `tensor fasciae latae` is not in the Z-Anatomy data: drop it from side-lying-hip-abduction targets and add the item note "Tensor fasciae latae is not in this anatomy model." (programs.json); vertical part of longus colli → `Longus colli muscle` accepted; T10 adds TFL to PLAN §10 known gaps | T8 blocker |
| 2026-11-15 20:10 | Fix round for V-1..V-4 (review); files: src/ui/programs.ts, src/ui/body/page.ts, src/ui/body/card.ts, src/ui/body/topbar.ts, src/ui/body/sheet.ts, src/body/model.ts, src/body/model.test.ts (remove dead helpers' tests only), src/style.css | Opus reviewer |
