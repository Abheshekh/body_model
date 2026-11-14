# m1-body-pipeline: plan

## 1. Goal and requirements
Show the real BodyParts3D body in the browser with one named mesh per part, ≤ 400k triangles, meshopt-compressed. Explore screen with camera presets, layer toggles, tap-to-name, search-and-fly, a highlight API, and a credits screen.

- **R1 Fetch.** `tools/pipeline/build.py` partial-clones BodyParts3D (`--filter=blob:none --no-checkout --depth 1 --sparse`) into `tools/pipeline/cache/BodyParts3D`. It first sparse-checks-out only `parts_list_e.txt` and `LICENSE_content`, classifies, then adds only the STL files of selected parts. Paths in the repo: `assets/BodyParts3D_data/parts_list_e.txt`, `assets/BodyParts3D_data/LICENSE_content`, `assets/BodyParts3D_data/stl/<FMAid>.stl`. Commands, in order: `git clone --filter=blob:none --no-checkout --depth 1 --sparse <repo> <cache>`; `git -C <cache> sparse-checkout set --no-cone <the two text file paths>`; `git -C <cache> checkout`; read the commit with `git -C <cache> rev-parse HEAD` (goes into parts.json `sources[0].commit`); list STL ids with `git -C <cache> ls-tree -r --name-only HEAD assets/BodyParts3D_data/stl`; after classifying, `git -C <cache> sparse-checkout add <stl paths>` in batches of 100. Idempotent: skip the clone if the cache exists; only add STL paths whose file is missing on disk. Network or git failure → exit non-zero with the git error printed.
- **R2 Classify.** Every part with an STL is classified from its English name into `muscle | tendon | bone | cartilage | organ | skin | null (excluded)`. Names are normalised first: strip a trailing `, nsn`, lower-case. Rules live in `tools/pipeline/config.json`, not in code. Must yield ≥ 340 muscles and ≥ 190 bones. No artery, vein, nerve, brain, tooth, hair, valve or heart-internal part may be included. Edge cases (all must hold):
  - `adductor` / `abductor` are muscles (the spike's `duct` exclusion wrongly dropped them: use `\bduct\b`).
  - `anterior papillary muscle of right ventricle` → excluded (heart internals).
  - `left trapezium` / `trapezoid` → bone, not muscle.
  - `pancreas, nsn` → organ. `wall of heart` → organ (this is the heart mesh; there is no part named `heart` with an STL).
  - `left iliotibial tract` and `linea alba` → tendon (not excluded by `tract`).
  - `atlas`, `axis`, `ethmoid`, `vomer` → bone.
  - Muscles the spike missed: frontalis, occipitalis, temporoparietalis, procerus, nasalis, corrugator supercilii, longus capitis, longus colli, puborectalis, pyramidalis, interspinales, iliococcygeus, mentalis, risorius, depressor ..., rotator(es), obliquus capitis → muscle.
  - `tensor fasciae latae` is a muscle, not a tendon (`fasciae` must not match the tendon rule).
  - Also bone/cartilage: `inferior nasal concha` → bone, `thyroid cartilage` and `set of nasal cartilages` → cartilage.
  - Lungs, spleen, appendix, bladder, brain parts → excluded.
- **R3 Organs.** Exactly these organ names (after normalising): liver, stomach, left kidney, right kidney, duodenum, jejunum, ileum, colon, rectum, pancreas, wall of heart. Skin: `skin`. Lungs: not included (user decision).
- **R4 Simplify to budget.** `config.json.triangleBudget` (400000). Per part: `base = clamp(faces × frac, min, max)` with per-kind `frac/min/max` from config (spike values). Then `s = budget / Σbase`, `target = min(faces, max(80, round(base × s)))`. Simplify with `fast_simplification`. Parts with < 20 source faces are skipped. `fast_simplification` only approximates the target. If the total after simplifying is > budget × 1.05, scale every target by `budget / total` and re-simplify from the source meshes once. If it is still > budget × 1.05, exit non-zero.
- **R5 Axes.** Source: mm, +x = body's left, front = −y, z up. Output: metres, Y up, +Z front, +X body's left: `(x, z, −y) × 0.001`, normals `(x, z, −y)`. build.py asserts: total height (max y − min y over all included meshes) in 1.5–1.8 m, min y in −0.05…0.05, `left femur` centre x > 0, part named `body of sternum` centre y > part named `sacrum` centre y (output axes). Any failure → exit non-zero.
- **R6 Export.** One trimesh Scene, one mesh and one node per part, both named by FMA id (e.g. `FMA9628`), with normals. Write `tools/pipeline/cache/raw.glb`, then run `npx gltf-transform meshopt tools/pipeline/cache/raw.glb public/data/body.glb`. Apply the axis conversion and normals to the arrays **before** building the Scene. Every mesh must still be separate and named by id after compression; `test_output.py` (T6) is the check.
- **R7 parts.json** at `public/data/parts.json` (schema in §5). Also `public/data/credits.json` with the verbatim `LICENSE_content` text.
- **R8 Viewer.** Loads body.glb (GLTFLoader + MeshoptDecoder) and parts.json, maps mesh name → part, and gives each mesh its own MeshStandardMaterial coloured by kind. OrbitControls. Renders on demand (only when the camera, a tween, a layer or a highlight changes), except with `?fps=1`, which renders continuously and shows an overlay with fps (1 s rolling average) and load time (`performance.now()` from module start to first frame). Load time is always printed to `console.info`. A load failure shows the message `Could not load the body: <error>` in the page.
- **R9 Views.** Front / Side / Back buttons. Target (0, 0.85, 0). Camera at distance 4.3, height 0.9: front (0, 0.9, 4.3), side (4.3, 0.9, 0) (the body's left side), back (0, 0.9, −4.3). URL `?view=front|side|back` sets the initial view (default front).
- **R10 Layers.** Five toggles: Skin, Superficial muscles, Deep muscles, Skeleton, Organs. Mapping in `layerOf` (§4). Default on: superficial muscles, deep muscles, skeleton. URL `?layers=skin,skeleton,...` (comma list of layer keys) overrides the defaults; unknown keys are ignored.
- **R11 Tap.** Pointer up within 6 px of pointer down → raycast visible meshes only. A hit opens a card: plain name (large), anatomical name, kind, FMA id, close button. A tap on empty space closes the card. A drag never opens the card.
- **R12 Search.** Text input with a native `<datalist>` filled by `searchParts(parts, query)` (max 20 results, `plainName` as option label, `name` as value). Enter or picking an option: choose an exact `name` or `plainName` match, else the first result, else show "No match" under the input. Then turn that part's layer on, call `clearHighlights()` (search is the only highlight user in M1), `setPartColor(id, '#ffd400', 1)`, fly to it and open its card. When a layer is auto-enabled, its toggle checkbox must update to checked. Empty query: nothing.
- **R13 Fly.** `flyTo(id)`: centre = part's world bounding-box centre. Camera constants: PerspectiveCamera fov 30°, near 0.05, far 50. Distance = `flyDistance(radius, 30)` = max(0.35, 1.2 × radius / sin(fov/2)). If the camera is at the target (zero direction), use +Z. Keep the current view direction. Tween camera position and controls target over 600 ms (ease-in-out cubic).
- **R14 Highlight API.** `setPartColor(id, color, level)`: color is a CSS hex string or number. Level is clamped to 0..1. Mesh colour = `mixColor(base, color, level)`. Returns `false` (and `console.warn`) for an unknown id, else `true`. `clearHighlights()` restores every base colour. Neither changes visibility. Both are exported from `src/body/viewer.ts` and exposed on `window.bodyModel` for manual checks.
- **R15 Credits.** The `#credits` hash route shows a Credits screen: the verbatim LICENSE_content text, the licence URL, and a note "Modified: simplified and converted to glTF for this app." It has a Back link to `#`. Explore always shows a footer: "Anatomy: BodyParts3D © DBCLS, CC BY-SA 2.1 JP · Credits".
- **R16 Docs.** `docs/reports/M1.md` with measured numbers, screenshots, least-sure layer classification, open questions. SPEC §1 and PLAN updated for changed facts.

## 2. Context for the builder

Subagent rules:
```
- Builder: do tasks in order. Tick [x] only after the task's verify passes.
- Builder: touch only the task's files. Need another file or a dependency?
  Stop and report.
- Builder: never edit a test from an earlier task to make it pass.
  If a test looks wrong, report it.
- Tester: run TEST_PLAN.md only. Record results in TEST_RESULTS.md. Fix nothing.
- All: reply to main in ≤10 lines. Details go in files.
```

Decisions and rules from the chat and CLAUDE.md:
- One milestone only. No rig, joints, engine, exercises, My model, Capacitor. Do not create `src/rig`, `src/engine`, `src/library` or `src/me`. M1 creates only `src/body` and `src/ui`. ponytail: later milestones create their own folders.
- Data in JSON under `public/data/`. Every data file has a `sources` field. Classification rules, budget, superficial list and plain names live in JSON under `tools/pipeline/`.
- Never hand-write muscle lists for exercises (not relevant to M1, but don't add any).
- Real numbers only in the report. Anything not measured is written "not measured yet (manual)", never guessed.
- Licence: BodyParts3D is CC BY-SA 2.1 Japan. Its credit is always visible in the app.
- `public/data/body.glb` is committed (user decision). `tools/pipeline/cache/` and `tools/pipeline/.venv/` are gitignored.
- Lungs are excluded (user decision). Colon is included as an organ (SPEC §7 lists "intestines"; colon is the largest one).

Environment gotchas:
- `python3` on PATH is a foreign pixi env from another project. **Never use it.** Create the venv with `/opt/homebrew/bin/python3.13 -m venv tools/pipeline/.venv`. If `fast-simplification` has no wheel for 3.13, use `/opt/homebrew/bin/python3.12`. Always run Python as `tools/pipeline/.venv/bin/python -I ...`.
- Node 20.19.6, npm 10.8.2. Use `typescript@~5.9.3`, not 7.x: typescript-eslint supports TypeScript < 6.1.
- The full fetch downloads about 1 GB of STL. Run `npm run pipeline` with Bash `run_in_background: true` and wait for completion, or run it with a 600000 ms timeout and re-run until done (it is idempotent).
- three 0.187 imports: `three/addons/loaders/GLTFLoader.js`, `three/addons/libs/meshopt_decoder.module.js`, `three/addons/controls/OrbitControls.js`.
- gltf-transform `meshopt` quantises positions and moves the dequantisation into node transforms. So never read accessor min/max for geometry checks. Use `center` in parts.json, which build.py computes before export.
- GLTFLoader names each Mesh after its node. FMA ids are alphanumeric, so names survive. Map by `object.name`.
- Chrome is at `/Applications/Google Chrome.app`. adb is installed. LAN IP is 192.168.1.6.

`python -I` drops the script directory from `sys.path`. So `build.py` starts with `sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))` before `import classify`. `unittest discover -s tools/pipeline` adds that dir itself.
- `fast_simplification.simplify(v, f, target_reduction=r)` is approximate (result may differ slightly from the target); that is why R4 has a retry.
- Python's unittest prints `OK` to stderr: run it with `2>&1` when matching output.
- `dist/`, `vite preview` and headless Chrome are tools used by T12, not dependencies.

- `config.json` `rules` may carry extra keys the classify order needs (`tendonAlways`, `notMuscle`, `cartilage`); that is allowed.
- `npm install` of vitest 5 needs `--legacy-peer-deps` on npm 10.8.2 (plain install crashes). Node 20: vitest's reporter crashes with `Map.groupBy is not a function` when a test fails; use `--reporter=verbose` to read failures. Neither changes the commands in the tasks.
- Fix-up authorised by the planner: in `src/body/model.test.ts` change the `flyDistance` floor case from `flyDistance(0.1, 30)` to `flyDistance(0.05, 30)` (expected 0.35). This is the only test edit allowed.

Repo conventions: TypeScript strict, ES modules, no framework (vanilla DOM). Python stdlib `unittest` (no pytest). Small files, no classes unless needed. Mark deliberate shortcuts with `// ponytail:` / `# ponytail:` comments.

Reference code to imitate:
- `tools/anatomy-spike/build_body.py:classify` and `:main`: regex lists, BUDGET values, axis conversion, simplify loop. Move the regexes into config.json and apply the R2 fixes.
- `tools/anatomy-spike/render.html`: lights (hemisphere 0xdfe8ff/0x3a3030 0.75, key directional 0xfff4e6 1.15, fill 0xbfd4ff 0.45), ACES tone mapping, floor disc, kind colours (bone 0xe8dfc6, cartilage 0xc9d2cf, tendon 0xe4d9c8, skin 0xd8a488), the muscle colour hash `hash(s)` (render.html line 15) applied to `name without side` (line 35) → HSL(.008+h*.02, .58+h*.12, .36+h*.08), and the `SUPER` regex as the start of the superficial list. Organ colour: 0xa0524d.

## 3. Files
| Path | Create / Change | Why |
|---|---|---|
| `.gitignore` | Create/Change | node_modules, dist, tools/pipeline/.venv, tools/pipeline/cache, __pycache__ |
| `package.json`, `package-lock.json` | Create | scripts + deps (§7) |
| `tsconfig.json` | Create | strict TS, `types: ["vite/client","node"]` |
| `vite.config.ts` | Create | Vite + Vitest config (`test.include: ['src/**/*.test.ts']`) |
| `eslint.config.js` | Create | flat config, @eslint/js + typescript-eslint recommended; ignores dist, prototype, tools, public |
| `index.html` | Create | app shell |
| `src/main.ts` | Create | hash router: `#credits` → credits, else explore |
| `src/style.css` | Create | layout, toolbar, card, overlay; works at phone width |
| `src/body/model.ts` | Create | pure: Part types, `layerOf`, `searchParts`, `mixColor`, `parseLayersParam` |
| `src/body/model.test.ts` | Create | unit tests for model.ts |
| `src/body/data.test.ts` | Create | checks committed `public/data/parts.json` / `credits.json` |
| `src/body/viewer.ts` | Create | three.js scene, load, materials, layers, pick, flyTo, views, highlight API, fps |
| `src/ui/explore.ts` | Create | Explore DOM + wiring |
| `src/ui/credits.ts` | Create | Credits screen |
| `tools/pipeline/requirements.txt` | Create | numpy, trimesh, fast-simplification |
| `tools/pipeline/config.json` | Create | source repo URL, budget, kind budgets, classification regexes, organ names, superficial list, sources |
| `tools/pipeline/plain_names.json` | Create | plain-English names + sources |
| `tools/pipeline/classify.py` | Create | pure: normalise, classify, side, layer, plain name |
| `tools/pipeline/build.py` | Create | fetch, select, simplify, convert, export, compress, write JSON, checks |
| `tools/pipeline/test_classify.py` | Create | unittest for classify.py |
| `tools/pipeline/test_output.py` | Create | unittest on committed outputs (glb + parts.json) |
| `public/data/body.glb` | Create (generated) | the body |
| `public/data/parts.json` | Create (generated) | parts index |
| `public/data/credits.json` | Create (generated) | licence text |
| `docs/reports/M1.md` | Create | checkpoint report |
| `docs/reports/m1/*.png` | Create | screenshots |
| `docs/SPEC.md`, `docs/PLAN.md` | Change | changed facts (§6) |

## 4. Interfaces
| Name | Signature | Returns | Job |
|---|---|---|---|
| `classify.normalise` | `(name: str) -> str` | str | lower-case, strip `, nsn`, trim |
| `classify.classify` | `(name: str, rules: dict) -> str \| None` | kind or None | R2 rules (order below) |
| `classify.side_of` | `(name: str) -> str` | `left \| right \| center` | word `left`/`right` in name |
| `classify.layer_of` | `(name, kind, superficial: list[str]) -> str \| None` | `superficial \| deep \| None` | muscle/tendon only; superficial if any list entry is a substring of the name |
| `classify.plain_name` | `(name, side, plain: dict) -> str` | str | 1) Remove the word `left`/`right`. 2) If the rest matches `^(.*?(?:head|part|belly)) of (.+)$`, qualifier = group 1, core = group 2, else no qualifier, core = rest. 3) Map: first key (longest first) matching core as a **whole word** (`\bkey\b`) → its value; else core with first letter capitalised. 4) If a qualifier exists append ` – <qualifier>`. 5) Append `, left` / `, right` when side is not center. Examples: `long head of left biceps brachii` → `Biceps – long head, left`; `left levator scapulae` → `Levator scapulae, left` (not the scapula name); `left subscapularis` → `Subscapularis, left`; `left tibialis posterior` → `Tibialis posterior, left` |
| `build.main` | `(argv) -> int` | exit code | R1, R4–R7. Prints `parts {kind: count}`, `triangles N`, `body.glb N bytes` |
| `model.layerOf` | `(p: Part) => LayerKey` | LayerKey | skin→`skin`; organ→`organs`; bone/cartilage→`skeleton`; muscle/tendon → `superficialMuscles` if `layer==='superficial'` else `deepMuscles` |
| `model.searchParts` | `(parts: Part[], query: string, limit = 20) => Part[]` | Part[] | R12 ranking |
| `model.mixColor` | `(base: number, target: number, level: number) => number` | 0xRRGGBB | per-channel linear mix in sRGB bytes, level clamped 0..1, rounded |
| `model.flyDistance` | `(radius: number, fovDeg: number) => number` | metres | `max(0.35, 1.2 × radius / sin(fovDeg/2 in rad))` |
| `model.parseLayersParam` | `(v: string \| null) => Set<LayerKey> \| null` | set or null | null when v is null; else the known keys only |
| `viewer.createViewer` | `(canvas: HTMLCanvasElement, opts: {fps: boolean}) => Promise<Viewer>` | Viewer | builds the scene and loads data |
| `Viewer.setLayerVisible` | `(key: LayerKey, on: boolean) => void` | | toggles meshes of that layer |
| `Viewer.setView` | `(v: 'front'\|'side'\|'back') => void` | | R9 |
| `Viewer.pick` | `(clientX, clientY) => Part \| null` | | R11 raycast |
| `Viewer.flyTo` | `(id: string) => void` | | R13 |
| `Viewer.parts` | `Part[]` | | loaded parts |
| `setPartColor` | `(id: string, color: string \| number, level: number) => boolean` | | R14 |
| `clearHighlights` | `() => void` | | R14 |

