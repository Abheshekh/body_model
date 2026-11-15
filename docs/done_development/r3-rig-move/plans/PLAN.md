# r3-rig-move: plan

## 1. Goal and requirements
Skin, muscles, bones and organs of both bodies bend together on one skeleton (the MakeHuman game rig fitted in R1); the user poses the body by hand on a Move screen; the prototype's 11 exercises and 5 chores play again on the current sex from the Workouts page, with provisional muscle lists.

- **R1 Rig export (pipeline).** `tools/pipeline/v5/rig.py` writes the fitted game-rig skeleton for each sex into `public/data/body/rig.json`: bones `{name, parent, headM, tailM, headF, tailF}` (posed rest positions, metres, same frame as the packs) for the 22 body bones (`pelvis, spine_01..03, neck_01, head, clavicle_l/r, upperarm_l/r, lowerarm_l/r, hand_l/r, thigh_l/r, calf_l/r, foot_l/r, ball_l/r`); fingers are not driven in R3 (their skin weights fold into `hand_l/r`). It also writes the joint table (§4) that maps SPEC §2 joints to bones.
- **R2 Weights (pipeline).** A demand pack `public/data/body/weights.bin.gz` holds, for every vertex of the packs `skin, muscle, tendon, vessel, nerve, lymph, joint`, four bone indices (uint8) and four weights (uint8, sum 255), in each pack's vertex order. Rigid parts (`bone`, `organ`) get one bone per part in `rig.json` `partBone` (part id → bone index), not per-vertex data. Rules (SPEC §2):
  - Skin: MakeHuman's own game-engine weights, fingers folded into the hand, renormalised to the top 4.
  - Bones: rigid to the bone named by a lookup table `bone_map.json` (Z-Anatomy bone name pattern → rig bone, e.g. `humerus → upperarm`, `femur → thigh`, vertebrae by level, ribs/sternum → spine_03, skull/mandible → head, hip bone/sacrum → pelvis, hand bones → hand, foot bones → foot/ball).
  - Organs: rigid to the trunk bone nearest the part centre (pelvis, spine_01, spine_02, spine_03, neck_01, head).
  - Muscle, tendon, vessel, nerve, lymph, joint (per vertex): find the chain by side and region (axial, arm L/R, leg L/R); along that chain, project the vertex onto each bone segment; weight = smooth blend across each joint within ±`blend` of the joint along the limb (`blend` = 4 cm, smoothstep), so a muscle only bends at joints its vertices actually straddle; thorax-to-arm muscles (pectoralis major, latissimus dorsi, deltoid, trapezius, serratus anterior) blend sideways across the shoulder between `spine_03`/`clavicle` and `upperarm` using the vertex's x distance from the shoulder joint. At most 4 weights, renormalised.
  Weights load only when something moves (Move screen, playing an exercise); the Body page and first load are unchanged (first-load gz stays ≤ 10,000,000).
