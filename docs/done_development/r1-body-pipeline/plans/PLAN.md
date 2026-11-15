# r1-body-pipeline: plan

## 1. Goal and requirements
A tested, repeatable pipeline in `tools/pipeline/v5/` that builds the male and female bodies from Z-Anatomy and MakeHuman (SPEC §1), writes one data pack per system plus a manifest to `public/data/body/`, and produces contact sheets and numbers for the R1 report. The app does not change in R1.

- **R1 Fetch.** `fetch.py` gets the sources by git partial clone into `tools/pipeline/cache/` (already gitignored): Z-Anatomy (`https://github.com/Z-Anatomy/Models-of-human-anatomy`, only `Z-Anatomy.zip`, unzipped to `cache/za/Startup.blend`) and MPFB2 (`https://github.com/makehumancommunity/mpfb2`, sparse checkout of exactly the files in tools/sample/README.md). It is idempotent (it skips what exists) and records each repo's commit hash in `cache/sources.json`. Never run `git ls-tree -l` on a blobless clone.
- **R2 Env.** `tools/pipeline/requirements.txt` adds `bpy==5.3.0`, `scipy`, `embreex`, keeping `numpy`, `trimesh`, `fast-simplification`. Install into the existing `tools/pipeline/.venv` (Python 3.13). No other package. Tests use stdlib `unittest`, not pytest (pytest is not approved; SPEC says pytest, and T11 changes that SPEC line).
- **R3 Export (SPEC §1.3 step 1).** `za_export.py` (runs under the venv python, imports `bpy`) opens `Startup.blend` headless. Per part: evaluated mesh with subdivision off, decimate by the kind's ratio, triangulate, world transform, flip winding when the matrix determinant < 0, convert to metres, Y up, +Z front. Curves become meshes (resolution_u ≤ 4, bevel_resolution ≤ 2). Skip label objects (name ends `.g .j .t .i .s`, or `.o…`/`.e…` per the sample's regex; zero-polygon meshes) and the "Regions", "Reference lines" and "Muscular insertions" collections. Kinds per SPEC §1.2 using the sample's `kind()` rules (`tools/sample/za_export.py`). It also stores, per part: name, kind, collection ancestry. Output: `cache/za_raw.npz` + `cache/za_raw.json`.
- **R4 MakeHuman (step 7, first half).** `mh_build.py`: base mesh + equal blend of `african/asian/caucasian-{male,female}-young` targets per sex → `cache/mh.npz` (male, female, faces, uv), as `tools/sample/mh_build.py`.
- **R5 Geometry (steps 2–4).** `geom.py`: outward normals (flip a part whose normals point mostly toward its own centre); fibre field for muscle and tendon (PCA axis; 6% tails; narrower end = tendon; per-vertex blend; across-fibre coordinate for spindle vs flat/fan muscles); rectus sheath removal (delete oblique and transversus triangles within 3.5 cm in front of rectus abdominis); per-part decimation for vessel (keep 0.78) and nerve (keep 0.6) as the sample.
- **R6 Pose and warp field (steps 7–8).** `pose.py`: place the MakeHuman male (scale to anatomy height, feet on the floor, hip centre on anatomy hip centre); pose both sexes with linear blend skinning on the game rig: spine L4→C7, neck C7→C1, head C1→vertex, then upper arm, forearm, thigh, calf to Z-Anatomy joint landmarks from bone ends (humerus, radius, femur, tibia). The skin is never pulled onto the muscles (no `contain` step from the sample). The female is placed with the male's transform (same scale), so her height comes from MakeHuman. Warp field: D = female skin − male skin (posed); smooth D lightly; in the breast region use a heavily smoothed D. Output `cache/pose.npz` (male skin, female skin, D, faces, landmarks).
- **R7 Female anatomy and sex parts (steps 8–9).** `sex.py`: each anatomy vertex moves by the inverse-distance-weighted D of its 10 nearest male skin vertices. Male-only parts per the sample's `MALE_ONLY` regex; female-only parts generated with `simplified: true` (uterus, ovaries, uterine tubes, vagina placed from the warped bladder; mammary gland and breast fat from the female skin bump, offset 4 mm inward), as the sample's code. `ext: true` for external genitalia (sample's `EXTERNAL` regex).
- **R8 Heart to organ.** Heart chambers, valves and papillary muscles move from kind `vessel` to kind `organ`, system `Heart` (name match: `atrium|ventricle of heart|ventricle$|valve|papillary|chordae|wall of heart|heart`, applied only to parts whose collection ancestry contains "Heart"). Coronary vessels stay `vessel`.
- **R9 Layers and AO (steps 5–6).** `layers.py`: depth peeling for muscle + tendon on the male shape, exactly as SPEC step 5 (ray along the normal, hit any remaining soft part or bone, not itself, within 0.5 m; ≥ 16% uncovered → next layer; up to 6; everything left = 6). Then apply `tools/pipeline/v5/layer_overrides.json` (`[{part, layer, reason}]`, seeded with rectus abdominis 1 and pyramidalis 1, both with a reason). It also writes `cache/layer_review.json`: every muscle/tendon part with its exposure fraction at the round it was assigned, so the 30 closest to 0.16 can be listed. AO per vertex: 24–32 hemisphere rays (use 28) against all anatomy except skin, reach 5 cm, on the male shape, reused for female.
- **R10 Names (step 10).** Per part: `plain` (side suffix `.l/.r` removed, readable), `side` (left/right/center), `region` (collection ancestry, then name rules, then height for organs; sample's `REG`), `system` (sample's `SYS`), `colour` (sample's `colour()`), `layer` (muscle/tendon only, 1–6), `sex` (`both|male|female`), `ext`, `simplified`.
- **R11 Packs (step 11).** `pack.py` writes one pack per kind to `public/data/body/<kind>.bin.gz` (gzip level 9) and `public/data/body/manifest.json`. Pack contents and quantisation exactly as SPEC step 11 and the sample's `put()`: idx uint32 (triangles sorted by part), posM and posF uint16 in the shared body box, nrmM and nrmF int8, fib int8, acr int16 (×8000), mid (part id) uint16, ao uint8. Kinds `skin, muscle, tendon, bone, organ` are `load: "first"`; `vessel, nerve, lymph, joint` are `load: "demand"`. Budget: sum of first-load gz bytes ≤ 10,000,000. The format is documented in `tools/pipeline/v5/FORMAT.md` (the R2 contract). Also `public/data/body/credits.json` with Z-Anatomy (CC BY-SA 4.0), BodyParts3D (CC BY-SA 2.1 JP) and MakeHuman (CC0) entries: name, url, licence, licence url, what it provides, commit hash.
- **R12 Run.** `run.py` runs the steps in order with per-step timing, reusing cached `za_raw.npz`, `mh.npz`, `pose.npz` when present (`--force` redoes all). `npm run pipeline:v5` = `tools/pipeline/.venv/bin/python -I tools/pipeline/v5/run.py`. `npm run test:pipeline:v5` runs the v5 unittests. The old M1 pipeline (`build.py`, `classify.py`, `npm run pipeline`, `public/data/body.glb`, `parts.json`) stays untouched: the app still uses it until R2.
- **R13 Output tests (SPEC §1.3 list).** Part counts per kind within ±5% of `expected_counts.json` and the total within ±5% of the sample's 2,651; no label object exported; every muscle has a layer 1–6; male-only parts absent from female and the reverse; female height 1.54–1.62 m with male 1.70–1.72 m; no NaN in any pack; first-load budget; every manifest part id resolves; every override part exists.
- **R14 Contact sheets.** `tools/pipeline/v5/contact/sheet.html` (served by Vite from the repo root) loads the packs and renders 8 views in a 4×2 grid on one canvas: front, ¾ front, side, back, ¾ back, chest close-up, back close-up, pelvis. Query `?sex=male|female&depth=skin|outer|intermediate|deep|bones`. Depth: skin = skin only, opaque; outer = muscles layer ≥ 1; intermediate = layer ≥ 3; deep = layer ≥ 5; bones = no muscles, bones + organs. Shading ported from the sample's `viewer.html` (it is a tool, not shipped). `contact/shoot.mjs` (Node built-ins only, from R0's cdp-shot) takes the 10 sheets into `docs/reports/r1/sheet-<sex>-<depth>.png`.
- **R15 Report.** `docs/reports/R1.md`: triangles per kind (vs sample), parts per kind, pack sizes raw and gz, first-load total, build time per step, the 10 contact sheets, the 30 most doubtful layer assignments with a proposed override each, gaps and decisions.

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
- The user approved running R1–R7 back to back; main does not stop for review. Downloads approved: Z-Anatomy.zip (86.7 MB), the MPFB2 partial checkout, and pip `bpy==5.3.0`, `numpy`, `scipy`, `trimesh`, `embreex`, `fast-simplification`. Nothing else.
- Branch `r1-body-pipeline` (cut from `r0-clean-slate`). Builders do not commit; main commits at the end.
- Assets: free only. Record source and licence of every asset in credits.json and the report.
- Follow SPEC §1.3 where it differs from the sample (notably: the skin is never pulled onto the muscles).

Repo conventions: Python 3.13, stdlib + approved packages, 4-space indentation, small functions, `# ponytail:` comments for deliberate shortcuts. Every step module exposes pure functions (numpy in, numpy out) that unit tests can call on tiny synthetic meshes, plus one `run(ctx)` entry used by run.py. Tests are `tools/pipeline/v5/test_*.py`, unittest.

Shared data model (T1 writes `tools/pipeline/v5/body.py`):
- `Part` dataclass: `id:int` (index), `name:str` (Z-Anatomy object name), `kind:str`, `ancestry:list[str]`, `pos:np.ndarray (N,3) float32`, `tri:np.ndarray (M,3) int32` (local to the part), `nrm (N,3) float32`, `fib (N,3) float32` (zeros if not muscle/tendon), `acr (N,) float32`, `ao (N,) float32` (0–1), `posF (N,3) float32 | None`, and metadata fields `plain, side, region, system, colour, layer:int|None, sex, ext:bool, simplified:bool`.
- `save_parts(path, parts)` / `load_parts(path)`: one `.npz` with concatenated arrays plus offsets, and a `.json` with metadata. Round-trip exact.
- `CFG = json.load(pipeline.json)`; `CACHE`, `ROOT`, `OUT = public/data/body`.

`tools/pipeline/v5/pipeline.json` (T1): source repos and file lists; decimation ratios `{muscle 0.14, tendon 0.3, bone 0.12, organ 0.35, vessel 0.5, nerve 0.2, lymph 0.3, joint 0.3}` (sample values); per-part keep `{vessel 0.78, nerve 0.6}`; peel `{reach 0.5, uncovered 0.16, maxLayer 6}`; ao `{rays 28, reach 0.05}`; sheath `{depth 0.035}`; budget `{firstLoadGz 10000000}`; packs `{first: [skin,muscle,tendon,bone,organ], demand: [vessel,nerve,lymph,joint]}`; sample totals `{parts 2651}`.

Reference code to imitate (read before writing the matching step):
- `tools/sample/za_export.py` → za_export.py (kind rules, curves, decimate, triangulate, determinant flip).
- `tools/sample/mh_build.py` → mh_build.py.
- `tools/sample/mh_fit.py` → pose.py (landmarks, joints, rot_between, LBS pose, place, smooth, warp). Do not port `contain()` or the register/pull block.
- `tools/sample/build_v3.py` → geom.py (lines 24–80), sex.py (81–166, 213–273), layers.py (168–212), pack.py (274–301).
- `tools/sample/viewer.html` → contact/sheet.html shading and loading.
- `docs/done_development/r0-clean-slate/plans/raw/cdp-shot.mjs` → contact/shoot.mjs.
- `tools/pipeline/build.py: git()` for the partial-clone helper.

Gotchas:
- The `.blend` export takes 8–25 minutes. Run it in the background (Bash `run_in_background`) and wait for it; never twice at once.
- The sample paths (`/tmp/src/...`, `/home/claude/...`) are not used; all paths come from `body.py`/`pipeline.json`.
- bpy and numpy must come from the venv: always run `tools/pipeline/.venv/bin/python -I`.
- Z-Anatomy object names carry `.l`/`.r`; plain names drop them. Two objects can share a plain name (left/right) and must keep separate part ids.
- trimesh ray tests use embree when `embreex` is installed; check `trimesh.ray.has_embree` and print it.
- Vite dev server for the contact sheet: port 5190 (`npx vite --port 5190 --strictPort`), stopped afterwards.
- `public/data/body/` is new; never touch `public/data/body.glb`, `parts.json`, `credits.json` or `programs.json`.

### 2b. Clarifications (binding; critic round 1)
1. **Imports.** `tools/pipeline/v5` is a package. Every module imports siblings as `from v5 import body, geom` etc. Scripts run directly (`run.py`, `za_export.py`) start with `sys.path.insert(0, str(Path(__file__).resolve().parents[1]))` (works under `-I`). Tests run with `PY -m unittest discover -s tools/pipeline/v5 -t tools/pipeline -p '<pattern>'`; `npm run test:pipeline:v5` = `tools/pipeline/.venv/bin/python -I -m unittest discover -s tools/pipeline/v5 -t tools/pipeline -p 'test_*.py'`. The M1 `npm run test:pipeline` will also discover the v5 tests; that is accepted.
2. **ctx and order.** `ctx` is a dict: `{"cfg": CFG, "parts": list[Part], "mh": dict, "pose": dict, "timings": dict[str, float], "force": bool}`. run.py order: (a) za_export.py as a subprocess with the venv python if `cache/za_raw.npz` is missing or `--force`; load parts. (b) mh_build if `cache/mh.npz` missing/force. (c) geom: outward, vertex normals, `decimate_parts` (vessel 0.78, nerve 0.6, muscle `keep.muscle`), fibre field, sheath. (d) names.annotate (plain, side, region, system, colour, heart → organ). (e) pose if `cache/pose.npz` missing/force. (f) sex.apply (posF for every part, male-only flags, generated female parts, which are then passed through names.annotate for their metadata) and `sex.skin_part(pose)`. (g) layers.peel + `layers.apply_overrides`. (h) layers.ambient_occlusion. (i) pack.write. Each step's wall time goes into `ctx["timings"]` and is printed as a table at the end.
3. **Skin part.** `sex.skin_part(pose, parts) -> Part` (run.py must pass the parts list): id = max part id + 1, name `skin`, kind `skin`, plain `Skin`, side center, region `Whole body`, system `Skin`, `pos` = posed male skin, `posF` = posed female skin, triangles from the MakeHuman quads (split each quad into 2), normals computed, `ao` = 1, sex `both`. Eye helpers as the sample does.
4. **pose.npz** stores `male, female, faces, Dfull, Dlow, landmarks` like the sample's fit.npz; the anatomy warp uses the sample's blend of Dfull/Dlow; breast parts use `|Dfull − Dlow|` as the sample.
5. **Placement.** The female shares the male's scale only; she gets her own offset (feet on the floor y = 0, hip centre on the anatomy hip centre in x and z), as the sample.
6. **Height.** Two passes: scale the male so the unposed mesh height = 1.705 m, pose, measure the posed height h, then set scale ← scale × 1.71 / h and place + pose again (the female uses the same final scale). After posing, translate each sex in y so its lowest vertex is at y = 0 (feet on the floor). The 1.70–1.72 and 1.54–1.62 checks are made on the posed skins (max y − min y). (Changed after T5: one pass gave 1.7222 m with the feet 9.9 mm below the floor.)
7. **Units.** Factor 1 (Z-Anatomy is in metres). Axis: Blender Z-up/−Y-front → Y-up/+Z-front, as the sample. T2 prints the anatomy bounding box; its Y extent must be 1.6–1.8.
8. **Fibre sign.** Narrow end = insertion. Fibres point origin → insertion (toward the narrow end).
9. **Decimation.** `geom.decimate_parts(parts, keep: dict[str,float]) -> parts` with fast_simplification per part; keep from `pipeline.json` `keep` (T1 wrote `{vessel 0.78, nerve 0.6}`, which misreads the sample: its 0.78/0.6 are fractions removed. T8 sets `keep` to `{vessel 0.22, nerve 0.4}` to match the sample); a kind missing from `keep` means 1.0 (no decimation). T8 adds `keep.muscle` only if the budget needs it (§2b.14). Test: a 2,000-triangle sphere at keep 0.5 ends with ≤ 1,100 triangles and stays closed-ish (no part removed).
10. **Peel.** Covered = the first hit whose triangle does not belong to the part itself (use multiple hits and skip self). Keep the sample's fallback: if in a round no part reaches 0.16, the top third of remaining parts by exposure (at least 1) get that layer. T11 adds this fallback to SPEC step 5.
11. **Overrides.** `layers.apply_overrides(parts, overrides) -> list[str]` (returns unmatched entries; run.py prints them; T9 tests none are unmatched). Match rule: `norm(x)` = lowercase, strip a trailing `.l`/`.r`, strip a trailing ` muscle`, trim. An entry matches every part with `norm(entry.part) == norm(part.name)`. T6 test: `rectus abdominis` matches `Rectus abdominis muscle.l` and `.r`.
12. **Heart system.** System `Heart` only for parts that are kind `organ` after the heart move. Vessels with Heart ancestry get their system from the vessel rule (`Arteries` or `Veins` by name; default `Arteries`).
13. **NaN.** `pack.write` raises `ValueError(part name)` if any float array (pos, posF, nrm, fib, acr, ao) is not finite before quantising; test_pack covers it. test_output's nan check decodes every pack and checks positions lie inside the box and normals have length 0.9–1.1 (after /127).
14. **Budget.** If first-load gz > 10,000,000, T8 lowers `keep.muscle` in pipeline.json in steps of 0.1 (re-running from cache; no re-export) down to 0.6 and logs each attempt in build.log; still over at 0.6 → stop and report.
15. **Real-data bugs.** T8 is the first full run. The T8 builder may fix bugs in geom.py, layers.py, sex.py, names.py, pose.py (those files are added to T8's list) but must not edit earlier tests; each fix is listed in build.log.
16. **Contact depth.** skin = skin only (opaque). outer = muscle + tendon with layer ≥ 1, plus bones and organs. intermediate = layer ≥ 3 plus bones and organs. deep = layer ≥ 5 plus bones and organs. bones = bones + organs + joints. Vessels, nerves, lymph never drawn on the sheets. three.js from the installed package via Vite (`import * as THREE from 'three'`). The page sets `window.sheetReady = true` after its final render; shoot.mjs polls it (60 s timeout, then exit 2). The T10 builder starts and stops Vite on 5190.
17. **Counts.** expected_counts.json is a regression guard for later builds; the total-vs-2,651 check is the real one this run. Intended.

## 3. Files
| Path | Create / Change | Why |
|---|---|---|
| tools/pipeline/requirements.txt | Change | R2 |
| tools/pipeline/v5/__init__.py, body.py, pipeline.json | Create | shared model + config |
| tools/pipeline/v5/fetch.py | Create | R1 |
| tools/pipeline/v5/za_export.py | Create | R3 |
| tools/pipeline/v5/mh_build.py | Create | R4 |
| tools/pipeline/v5/geom.py, test_geom.py | Create | R5 |
| tools/pipeline/v5/pose.py, test_pose.py | Create | R6 |
| tools/pipeline/v5/sex.py, names.py, test_sex.py | Create | R7, R8, R10 |
| tools/pipeline/v5/layers.py, layer_overrides.json, test_layers.py | Create | R9 |
| tools/pipeline/v5/pack.py, run.py, FORMAT.md, test_pack.py | Create | R11, R12 |
| tools/pipeline/v5/expected_counts.json, test_output.py | Create | R13 |
| tools/pipeline/v5/contact/sheet.html, contact/shoot.mjs | Create | R14 |
| package.json | Change | `pipeline:v5`, `test:pipeline:v5` scripts |
| public/data/body/*.bin.gz, manifest.json, credits.json | Create | packs |
| docs/reports/R1.md, docs/reports/r1/*.png | Create | R15 |
| docs/SPEC.md | Change | pytest → unittest line; any decision changed |
| docs/done_development/r1-body-pipeline/plans/raw/* | Create | logs, timings |

## 4. Interfaces
| Name | Signature | Returns | Job |
|---|---|---|---|
| `fetch.fetch()` | `() -> dict` | `{za: commit, mpfb: commit}` | partial clones, unzip, sources.json |
| `za_export` (script) | venv python `za_export.py` | writes cache/za_raw.* | R3 |
| `mh_build.build()` | `() -> dict` | arrays | writes cache/mh.npz |
| `geom.outward(pos, tri)` | `-> tri` | int32 | flip winding if normals point inward on average |
| `geom.vertex_normals(pos, tri)` | `-> (N,3)` | float32 | area-weighted |
| `geom.fibre_field(pos, tri)` | `-> (fib (N,3), acr (N,))` | float32 | SPEC step 3 |
| `geom.remove_sheath(parts, depth)` | `-> parts` | — | SPEC step 4 |
| `pose.landmarks(parts)` | `-> dict[str, (3,)]` | | L4, C7, C1, vertex, shoulder/elbow/wrist/hip/knee/ankle L/R |
| `pose.place_and_pose(mh, lm)` | `-> {male, female, faces}` | (V,3) float32 | R6 |
| `pose.warp_field(male, female, faces)` | `-> D (V,3)` | float32 | smoothed, breast heavy |
| `sex.warp_points(P, male_skin, D, k=10)` | `-> P'` | float32 | IDW of 10 nearest |
| `sex.apply(parts, pose)` | `-> parts` | | posF for all, male-only flags, female parts added |
| `names.annotate(parts)` | `-> parts` | | plain, side, region, system, colour, heart → organ |
| `layers.peel(soft, bones, cfg)` | `-> (layer per part, exposure per part)` | | SPEC step 5 |
| `layers.ambient_occlusion(parts, cfg)` | `-> parts` | | 28 rays, 5 cm |
| `pack.write(parts, pose, out)` | `-> manifest dict` | | R11 |

`manifest.json` (contract with R2; FORMAT.md repeats it with byte layouts):
```
{ "version": 1, "box": [[x,y,z],[x,y,z]], "sexes": ["male","female"],
  "heights": {"male": m, "female": m},
  "packs": [ { "name": "muscle", "kinds": ["muscle"], "load": "first", "file": "muscle.bin.gz",
               "bytes": n, "gzBytes": n, "verts": n, "tris": n,
               "arrays": { "idx": [offset, bytes], "posM": [...], "posF": [...], "nrmM": [...], "nrmF": [...],
                           "fib": [...], "acr": [...], "mid": [...], "ao": [...] } } ],
  "parts": [ { "id": 0, "name": "...", "plain": "...", "side": "left|right|center", "kind": "...",
               "region": "...", "system": "...", "colour": "#rrggbb", "layer": 1|null,
               "sex": "both|male|female", "ext": false, "simplified": false, "defaultHidden": false, "pack": "muscle" } ],
  "credits": "credits.json" }
```
A pack named after an R8 organ group can be added later with `kinds: ["organ"]`; R2 must treat packs as a list, not a fixed set.

Peel steps (SPEC step 5, the builder implements literally):
1. `remaining` = all muscle + tendon parts; occluders = remaining ∪ bones.
2. For round r = 1..6: for every vertex of every remaining part, cast a ray from `pos + 1 mm·nrm` along `nrm`; it is covered if it hits any occluder triangle not of the same part within 0.5 m. A part's exposure = uncovered / total. Parts with exposure ≥ 0.16 get layer r and leave `remaining` (and the occluder set). Record exposure.
3. Parts still remaining after round 6 get layer 6 (exposure recorded at round 6).
4. Apply overrides last.

## 5. Data models / schemas
`layer_overrides.json`: `[{"part": "<Z-Anatomy name or plain name>", "layer": 1, "reason": "..."}]`. A plain name applies to both sides.
`expected_counts.json`: `{"muscle": n, "tendon": n, ...}`, written by T9 from the first full build (the sample's per-kind part counts are not recorded; the total 2,651 is), with a `"note"` saying so.
`cache/layer_review.json`: `[{"part", "layer", "exposure", "round"}]`.

## 6. Decisions and things to avoid
| Decision | Reason |
|---|---|
| New code in `tools/pipeline/v5/`, old M1 pipeline untouched | R1 must not change the app; R2 switches over |
| One pack per kind, per-sex positions and normals inside each pack | same part ids for both sexes; R8 adds packs |
| unittest, not pytest | no new download; existing pipeline tests use unittest |
| Female placed with the male's transform | her height then comes from MakeHuman, as the test expects |
| Ports of sample code are allowed in tools/ | the sample is the approved reference |

Avoid: pulling the skin onto the anatomy; any paid or non-listed asset; new pip/npm packages beyond §7; touching `src/`; touching the M1 data files; committing; running two exports at once.

## 7. Allowed dependencies
pip (into tools/pipeline/.venv only): `bpy==5.3.0`, `numpy`, `scipy`, `trimesh`, `embreex`, `fast-simplification`. No npm packages. Tools on this machine: git, Google Chrome, Node 24.

## 8. Tasks
- [x] T1: env + shared model: update requirements.txt; `pip install -r` into the venv; create `v5/__init__.py`, `body.py` (§2 model, save/load round-trip), `pipeline.json` (§2), `fetch.py` (R1); run fetch | size: M | wave: 1 | files: tools/pipeline/requirements.txt, tools/pipeline/v5/__init__.py, body.py, pipeline.json, fetch.py | verify: `tools/pipeline/.venv/bin/python -I -c "import bpy,scipy,trimesh,embreex,fast_simplification;print(bpy.app.version_string)"` → regex `^5\.3`; `test -s tools/pipeline/cache/za/Startup.blend && test -s tools/pipeline/cache/sources.json` → exit 0; `ls tools/pipeline/cache/mpfb/src/mpfb/data/rigs/standard/rig.game_engine.json` → exists
- [x] T2: export step (R3): `za_export.py`; run it in the background; save its log and timing to `plans/raw/export.log` | size: L | wave: 2 | files: tools/pipeline/v5/za_export.py, docs/done_development/r1-body-pipeline/plans/raw/export.log, tools/pipeline/v5/body.py (load_parts: read the npz once into a dict), tools/pipeline/v5/pipeline.json (decimate.muscle 0.25) | verify: `tools/pipeline/.venv/bin/python -I -c "import sys;sys.path.insert(0,'tools/pipeline');from v5.body import load_parts;p=load_parts('tools/pipeline/cache/za_raw');import collections;print(len(p),dict(collections.Counter(x.kind for x in p)))"` → total between 2400 and 2900, all 8 non-skin kinds present
- [x] T3: MakeHuman step (R4): `mh_build.py`; run it | size: M | wave: 2 | files: tools/pipeline/v5/mh_build.py | verify: `tools/pipeline/.venv/bin/python -I -c "import numpy as n;d=n.load('tools/pipeline/cache/mh.npz');print(d['male'].shape,d['female'].shape,d['faces'].shape)"` → male and female same shape, faces non-empty
- [x] T4: geometry (R5) with unit tests first (synthetic: an inward-wound cube is flipped; a tapered cylinder's fibres run along its axis and point at the narrow end; a rectus box with an oblique sheet 2 cm in front loses those triangles and keeps one 5 cm in front; decimate_parts per §2b.9) | size: L | wave: 3 | files: tools/pipeline/v5/geom.py, test_geom.py | verify: `tools/pipeline/.venv/bin/python -I -m unittest discover -s tools/pipeline/v5 -p 'test_geom.py'` → OK
- [x] T5: pose and warp field (R6) with unit tests first (rot_between maps a to b; LBS with one bone at identity leaves vertices unchanged; warp field of identical meshes is zero); run on real data → `cache/pose.npz`; print male and female heights | size: L | wave: 3 | files: tools/pipeline/v5/pose.py, test_pose.py | verify: unittest `test_pose.py` → OK; printed male height 1.70–1.72 and female 1.54–1.62
- [x] T6: layers + AO (R9) with unit tests first (two stacked plates: the outer gets layer 1, the inner layer 2; a lone plate gets layer 1; an override changes the layer; override matching per §2b.11; the fallback per §2b.10; AO of a vertex inside a closed box < AO of an exposed one); `layer_overrides.json` seeded | size: L | wave: 4 | files: tools/pipeline/v5/layers.py, layer_overrides.json, test_layers.py | verify: unittest `test_layers.py` → OK
- [x] T7: female anatomy, sex parts, names, heart → organ (R7, R8, R10) with unit tests first (warp_points with D constant c moves points by c; male-only regex matches `prostate` not `rectum`; heart rule moves `left ventricle of heart` with Heart ancestry to organ and leaves `left coronary artery`; plain name of `Biceps brachii muscle.l` has no `.l`, side left) | size: L | wave: 4 | files: tools/pipeline/v5/sex.py, names.py, test_sex.py | verify: unittest `test_sex.py` → OK
- [x] T8: pack, manifest, credits, FORMAT.md, run.py, npm scripts (R11, R12) with a unit test (pack → unpack round trip on 2 tiny parts within quantisation error); then run the full pipeline `npm run pipeline:v5`; save the per-step timing table to `plans/raw/build.log` | size: L | wave: 5 | files: tools/pipeline/v5/pack.py, run.py, FORMAT.md, test_pack.py, package.json, pipeline.json (keep values only), geom.py, layers.py, sex.py, names.py, pose.py (bug fixes only, §2b.15), public/data/body/*, docs/done_development/r1-body-pipeline/plans/raw/build.log | verify: `npm run test:pipeline:v5` → OK; `ls public/data/body/manifest.json public/data/body/credits.json` → exist; `npm test && npm run lint` → exit 0 (app unchanged)
- [x] T9: output tests (R13): write `expected_counts.json` from the built manifest (with the note), then `test_output.py` | size: M | wave: 6 | files: tools/pipeline/v5/expected_counts.json, test_output.py | verify: unittest `test_output.py` → OK
- [x] T10: contact sheets (R14): `contact/sheet.html`, `contact/shoot.mjs`; take the 10 sheets at 1600×800; look at each and note anything broken in `plans/raw/contact-notes.md` | size: L | wave: 6 | files: tools/pipeline/v5/contact/*, docs/reports/r1/*.png, docs/done_development/r1-body-pipeline/plans/raw/contact-notes.md | verify: `ls docs/reports/r1/sheet-*.png | wc -l` → 10
- [x] T11: report (R15): docs/reports/R1.md with every number measured from build.log, manifest.json and layer_review.json (30 rows closest to 0.16, each with a proposed override and reason); SPEC §1.3 tests line says unittest; record any other decision change in SPEC/PLAN | size: M | wave: 7 | files: docs/reports/R1.md, docs/SPEC.md, docs/PLAN.md, tools/pipeline/v5/FORMAT.md (add `defaultHidden`), docs/done_development/r1-body-pipeline/plans/PLAN.md §4 manifest (add `defaultHidden`) | verify: `grep -c "^| " docs/reports/R1.md` → ≥ 40; `grep -n "unittest" docs/SPEC.md` → a match

## 9. Out of scope
App UI changes (R2), rig binding of anatomy (R3), engine, R8 organs, sample `post.py`/`bake_ao.py`, failures already in BASELINE.md.

## 10. Acceptance criteria
- AC1: `npm run pipeline:v5` rebuilds everything from cache; `npm run test:pipeline:v5` passes, including every SPEC §1.3 test.
- AC2: One pack per kind with a manifest; heart parts are kind organ, system Heart; first-load gz ≤ 10 MB.
- AC3: credits.json lists Z-Anatomy, BodyParts3D and MakeHuman with licences and commit hashes.
- AC4: 10 contact sheets exist (2 sexes × 5 depths, 8 views each).
- AC5: R1.md reports triangles per kind, sizes, build time and the 30 most doubtful layers with proposed overrides.
- AC6: The app is unchanged: `npm test`, `npm run lint`, `npm run build` pass; `src/` and M1 data files untouched.

## 11. Open questions
None.

## 12. Changelog
| When | Change | Why |
|---|---|---|
| 2026-11-15 10:55 | Planned without plan mode or a plan-approval stop | user approved running R1–R7 back to back |
| 2026-11-15 11:10 | Critic round 1: §2b clarifications 1–17 (imports, ctx/order, skin part, Dfull/Dlow, placement, height, units, fibre sign, decimation, peel fallback, override matching, heart system, NaN, budget, real-data bug fixes in T8, contact depth/three.js/done flag, counts); T8 file list widened | Opus critic listed 17 gaps |
| 2026-11-15 11:35 | keep vessel 0.22 / nerve 0.4 (sample removes 78%/60%); T8 edits pipeline.json keep; T4, T6, T7 started early (no dependency on the export) | T4 builder note |
| 2026-11-15 11:50 | skin_part takes the parts list; sex.apply names its own generated parts; female organs need an organ named exactly 'Urinary bladder' (T8 adjusts the name check if the export differs) | T7 builder note |
| 2026-11-15 12:00 | T2: body.load_parts reads the npz once (OOM fix); decimate.muscle 0.14 → 0.25 and re-export | first export: muscle 236k tris vs sample 418k (sample was run with a higher ratio); vessel 846k matches the sample after keep 0.22 |
| 2026-11-15 12:20 | §2b.6: two-pass scale to a posed male height of 1.71 m and feet on y = 0 after posing | T5: one pass gave 1.7222 m and feet at y = −0.0099 |
| 2026-11-15 13:05 | Fix round 1 for F1–F5 (TEST_RESULTS Run 1): AO self-hit, female pectoral warp, inside-out simplified organs, breast resolution, defaultHidden flag in manifest + sheets; files: layers.py, sex.py, names.py, pack.py, test_output.py (add the defaultHidden check only), contact/sheet.html, packs, sheets | T10 notes; main looked at sheet-female-outer |
| 2026-11-15 13:40 | Fix round 2 for F1b: per-layer AO (layers.py); SPEC step 6 changes accordingly (T11). T11 also documents `defaultHidden` and the gaps found: male pec 9 mm past male skin, 12–17% of breast-fat vertices behind a rib | fix round 1 report |
| 2026-11-15 14:05 | F1 closed by visible-vertex AO; per-layer AO kept | all-vertex medians measure buried surfaces |
| 2026-11-15 14:40 | Fix round 3 for review findings R-1..R-4; files: test_output.py (strengthen test_no_nan only), pack.py, test_pack.py, layers.py, names.py, test_sex.py (add the parentheses case only), packs rebuilt | Opus reviewer |