classify order:
1. If the normalised name is in `rules.organs` → `organ`. If it equals `skin` → `skin`.
2. If it matches `rules.tendon` (`tendon|aponeurosis|\bfascia\b|fascia lata|iliotibial tract|linea alba`) and not `rules.exclude` → `tendon`. Exception: `iliotibial tract` and `linea alba` are tendon even though `tract` is excluded, so check them before the exclusion.
3. If it matches `rules.exclude` → None. Exclude covers: `artery|arteries|\bvein|nerve|vena|sinus|\bduct\b|ganglion|plexus|gyrus|lobe|ventricle|nucleus|tract|aorta|bronch|trache|lymph|gland|ligament|tooth|atrium|valve|cortex|sulcus|lobule|segment of|capsule|bursa|retinaculum|hair|eyebrow|brain|cerebr|thalam|hippocamp|amygdal|putamen|pallidus|colliculus|geniculate|fornix|commissure|\bpons\b|medulla|spinal cord|lung|spleen|appendix|bladder|papillary`.
4. If it matches `rules.muscle` (spike MUS + `rotator|obliquus|intertransversari|interspinales|depressor|risorius|mentalis|coccygeus|levator|sphincter|frontalis|occipitalis|temporoparietalis|procerus|nasalis|corrugator|longus capitis|longus colli|puborectalis|pyramidalis`) and not `trapezium|trapezoid` → `muscle`.
5. If it matches `rules.bone` (spike BONE + `\batlas\b|\baxis\b|ethmoid|vomer|concha|thyroid cartilage|nasal cartilage`) → `cartilage` if `cartilage|disk` is in the name, else `bone`.
6. Else None.