- **R3 Joint limits** (`public/data/joints.json`, with `sources`): per SPEC §2 joint and axis, `{min, max}` degrees from standard range-of-motion tables. Sources: Soucie JM et al., *Range of motion measurements: reference values and a database for comparison studies*, Haemophilia 2011;17(3):500–507, doi:10.1111/j.1365-2516.2010.02399.x, and the AAOS *Joint Motion: Method of Measuring and Recording* (1965). Each limit cites one of them; axes neither covers (lumbar/thoracic split, scapula) say `"source": "convention"` with a note.
- **R4 Pose model** (`src/rig/pose.ts`, pure, tested): a `Pose` is `{ root: {x, y, z, pitch, roll, yaw}, joints: { [jointKey]: { [axis]: degrees } } }`; `clampPose(pose, limits)`; `lerpPose(a, b, t)` (angles and root, linear); `mirror`; `scapulaFromArm(elevation)` = 0 below 30°, then (elevation − 30) / 3 (scapulohumeral rhythm ~2:1, convention); spine bend split 60% lumbar / 40% thoracic when the prototype gives one `spine` value.
- **R5 Skeleton and skinning (app)** (`src/rig/skeleton.ts`, `src/rig/skin.ts`): build the bone hierarchy per sex from rig.json; forward kinematics from a Pose (axis conventions in §4); bone matrices in a float DataTexture; the materials' vertex shader applies linear blend skinning from `bi/bw` attributes (weights pack) or the rigid `partBone` lookup (part id → bone in a texture); at rest pose the mesh is unchanged (identity). Bounds and picking use the posed positions (CPU skinning of part centres is enough for framing; the id pass uses the GPU path).
- **R6 IK** (`src/rig/ik.ts`, pure, tested): analytic two-bone IK (thigh–calf to an ankle target, upperarm–lowerarm to a wrist target) with a pole direction (knee forward, elbow back), clamped to joint limits. Planted feet: when the pelvis moves, solve both legs so the ankles stay at their planted positions.
- **R7 Move screen** (`src/ui/workouts/move.ts`, route `#workouts/move`): joint handles (small spheres at each SPEC §2 joint; pelvis, hands and feet larger); tap a handle → panel with one slider + number field per axis (limits from joints.json); drag a selected joint → its limb follows the pointer inside limits (hinge joints stay in their plane); drag pelvis → body moves, planted feet stay (IK); drag a hand or foot → IK for that limb (a dragged foot becomes free; a "Plant feet" toggle re-plants); Ctrl+drag orbit, Ctrl+scroll/pinch zoom, Ctrl+right-drag pan; drag on empty space orbits; Front/Side/Back buttons; Undo, Redo, Reset joint, Reset body; keyframe strip (add, select, delete, play the blend, loop). Phone: controls in the bottom sheet (collapsed by default); the body is never covered. Works on both sexes (view sex).
- **R8 Content** (`public/data/exercises.json`, `public/data/tasks.json`, `public/data/provisional_muscles.json`, all with `sources`): port the prototype's 11 exercises (all variants) and 5 chores (all variants) from `prototype/index.html` (`EX`, `CH`): name, part, cues, avoid, variants with `props`, keyframes `a`/`b` converted to R4 Poses, `moving`, `held`, notes, and the muscle roles (`prime`, `syn`, `stab` with level and reason) kept as **provisional** (each list has `"provisional": true`). Prototype muscle group keys (`biceps`, `deltFront`, `cuff`, …) map to manifest plain names in `provisional_muscles.json`. Props are drawn as simple shapes (bar, dumbbells, seat, back pad, bench pad, bucket…), labelled nothing (not anatomy, so the "simplified" rule does not apply).
- **R9 Workouts lists and player** (`src/ui/workouts/library.ts`, `src/ui/workouts/player.ts`; routes `#workouts/exercises`, `#workouts/exercises/<id>[/<variant>]`, `#workouts/tasks`, `#workouts/tasks/<id>[/<variant>]`): lists grouped by part; the player plays the keyframes on the view sex (ping-pong, respects prefers-reduced-motion with a step control), colours prime/synergist/stabiliser muscles (three colours with a legend), shows cues, avoid, note, and "Muscle lists are provisional until the effort engine (R4)." The Workouts "coming" list drops Move, Exercises and Tasks (now real).
- **R10 Acceptance poses and checks.** `public/data/poses_acceptance.json`: elbow 90 and 140, shoulder abduction 90 and 170, shoulder flexion 90, hip flexion 90, knee 120, trunk flexion 45, deep squat feet flat, arms overhead (10 poses). Pipeline test `tools/pipeline/v5/test_rig.py` poses the anatomy with the same FK + LBS in numpy for each pose and sex and checks: (a) tearing: < 0.5% of muscle edges longer than 2.0× rest; (b) inside-out: < 1% of muscle triangles flip their normal against the rest normal by > 120°; (c) bones rigid (edge lengths unchanged within 1e-4). Screenshots of all 10 poses × 2 sexes at 1440×900, depth outer.
- **R11 Fallback.** If R10 (a) or (b) fails after two fix rounds, add rigid-segment weights (each muscle vertex to its single nearest bone, 1.5 cm blend at joint caps) as a second weights pack and show both in the report.

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
- User approved running R1–R7 back to back; no review stop. No new dependencies (npm or pip).
- Branch `r3-rig-move` (from `r2-body-page`). Builders don't commit.
- R3 muscle lists are provisional and marked so; R4 replaces them. No other hand-written muscle lists.
- Phone first (390×844); the body is never covered by UI.