searchParts:
1. Split the trimmed lower-case query on whitespace. No tokens → `[]`.
2. A part matches if every token is a substring of `name + ' ' + plainName.toLowerCase()`.
3. Exclude kind `skin`.
4. Sort: muscle/tendon before others; then parts whose name or plainName starts with the full query; then name A→Z. Cut to `limit`.

## 5. Data models / schemas

`public/data/parts.json`:
```json
{
  "sources": [{"name": "BodyParts3D", "url": "https://github.com/Kevin-Mattheus-Moerman/BodyParts3D", "commit": "<sha>", "licence": "CC BY-SA 2.1 JP", "licenceUrl": "https://creativecommons.org/licenses/by-sa/2.1/jp/deed.en"},
              {"name": "plain names", "from": "tools/pipeline/plain_names.json"}],
  "triangleBudget": 400000,
  "triangles": 398123,
  "parts": [{"id": "FMA37670", "name": "left biceps brachii", "plainName": "Biceps, left",
             "kind": "muscle", "side": "left", "layer": "superficial", "muscleKey": null,
             "triangles": 812, "center": [0.21, 1.12, 0.03]}]
}
```
`name` is the normalised name (no `, nsn`). `layer` is null for non-muscle/tendon. `center` is the bounding-box centre in output metres, rounded to 4 dp. Parts are sorted by id.

`public/data/credits.json`: `{"sources":[...same BodyParts3D entry...], "items":[{"asset":"BodyParts3D","licence":"CC BY-SA 2.1 JP","licenceUrl":"...","text":"<LICENSE_content verbatim>","modified":"Simplified and converted to glTF for this app."}]}`

`tools/pipeline/config.json`: `{"sources":[...], "repo":"https://github.com/Kevin-Mattheus-Moerman/BodyParts3D", "dataDir":"assets/BodyParts3D_data", "triangleBudget":400000, "kinds":{"muscle":[0.07,700,7000],"tendon":[0.07,500,5000],"bone":[0.035,300,3500],"cartilage":[0.03,200,2000],"organ":[0.03,2000,6000],"skin":[1,60000,60000]}, "rules":{"organs":[...R3...],"tendon":"...","exclude":"...","muscle":"...","bone":"..."}, "superficial":[...]}`

Superficial list (start values): deltoid, pectoralis major, trapezius, latissimus dorsi, rectus abdominis, external oblique, gluteus maximus, gastrocnemius, biceps brachii, triceps brachii, rectus femoris, vastus lateralis, vastus medialis, sartorius, gracilis, adductor longus, biceps femoris, semitendinosus, tibialis anterior, fibularis longus, extensor digitorum longus, sternocleidomastoid, platysma, brachioradialis, extensor carpi radialis longus, extensor carpi ulnaris, flexor carpi ulnaris, flexor carpi radialis, palmaris longus, pronator teres, serratus anterior, teres major, infraspinatus, soleus, masseter, temporalis, frontalis, occipitalis, orbicularis, tensor fasciae latae, fascia, aponeurosis, calcaneal tendon, iliotibial tract.