Repo conventions: as R2 (TypeScript strict, `h()` helper, Vitest next to source; Python unittest in tools/pipeline/v5 with `from v5 import …`). `src/rig/pose.ts` and `src/rig/ik.ts` are pure (no three.js). Data in JSON with `sources`.

Reference code: `tools/pipeline/v5/pose.py` (game rig, joints, rot_between, LBS, how the fit placed and posed MakeHuman), `tools/sample/mh_fit.py`, `src/body/scene.ts` + `src/body/materials.ts` (vertex shader, state texture, demand packs), `src/body/load.ts` (pack loading), `src/ui/body/sheet.ts` (phone sheet), `prototype/index.html` lines 380–690 (EX/CH data, P(), STAND, SEAT, HELD_STAND, pin) and its `applyPose` (how prototype angles were applied), `tools/shots/cdp-shot.mjs`.

Gotchas:
- The fitted rig in R1 is the posed MakeHuman skeleton per sex (pose.py placed and posed it). Re-run pose.py's FK to recover bone heads/tails per sex; do not re-fit.
- Pack vertex order must match the weights pack exactly; write a count check.
- Keep first-load size: weights are a separate demand pack.
- Dev server for shots: port 5300, one task at a time, stopped afterwards.

### 2b. Clarifications (binding; critic round 1)
1. **Euler order** = the prototype's: intrinsic Z (abd/side/dev/inv/roll), then X (flex/pitch), then Y (rot/twist/turn/pron/yaw). §4's "flex, then abd, then rot" is replaced by this.
2. **Signs.** Our convention stays (rot + = internal; ankle flex + = dorsiflexion). The prototype uses rot + = external and ankle + = plantarflexion, so `fromPrototype` negates `rot` and `ankle`. Test: calf raise `ankle 36` → `flex -36`; press `rot 90` → `rot -90`; neither needs clamping.
3. **Zero = anatomical zero**, not the bind pose: arms hanging at the sides with palms forward, legs vertical, spine and neck vertical, foot pointing +Z. The rig computes, per bone, the bind rotation `R_bind` = minimal rotation from the anatomical-zero direction (segment pointing down for limbs, up for the spine/neck/head, +Z for the foot/ball, ±X lateral for the clavicle) to the bind direction (head→tail). FK: `R_world(bone) = R_world(parent) · R_euler(angles)` with all-zero angles = anatomical zero; skin matrix `M = T(head_posed) · R_world · R_bind⁻¹ · T(−head_bind)`. `fromPrototype` keeps the prototype's REST `abd 6`.
4. **Frames per joint.** Every joint rotates in its parent segment's anatomical frame: X = body left, Y = up, Z = front (the right side uses the same frame; the semantic sign rules below are made true per side by the implementation). flex about X, abd/side/dev/inv/roll about Z, rot/twist/turn/pron/yaw about Y. Semantic signs (tests in T5 check each): shoulder/hip flex + moves the distal end forward (+Z); shoulder/hip abd + moves it away from the midline; elbow flex + brings the hand forward/up; knee flex + brings the heel back; ankle flex + lifts the toes; ankle inv + turns the sole toward the midline; wrist flex + bends toward the palm, dev + = radial; spine/neck/head flex + bends forward, side + bends to the body's left, twist/turn + turns to the left; pelvis pitch + tilts the top forward, roll + raises the right hip, yaw + turns left; pivot = pelvis head. The clavicle (scapula) rotates about its frame's Z, lateral end up.
5. **Root and pins.** `root.x/y/z` = metres of offset from the sex's rest pelvis position (a delta; 0 = rest). `fromPrototype` converts `y` to `y − 0.965`. Pose gains `pin?: 'none' | 'ground' | 'flat' | 'toes' | 'hands'` and `pinAt?`. Grounding is done by `skeleton.ground(pose)` after FK: ground/flat → lowest foot point at y = 0; toes → lowest ball point at y = 0; hands → lowest hand point at y = 0 (feet pinned as ground too if they are lower). The player and Move call it.
6. **Joint pivots.** Before export, rig.py snaps each joint head to the anatomy joint centre from bone ends (humeral head, distal humerus, distal radius, femoral head, distal femur, distal tibia), per sex (female landmarks = warped male ones); the skin keeps MakeHuman weights relative to the snapped skeleton. Articulation check added to R10: for each pose, the gap between adjacent bone ends (humerus–radius/ulna, femur–tibia, tibia–talus, femur–hip bone) changes by < 1 cm.
7. **Tear metric**, per part: no muscle part has > 2% of its edges stretched > 2× rest; report the worst part and its value per pose and sex.
8. **Flip metric**, per part: compare each posed triangle normal with its rest normal rotated by the triangle's blended skin rotation (mean of its vertices' LBS rotation); flipped if dot < −0.5; no muscle part > 1% flipped. Check (c) is dropped (rigid by construction); the articulation check (2b.6) replaces it.
9. **T3 rig source.** T3 may change `pose.py` to save the fitted rig (bone heads/tails per sex, the final scale) into pose.npz and re-run the pose step through run.py (no re-export).
10. **Chains.** Region → chain: Arm, Hand → arm_<side>; Leg, Foot → leg_<side>; Back, Chest, Abdomen, Neck, Head, Pelvis, Other → axial. Leg chain = pelvis → thigh → calf → foot → ball. Arm chain = spine_03 → clavicle → upperarm → lowerarm → hand. Axial chain = pelvis → spine_01 → spine_02 → spine_03 → neck_01 → head. Sideways-blend muscles (thorax/scapula to arm), chain arm_<side>, blended by |x| distance from the shoulder joint between spine_03/clavicle and upperarm: pectoralis major, pectoralis minor, latissimus dorsi, deltoid, teres major, teres minor, serratus anterior, trapezius, rhomboid major, rhomboid minor, levator scapulae, supraspinatus, infraspinatus, subscapularis.
11. **bone_map.json** must cover: scapula and clavicle → clavicle; humerus → upperarm; radius, ulna → lowerarm; carpals, metacarpals, hand phalanges → hand; femur → thigh; patella, tibia, fibula → calf; talus, calcaneus, navicular, cuboid, cuneiforms, metatarsals → foot; foot phalanges → ball; cervical vertebrae → neck_01; T1–T6 → spine_03; T7–T12 → spine_02; lumbar vertebrae → spine_01; sacrum, coccyx, hip bone → pelvis; ribs, sternum, costal cartilages → spine_03; skull bones, mandible, hyoid, teeth → head; anything unmatched → the nearest bone segment by part centre (logged).
12. **Manifest.** Weights stay out of `manifest.packs`. Manifest gains `rig: { file: "rig.json", weights: { file: "weights.bin.gz", bytes, gzBytes, arrays } }`. TEST_PLAN A8 is updated to check this.
13. **Scapula.** Elevation = angle between the commanded upper-arm direction (shoulder angles applied with the clavicle at rest) and straight down. Clavicle elev = max(0, elevation − 30) / 3 about the clavicle frame Z. The shoulder's local rotation is then re-solved (`R_shoulder' = R_clav'⁻¹ · R_desired`) so the arm's world direction equals the command. The `scapula.elev` axis in joints.json stays as data but is derived, never user-driven.
14. **IK.** `solveTwoBone` stays as built (returns `{mid, end, flex, clamped}`). `skeleton.ts` `solveLimb(pose, limb, target): Pose` converts positions to joint angles in the parent frame and clamps to limits.
15. **API for overlays** (T7 owns it, T8 uses it): `viewer.addOverlay(obj: THREE.Object3D)`, `removeOverlay(obj)`, `viewer.camera`, `viewer.raycast(x, y, objects)`, `viewer.setOrbitGate(fn: (e: PointerEvent) => boolean)` (Move orbits only when no handle is under the pointer or Ctrl is held). scene.ts and pick.ts are added to the task files that need them (T5: pick.ts; T7: scene.ts; T8: scene.ts for props only).
16. **Content method.** T6 writes `tools/content/extract_prototype.mjs` (Node built-ins; loads lines 380–690 of prototype/index.html in `vm.runInNewContext` with stubs) that writes the prototype poses as-is. exercises.json/tasks.json store `keyframes` in prototype form under `proto` (`{ a, b, pin, ... }`); the app converts them with `fromPrototype` at load. Data test: `fromPrototype` output needs no clamp beyond 1° on any axis (catches sign bugs). Group keys with a side suffix (`obliques_L`) resolve to the parts of that side.
17. **Verify scopes.** T5's verify uses `npx vitest run src/rig src/body`, not the full suite.
18. **Fallback.** If test_rig fails after two fix rounds, main adds a task for R11; the app then loads the rigid pack only with DEV `?weights=rigid` for the report comparison.
19. **Acceptance ids and angles**: elbow90 (elbow flex 90), elbow140 (140), abd90 (shoulder abd 90), abd170 (abd 170), flex90 (shoulder flex 90), hip90 (hip flex 90, standing leg straight, pin ground), knee120 (knee flex 120, hip 0, pin ground on the other foot), trunk45 (lumbar+thoracic flex 45 total, pin ground), squat (hip flex 110, knee flex 120, ankle flex 20, trunk flex 35, pin flat), overhead (shoulder flex 170 both arms). Expected player variant count = the number of variants in exercises.json + tasks.json (T8 prints and checks it).
20. **Move state.** Move keyframes persist in localStorage `bodyModel.move.v1` (pose data only; try/catch). Leaving Move or the player resets the viewer to rest (`setPose(null)`).