`tools/pipeline/plain_names.json`: `{"sources":[{"name":"Common English anatomy names","url":"https://en.wikipedia.org/wiki/List_of_skeletal_muscles_of_the_human_body"}], "map":{"biceps brachii":"Biceps","triceps brachii":"Triceps","deltoid":"Shoulder (deltoid)","pectoralis major":"Chest (pectoralis major)","latissimus dorsi":"Lats (latissimus dorsi)","trapezius":"Traps (trapezius)","rectus abdominis":"Abs (rectus abdominis)","external oblique":"Obliques (external)","internal oblique":"Obliques (internal)","gluteus maximus":"Glutes (gluteus maximus)","gluteus medius":"Side glutes (gluteus medius)","rectus femoris":"Quads (rectus femoris)","vastus lateralis":"Quads (vastus lateralis)","vastus medialis":"Quads (vastus medialis)","vastus intermedius":"Quads (vastus intermedius)","biceps femoris":"Hamstrings (biceps femoris)","semitendinosus":"Hamstrings (semitendinosus)","semimembranosus":"Hamstrings (semimembranosus)","gastrocnemius":"Calf (gastrocnemius)","soleus":"Calf (soleus)","sternocleidomastoid":"Neck (sternocleidomastoid)","erector":"Back extensors","iliopsoas":"Hip flexors (iliopsoas)","psoas major":"Hip flexors (psoas major)","iliacus":"Hip flexors (iliacus)","adductor longus":"Inner thigh (adductor longus)","adductor magnus":"Inner thigh (adductor magnus)","serratus anterior":"Serratus","brachioradialis":"Forearm (brachioradialis)","tibialis anterior":"Shin (tibialis anterior)","femur":"Thigh bone (femur)","tibia":"Shin bone (tibia)","humerus":"Upper arm bone (humerus)","scapula":"Shoulder blade (scapula)","clavicle":"Collarbone (clavicle)","patella":"Kneecap (patella)","sternum":"Breastbone (sternum)","wall of heart":"Heart","skin":"Skin"}}`