## 3. Files
| Path | Create / Change | Why |
|---|---|---|
| tools/pipeline/v5/rig.py, test_rig.py, bone_map.json | Create | R1, R2, R10 |
| tools/pipeline/v5/run.py, pack.py, FORMAT.md | Change | rig step, weights pack, format docs |
| public/data/body/rig.json, weights.bin.gz, manifest.json | Create / Change | rig data |
| public/data/joints.json, src/rig/joints.test.ts | Create | R3 |
| src/rig/pose.ts, pose.test.ts, ik.ts, ik.test.ts | Create | R4, R6 |
| src/rig/skeleton.ts, src/rig/skin.ts | Create | R5 |
| src/body/scene.ts, src/body/materials.ts, src/body/load.ts | Change | skinning hookup, weights pack, posed bounds |
| src/ui/workouts/move.ts, library.ts, player.ts, props.ts | Create | R7, R9 |
| src/ui/workouts.ts, src/ui/shell.ts, src/programs/programs.ts, programs.test.ts, src/style.css | Change | routes, lists |
| public/data/exercises.json, tasks.json, provisional_muscles.json, poses_acceptance.json, src/library/data.test.ts | Create | R8, R10 |
| docs/reports/r3/*.png, docs/reports/R3.md, docs/PLAN.md, docs/SPEC.md | Create / Change | report |

## 4. Interfaces
Joint table (rig.json `joints`, also used by the app):
| jointKey | bone(s) | axes (degrees) |
|---|---|---|
| pelvis | pelvis (root) | root x/y/z (m), pitch (+ = tilt forward), roll, yaw |
| lumbar | spine_01 | flex, side, twist |
| thoracic | spine_02 + spine_03 (split 50/50) | flex, side, twist |
| neck | neck_01 | flex, side, turn |
| head | head | flex, side, turn |
| shoulder_l / _r | upperarm | flex, abd, rot |
| scapula_l / _r | clavicle | derived from shoulder elevation (not user-driven) |
| elbow_l / _r | lowerarm | flex, pron (forearm twist) |
| wrist_l / _r | hand | flex, dev (radial/ulnar) |
| hip_l / _r | thigh | flex, abd, rot |
| knee_l / _r | calf | flex |
| ankle_l / _r | foot | flex (+ = dorsiflexion), inv (+ = inversion) |

Axis convention (body frame at rest: +X = body's left, +Y up, +Z front): `flex` rotates about the joint's local X so that flexion moves the distal segment forward (+Z) for shoulder, hip, spine, neck, head, wrist, and backward for knee (knee flexion = heel toward buttock), forward for elbow; `abd`/`side`/`dev`/`inv` rotate about local Z so that positive moves the distal segment away from the midline (left side positive toward +X, right side mirrored); `rot`/`twist`/`turn`/`pron` rotate about the bone's long axis, positive = internal rotation / pronation / turn to the left. Rotation order: flex, then abd, then rot (intrinsic). Local frames come from the rest bone direction with X aligned to the body X axis.

| Name | Signature | Job |
|---|---|---|
| `Pose` | §1 R4 | |
| `clampPose(p, limits)` | `(Pose, Limits) => Pose` | clamp each axis |
| `lerpPose(a, b, t)` | `(Pose, Pose, number) => Pose` | linear blend |
| `fromPrototype(p)` | `(protoPose) => Pose` | converts `{root:{y,pitch}, spine:{flex}, shoulder:{flex,abd,rot}, elbow, wrist, hip:{flex,abd}, knee, ankle, pin}` (symmetric unless `_L`/`_R` keys) |
| `solveTwoBone(a, b, c, target, pole)` | vectors → `{ angles }` | two-bone IK |
| `Skeleton.apply(pose)` | → bone matrices | FK |
| `BodyViewer.setPose(pose \| null)` | | null = rest; loads the weights pack on first non-null pose |
| `BodyViewer.jointPosition(jointKey)` | `→ Vector3` | for handles |

`weights.bin.gz` layout: for each pack name in `skin, muscle, tendon, vessel, nerve, lymph, joint` (manifest order), `bi` uint8×4 per vertex then `bw` uint8×4 per vertex; manifest `rig.weights.arrays[pack] = {bi:[offset,bytes], bw:[offset,bytes]}`.

## 5. Data models / schemas
`exercises.json`: `{ sources, exercises: [ { id, name, part, cues[], avoid[], variants: [ { id, name, props[], keyframes: [Pose, Pose], moving[], held[], note?, muscles: { provisional: true, prime: [[groupKey, level, reason]], syn: [...], stab: [...] } } ] } ] }`. `tasks.json`: same shape with `tasks`. `provisional_muscles.json`: `{ sources, provisional: true, groups: { "<groupKey>": ["<manifest plain name>", ...] } }`. `joints.json`: `{ sources: [...], joints: { "<jointKey>": { "<axis>": { min, max, source } } } }`. `poses_acceptance.json`: `{ poses: [ { id, name, pose: Pose } ] }`.

## 6. Decisions and things to avoid
| Decision | Reason |
|---|---|
| Weights in a demand pack; rigid parts by part→bone table | first-load budget unchanged |
| Automatic per-vertex chain blend from geometry (no per-muscle hand table) | 443 muscles; SPEC rule says blend across joints the muscle crosses |
| Same FK + LBS in numpy for the tear test | catches tearing without a browser |
| Fingers not posed in R3 | prototype content does not need them |

Avoid: new dependencies; hand-written muscle lists other than the provisional table; covering the body; changing first-load packs; editing `tools/pipeline/cache`.

## 7. Allowed dependencies
None new.

## 8. Tasks
- [x] T1: joints.json with sourced limits + joints.test.ts (every SPEC §2 joint/axis present, min < max, every limit has a source) | size: M | wave: 1 | files: public/data/joints.json, src/rig/joints.test.ts | verify: `npx vitest run src/rig/joints.test.ts` → pass
- [x] T2: pose.ts + ik.ts pure with tests (clamp, lerp, mirror, scapula rule, spine split, fromPrototype on the curl `a`/`b` poses and SEAT; IK reaches a reachable target within 1 mm, clamps an unreachable one to full extension along the target line, respects the pole) | size: M | wave: 1 | files: src/rig/pose.ts, pose.test.ts, ik.ts, ik.test.ts | verify: `npx vitest run src/rig` → pass
- [x] T2b: pose.ts follow-ups (§2b.1, 2, 5, 13 pure parts): Euler order doc, fromPrototype negates rot and ankle, root as delta (y − 0.965), Pose.pin/pinAt, scapulaFromArm per §2b.13 (pure angle math); tests (calf raise, press, root delta) | size: M | wave: 2 | files: src/rig/pose.ts, src/rig/pose.test.ts | verify: `npx vitest run src/rig/pose.test.ts src/rig/ik.test.ts` → pass
- [ ] T3: pipeline rig + weights (R1, R2): rig.py, bone_map.json, run.py step `rig`, pack.py writes weights.bin.gz + manifest `rig` section, FORMAT.md; unit tests in test_rig.py for weight rules on a synthetic two-segment limb (a vertex far from the joint has one bone; one at the joint blends ~50/50; weights sum to 255) | size: L | wave: 2 | files: tools/pipeline/v5/rig.py, test_rig.py, bone_map.json, run.py, pack.py, pose.py (save rig, §2b.9), FORMAT.md, public/data/body/* | verify: `npm run test:pipeline` → OK; `npm run pipeline` → finishes; first-load gz still ≤ 10,000,000 (print it)
- [ ] T4: acceptance poses + tear/inside-out test (R10): poses_acceptance.json; test_rig.py FK+LBS checks per §2b.6–8 for both sexes on the real built data (axis convention §2b.1–4 implemented in numpy in rig.py) | size: L | wave: 3 | files: public/data/poses_acceptance.json, tools/pipeline/v5/test_rig.py, tools/pipeline/v5/rig.py | verify: `tools/pipeline/.venv/bin/python -I -m unittest discover -s tools/pipeline/v5 -t tools/pipeline -p 'test_rig.py' -v` → OK; print per pose and sex: worst part tear %, worst part flip %, max articulation gap change
- [ ] T5: app skeleton + GPU skinning (R5): skeleton.ts, skin.ts, materials vertex shader, scene `setPose`, weights demand load, posed bounds, `jointPosition`; DEV hook `?pose=<acceptance id>` | size: L | wave: 4 | files: src/rig/pose.ts (Pin union + fromPrototype pin pass-through for toeL/toeR only), src/rig/skeleton.ts, src/rig/skeleton.test.ts (semantic sign tests §2b.4), src/rig/skin.ts, src/body/scene.ts, src/body/materials.ts, src/body/load.ts, src/body/pick.ts | verify: `npx tsc --noEmit && npx vitest run src/rig src/body` → 0; cdp-shot `/?seed=male&sex=male&depth=outer&pose=elbow90#body` and `pose=squat` at 1440×900 look right (save plans/raw/t5-*.png, look at them)
- [ ] T6: content port (R8): exercises.json, tasks.json, provisional_muscles.json, data.test.ts (11 exercises, 5 tasks, ≥ 2 keyframes each, every pose within joints.json limits after clamp, every group key resolves to manifest plain names, provisional flags set) | size: M | wave: 4 | files: tools/content/extract_prototype.mjs, public/data/exercises.json, tasks.json, provisional_muscles.json, src/library/data.test.ts | verify: `npx vitest run src/library` → pass
- [ ] T7: Move screen (R7) | size: L | wave: 5 | files: src/ui/workouts/move.ts, src/body/scene.ts (overlay API §2b.15), src/ui/workouts.ts, src/ui/shell.ts, src/programs/programs.ts, src/programs/programs.test.ts, src/style.css | verify: `npm run build && npm test && npm run lint` → 0; cdp-shot JS on `#workouts/move` at 390×844 and 1440×900: select elbow_l, set 90 via the number field → screenshot shows the bend; undo restores (plans/raw/t7-*.png)
- [ ] T8: Workouts library + player (R9) with props | size: L | wave: 6 | files: src/ui/workouts/library.ts, player.ts, props.ts, src/body/scene.ts (props only), src/ui/workouts.ts, src/ui/shell.ts, src/programs/programs.ts, src/programs/programs.test.ts, src/style.css | verify: `npm run build && npm test && npm run lint` → 0; every exercise and task variant opens and plays without console errors (script loops over all ids via cdp-shot JS, prints the count); shots of curl and one chore at 390×844 (plans/raw/t8-*.png)
- [ ] T9: screenshots (10 poses × 2 sexes at 1440×900, depth outer) into docs/reports/r3/pose-<id>-<sex>.png; Move screen at 390×844; two exercise frames per sex; make apk + size; plans/raw/measure.md | size: M | wave: 7 | files: docs/reports/r3/*, docs/done_development/r3-rig-move/plans/raw/measure.md | verify: `ls docs/reports/r3/pose-*.png | wc -l` → 20
- [ ] T10: report docs/reports/R3.md (tear/flip numbers per pose and sex, screenshots, decisions, fallback status); PLAN/SPEC updates | size: M | wave: 8 | files: docs/reports/R3.md, docs/PLAN.md, docs/SPEC.md | verify: `grep -c "png" docs/reports/R3.md` → ≥ 20

## 9. Out of scope
Effort engine (R4, replaces provisional lists), new exercises (R5), conditions/fat (R6), finger posing, muscle "Tap a muscle → effort and why" (needs R4; R3 shows name only).

## 10. Acceptance criteria
- AC1: Both sexes pose correctly for the 10 acceptance poses; tear < 0.5% edges and flip < 1% triangles per pose (test_rig.py), bones rigid.
- AC2: Move screen: handles, drag in limits, sliders and typed angles, IK planted feet, camera controls, undo/redo/reset, keyframes; phone layout keeps the body visible.
- AC3: All 11 exercises (all variants) and 5 chores (all variants) play on the current sex, muscles marked provisional.
- AC4: First-load gz ≤ 10 MB; weights load on demand.
- AC5: build, test, lint, pipeline tests pass; `make apk` builds.
- AC6: R3.md with 20 pose screenshots and the measured tear/flip numbers.

## 11. Open questions
None.

## 12. Changelog
| When | Change | Why |
|---|---|---|
| 2026-11-15 20:40 | Planned without a review stop | user approved running R1–R7 back to back |
| 2026-11-15 21:05 | joints.json: AAOS 1965 averages only (Soucie not fetchable, removed), noted as not checked against a scan; scapula axis `elev`. pose.ts: Limits = joints map; fromPrototype keeps absolute root.y (0.965, T5 converts), splits spine 60/40; solveTwoBone returns {mid,end,flex,clamped} | T1/T2 reports |
| 2026-11-15 21:30 | Critic round 1: §2b 1–20 (Euler order ZXY, sign negation, anatomical zero, frames, root delta + pins, snapped pivots + articulation check, per-part tear/flip, chains and bone map, manifest rig section, scapula, overlay API, content method, acceptance ids, Move state); new T2b; file lists widened | Opus critic listed 19 gaps |
| 2026-11-15 21:55 | Pins gain 'toeL' | 'toeR' (prototype lunge, step-up): that foot's ball at y = 0 (or pinAt), the other foot free; T5 adds them to Pin and skeleton.ground. pose.ts adds armElevation(flex, abd) | T2b report |