## 6. Decisions and things to avoid
| Decision | Reason |
|---|---|
| Meshopt via `@gltf-transform/cli`, decoded by three's MeshoptDecoder | Fast decode on phones, no wasm file in public/, keeps meshes separate. User approved. |
| One material per mesh, ~650 draw calls | Simplest way to get per-part colour. ponytail: if Android fps < 30, move to BatchedMesh in M2 (noted in the report). |
| Render on demand | Saves phone battery. `?fps=1` forces a continuous loop for measuring. |
| Heart = `wall of heart`, pancreas = `pancreas, nsn` | These are the only STL meshes for them (checked against the repo's file list). |
| Colon included, lungs excluded | User decision on lungs. Colon is covered by "intestines" in SPEC §7. |
| Layer by a name list in config | No depth data in the source. The list is a start value to review. |
| `center` stored in parts.json | gltf-transform quantisation hides real coordinates in accessors. The centre is also handy for later milestones. |
| Python tests use stdlib unittest; glb checked by parsing its JSON chunk with `struct` + `json` | No extra deps. |
| DOM only, no UI framework | 5 controls and a card do not need one. |

Avoid: hard-coding part names or colours per muscle in TS; empty future folders; fetching the whole BodyParts3D repo; `python3` from PATH; TypeScript 7; editing `tools/anatomy-spike/` (keep it as the record); claiming fps or Android numbers that were not measured.

SPEC/PLAN updates (T13): SPEC §1: heart is `wall of heart` and pancreas is `pancreas, nsn` (both present); colon added; lungs excluded; compression is meshopt; budget is 400k from config; real part counts from this build; the spike's `duct` bug that dropped adductors/abductors. PLAN D2: update the part counts. Do not change other decisions unless a measurement forces it (say so in the report).

## 7. Allowed dependencies
npm runtime: `three@^0.187.0`.
npm dev: `@types/three@^0.187.0`, `vite@^8.3.8`, `typescript@~5.9.3`, `vitest@^5.1.0`, `eslint@^10.15.0`, `@eslint/js`, `typescript-eslint@^8.72.2`, `@types/node@^22`, `@gltf-transform/cli@^4.5.1`.
Python (venv `tools/pipeline/.venv`, `requirements.txt`): `numpy`, `trimesh`, `fast-simplification`.
Nothing else.

## 8. Tasks
- [x] T1: Scaffold. `.gitignore`, `package.json` (scripts: `dev: vite`, `build: tsc --noEmit && vite build`, `preview: vite preview`, `test: vitest run --passWithNoTests`, `lint: eslint .`, `pipeline: tools/pipeline/.venv/bin/python -I tools/pipeline/build.py`, `test:pipeline: tools/pipeline/.venv/bin/python -I -m unittest discover -s tools/pipeline -p 'test_*.py'`), install the §7 npm deps, `tsconfig.json`, `vite.config.ts`, `eslint.config.js`, `index.html`, `src/main.ts` (placeholder text "Body Model"), `src/style.css` | files: those | verify: `npm run build && npm run lint && npm test` → all exit 0
- [x] T2: Python env + config data. `tools/pipeline/requirements.txt`, `config.json`, `plain_names.json` (§5). Create the venv (§2 gotcha) and install requirements | files: those 3 | verify: `tools/pipeline/.venv/bin/python -I -c "import json,trimesh,fast_simplification;json.load(open('tools/pipeline/config.json'));json.load(open('tools/pipeline/plain_names.json'))"` → exit 0
- [x] T3: Write `tools/pipeline/test_classify.py` first. It covers every R2 edge case, R3 organ names, `side_of`, `layer_of` (left biceps brachii → superficial; left supinator → deep; femur → None), `plain_name` ("long head of left biceps brachii" → "Biceps – long head, left"; "left levator scapulae" → "Levator scapulae, left"; "left subscapularis" → "Subscapularis, left"; "left tibialis posterior" → "Tibialis posterior, left"; "left tensor fasciae latae" classifies as muscle; "left supinator" → "Supinator, left"; "wall of heart" → "Heart"), and `normalise("pancreas, nsn") == "pancreas"` | files: test_classify.py | verify: `npm run test:pipeline` → fails with ImportError/ModuleNotFoundError for `classify`
- [x] T4: Implement `tools/pipeline/classify.py` (§4, rules read from the dict passed in; the tests load config.json) | files: classify.py | verify: `npm run test:pipeline` → all test_classify tests pass
- [x] T5a: `tools/pipeline/build.py` part 1: `sys.path` insert, config load, R1 fetch + select (clone, sparse-checkout, ls-tree, classify, sparse-checkout add, STL download), print `selected {kind: count}`; a `--select-only` flag stops here | files: build.py | verify: `tools/pipeline/.venv/bin/python -I tools/pipeline/build.py --select-only` (background, ~1 GB download, re-run if interrupted) → exit 0; output regex `muscle.*\d{3}` with muscle ≥ 340 and bone ≥ 190; `ls tools/pipeline/cache/BodyParts3D/assets/BodyParts3D_data/stl | wc -l` is far below 934
- [x] T5b: `build.py` part 2: R4 simplify with retry, R5 conversion and checks, R6 export to `cache/raw.glb` and the meshopt step to `public/data/body.glb` (flag `--skip-fetch` not needed; fetch is idempotent) | files: build.py | verify: `npm run pipeline` → exit 0, prints `triangles N` with N ≤ 420000 and `body.glb N bytes`; `public/data/body.glb` exists
- [x] T5c: `build.py` part 3: R7 write `parts.json` (with `center`, `triangles`, commit sha) and `credits.json`, print `parts {kind: count}` | files: build.py | verify: `npm run pipeline` → exit 0; `public/data/parts.json` and `credits.json` exist; `parts` line shows muscle ≥ 340, bone ≥ 190
- [x] T6: `tools/pipeline/test_output.py`: parse body.glb (glb header, JSON chunk). Mesh names set == parts.json ids set. `EXT_meshopt_compression` in extensionsUsed. File ≤ 10 MB. parts.json triangles ≤ 1.05 × budget and == Σ part triangles. Counts muscle ≥ 340, bone ≥ 190, skin == 1. Organ names == R3 set. No part name matches the forbidden regex `artery|\bvein|nerve|brain|cerebr|gyrus|ventricle|thalam|hippocamp|amygdal|putamen|\bpons\b|medulla|colliculus|fornix|tooth|hair|valve|papillary|lung`. `left femur` centre x > 0, `sacrum` centre y < `body of sternum` centre y | files: test_output.py | verify: `npm run test:pipeline` → all pass
- [x] T7: Write `src/body/model.test.ts` first: `layerOf` for all 6 kinds and both muscle layers; `searchParts` (empty query → []; "biceps" → muscles first, left/right both found; multi-token "brachii left"; skin never returned; limit respected; no-match → []); `mixColor` (level 0 → base, 1 → target, 0.5 midpoint rounding, level −1 / 2 clamped); `parseLayersParam` (null → null; "skin,bogus" → {skin}); `flyDistance(0.05, 30)` → 0.35 (floor; 1.2×0.05/sin 15° = 0.2318 < 0.35) and `flyDistance(1, 30)` ≈ 4.636 | files: model.test.ts | verify: `npm test` → fails because `./model` is missing
- [x] T8: Implement `src/body/model.ts` | files: model.ts | verify: `npm test` → model tests pass
- [x] T9: `src/body/data.test.ts`: reads `public/data/parts.json` and `credits.json` with `node:fs`. Every part has id/name/plainName/kind/side/muscleKey === null/center (length 3). layer is set iff kind is muscle or tendon. muscles ≥ 340, bones ≥ 190. `sources` is non-empty in both files. credits text contains "BodyParts3D". No name matches the T6 forbidden regex | files: data.test.ts | verify: `npm test` → pass
- [x] T10a: `src/body/viewer.ts` part 1: scene, lights, load glb + parts.json, materials by kind, `setLayerVisible`, `setView`, render-on-demand loop, `?fps=1` overlay, load-time log, load-error message | files: viewer.ts | verify: `npm run build && npm run lint` → exit 0
- [x] T10b: `viewer.ts` part 2: `pick`, `flyTo` (uses `flyDistance`), `setPartColor`, `clearHighlights` | files: viewer.ts | verify: `npm run build && npm run lint` → exit 0
- [x] T11: `src/ui/explore.ts`, `src/ui/credits.ts`, `src/main.ts`, `src/style.css`, `index.html` (R10–R12, R15; read `?view`, `?layers`, `?fps`; expose `window.bodyModel`) | files: those | verify: `npm run build && npm run lint && npm test` → exit 0
- [x] T12: Screenshots + desktop numbers. `npm run build`, then `npx vite preview --port 4173 --strictPort` in the background. For each shot: `"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --use-angle=swiftshader --enable-unsafe-swiftshader --window-size=1200,1500 --virtual-time-budget=30000 --screenshot=docs/reports/m1/<name>.png "<url>"`. Shots: `front` (`?view=front`), `back` (`?view=back`), `side` (`?view=side`), `skin` (`?layers=skin`), `skeleton-organs` (`?layers=skeleton,organs`). If a shot is blank or only background, record that in the report as "headless capture failed, manual screenshot needed". Do not fake it. Stop the preview server afterwards | files: docs/reports/m1/*.png | verify: `ls docs/reports/m1/*.png` → files exist
- [x] T13: `docs/reports/M1.md`: measured triangles, glb bytes, part counts by kind (from the pipeline output), pipeline run time, screenshots, the 5 least-sure layer classifications (with why), open questions. Desktop fps / load time and Android fps over LAN: "not measured yet (manual check M9/M10)". Plus the SPEC §1 / PLAN D2 edits listed in §6 | files: docs/reports/M1.md, docs/SPEC.md, docs/PLAN.md | verify: `grep -c "triangles" docs/reports/M1.md` → ≥ 1

## 9. Out of scope
Rig, joint movement, effort engine, exercises, tasks, My model, Capacitor/Android packaging, fibre normal maps, BatchedMesh optimisation, lungs. Failures already in BASELINE.md.

## 10. Acceptance criteria
- AC1: The pipeline runs from a clean cache with a partial clone and writes body.glb, parts.json and credits.json.
- AC2: ≥ 340 muscles and ≥ 190 bones are classified. No artery, vein, nerve, brain, tooth, hair or heart-internal part. Heart and pancreas are present as organs.
- AC3: Total triangles ≤ 1.05 × the config budget (400k). The glb is meshopt-compressed and has one mesh per part, named by FMA id.
- AC4: Axes are correct: metres, Y up, +Z front, +X the body's left.
- AC5: The Explore screen shows the body, with front/side/back views, five layer toggles, tap card, search + fly + highlight, and the setPartColor/clearHighlights API.
- AC6: The Credits screen shows the verbatim BodyParts3D LICENSE_content. The credit footer is always visible on Explore.
- AC7: `npm run build`, `npm run lint`, `npm test` and `npm run test:pipeline` pass.
- AC8: The body matches `docs/preview/body-1-front-back.png` in shape and completeness.
- AC9: The report has the real triangle count, file size, part counts, screenshots, the least-sure layers and open questions. Load time and fps (desktop and Android over LAN) are filled in after manual checks M9/M10; until then the report says "not measured yet" and never guesses.

## 11. Open questions
None.

## 12. Changelog
| When | Change | Why |
|---|---|---|
| 2026-11-14 | Plan created | M1 |
| 2026-11-14 | Critic round 1: anchored tendon regex (`fasciae`), whole-word plain names with head qualifiers, concha/thyroid/nasal cartilage rules, `sys.path` fix for `python -I`, exact git commands and paths in R1, R4 retry, R5 sternum/sacrum names and height scope, R6 axis-before-scene, R13 camera constants, R12 clearHighlights + checkbox sync, `flyDistance` helper + test, AC9 wording, T5 and T10 split, colour-hash line refs | Gaps found by cold read |
| 2026-11-14 | Builder blocked at T8: test expected `flyDistance(0.1, 30)` = 0.35 but the formula gives 0.4636. Test input changed to radius 0.05. Noted vitest `--legacy-peer-deps`, Node 20 reporter crash, extra config rule keys | Plan arithmetic error found by builder |
