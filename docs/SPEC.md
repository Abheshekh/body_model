# Body Model — spec

Companion to `docs/PLAN.md` (v5). Says how each part must work. Numbers marked "start value" are tuning points, not facts.

## 1. Body data (v5)

Two bodies, male and female, built by `tools/pipeline` from free sources. Prototype of every step: `tools/sample/`.

### 1.1 Sources

| Source | Gives | Licence |
|---|---|---|
| Z-Anatomy `Startup.blend` (Blender, 300 MB) | Muscles, tendons and fascia, bones, organs, heart and vessels, brain, nerves and sense organs, lymphatic organs, ligaments, cartilage and discs. One object per part, `.l`/`.r` suffix for sides. | CC BY-SA 4.0 |
| MakeHuman base mesh + `african/asian/caucasian-{male,female}-young` targets, blended equally; game-engine rig + weights (from the MPFB2 repo) | Skin for both sexes, the skeleton that poses it | CC0 |

Read the `.blend` headless with the `bpy` pip package. Skip label objects (names ending `.g .j .t .i .s`, zero-polygon meshes) and the "Regions", "Reference lines" and "Muscular insertions" collections.

### 1.2 Kinds and budgets (sample numbers)

| Kind | Z-Anatomy collection | Sample triangles | Notes |
|---|---|---|---|
| muscle | 4: Muscular system | 418k | Skip bursae, sheaths, septa, ligaments, fascia except thoracolumbar fascia, iliotibial tract, aponeuroses, retinacula, linea alba |
| tendon | same, tendon-like names | 50k | Ivory colour, own material |
| bone | 1: Skeletal system | 72k | |
| organ | 8: Visceral systems | 97k | Digestive, respiratory, urinary, genital, endocrine |
| vessel | 5: Cardiovascular system | 186k | Includes heart chambers and valves. Curves converted to meshes. Decimated per part. |
| nerve | 7: Nervous system & Sense organs | 216k | Brain, spinal cord, nerves, eyes, ears. Decimated per part. |
| lymph | 6: Lymphoid organs | 38k | |
| joint | 3: Joints | 57k | Ligaments, cartilage, discs |
| skin | MakeHuman `body` + eye helpers | 27k | One per sex, same topology |

Phone budget: first load ≤ 10 MB compressed. Muscles, tendons, bones, skin and organs load first; vessels, nerves, lymph and joints load on first use.

### 1.3 Pipeline steps

1. Export per part from Blender: evaluated mesh with subdivision off, decimate by kind, triangulate, world transform, flip winding when the matrix determinant is negative. Convert to metres, Y up, +Z front.
2. Outward normals: flip a part whose normals point mostly toward its own centre.
3. Fibre field (muscle, tendon): principal axis by PCA; ends = 6% tails; narrower end = tendon. Per-vertex fibre direction = weighted blend of (vertex − origin end) and (insertion end − vertex). Across-fibre coordinate: angle around the long axis × mean radius (spindle muscles) or angle around the tendon end in the sheet plane (flat or fan muscles). Stored per vertex.
4. Rectus sheath: delete oblique and transversus triangles that lie within 3.5 cm in front of rectus abdominis (atlas convention, so the rectus shows).
5. Depth layers (muscle, tendon): repeat: a vertex is covered if a ray along its normal hits any remaining soft part or bone (not itself) within 0.5 m; parts with ≥ 16% uncovered vertices get the next layer; remove them; continue up to 6. If in a round no part reaches 16%, the top third of the remaining parts by exposure (at least one) get that layer. Then apply `layer_overrides.json` (part, layer, reason). Seed overrides: rectus abdominis 1, pyramidalis 1.
6. Ambient occlusion per vertex: 24–32 hemisphere rays (28 used), reach 5 cm, skin excluded. Per layer: a muscle or tendon vertex of layer L is occluded only by non-muscle anatomy and muscle/tendon parts of layer ≥ L (shallower layers are peeled away when it is shown); other parts are occluded by all anatomy except skin.
7. MakeHuman bodies: base mesh + blended targets per sex. Place: scale male to anatomy height, feet on the floor, hip centre on anatomy hip centre. Pose with linear blend skinning on the game rig: spine (L4→C7), neck (C7→C1), head (C1→vertex), then upper arm, forearm, thigh, calf to Z-Anatomy joint landmarks taken from bone ends (humerus, radius, femur, tibia). Skin keeps its shape after posing; it is never pulled onto the muscles.
8. Female anatomy: D = female skin − male skin (posed, same topology). Smooth D lightly; replace it with a heavily smoothed D in the breast region. The anatomy field differs from the skin field there: on the chest, the skin region where the full and smoothed D differ by more than 4 mm (grown 2 rings) is filled harmonically from its border, so the pectoral muscles do not take the breast shape. Each anatomy vertex moves by the inverse-distance-weighted D of its 10 nearest male skin vertices.
9. Sex-specific parts. Male only: penis, testes, epididymis, ductus deferens, seminal glands, prostate, male urethra. Female only (generated, `simplified: true`): uterus, ovaries, uterine tubes, vagina, placed from the warped bladder; mammary gland and breast fat from the female skin bump over the chest, offset 4 mm inward. External genitalia are hidden while the skin is opaque.
10. Names: plain base name (side suffix removed), side, region (from collection ancestry, then name rules, then height for organs), system, colour, layer, sex, `ext`, `simplified`.
11. Pack: positions as uint16 within the body box (one set per sex), normals and fibre direction as int8, across-fibre as int16, part id as uint16, AO as uint8, indices as uint32; gzip. The viewer decompresses with `DecompressionStream`.

Tests (unittest): part counts per kind within ±5% of the sample; no label object exported; every muscle has a layer 1–6; male-only parts absent from the female part list and the reverse; female height 1.54–1.62 m when male is 1.70–1.72 m; no NaN; data size budget.

### 1.4 Shading

| Kind | Look |
|---|---|
| Muscle | Deep red, per-part tint, wet clearcoat, sheen, anisotropy along fibres, fine fibres + fascicle bundles from the fibre field, faded by screen derivative to avoid shimmer |
| Tendon, fascia | Ivory, glossier, fine striation |
| Bone | Ivory, matte |
| Organs, vessels, nerves, lymph, ligaments | Per-part colour from data, wet sheen |
| Skin | Tone swatches (light, medium, dark), soft sheen, no clearcoat |
| All | Baked AO, studio key + rim + fill, environment light, ACES tone mapping, teal backdrop, contact shadow |

## 1A. Body page

| Control | Behaviour |
|---|---|
| Male / Female | Swaps positions and normals; same part ids. Sex-only parts follow the viewed sex (the switch is a view toggle initialised from the profile). |
| Depth slider | Skin → Outer → 2 … 6 → Bones. Skin: only the skin draws. Outer…6: muscles at that layer and deeper. Bones: no muscles. |
| See-through skin | Skin at about 30% over whatever is shown |
| Ghost peeled | Faint fresnel shell of peeled muscles; off at the Skin step |
| Show (systems) | Organs, Heart and vessels, Brain and nerves, Lymphatic, Ligaments and cartilage, Skeleton |
| Colour | Natural / by layer (legend) / by system (legend) |
| Labels | GPU id pass: per visible part pixel area and nearest-own-pixel anchor; top 14 (desktop) or 6 (phone) as left/right columns with leader lines; redraw when the camera stops. Tap a label to select. |
| List | Tabs: Muscles, Organs, Bones, Vessels, Nerves, Lymph, Ligaments. Muscles and bones grouped by region, others by system. Search across all. Peeled rows dimmed. |
| Part card | Name, kind, region, side, layer or system, "simplified" note, facts with sources (R2), Isolate, Hide, Zoom to it, Show hidden |
| Select from list | Peels to the part's layer or turns its system on, then zooms |
| Default hidden | Greater and lesser omentum, mesocolon, pleura (they cover the organs); listed so the user can show them. They carry `"defaultHidden": true` in the manifest |
| Phone (< 900 px; labels cap at 6 below 760 px) | Bottom sheet, collapsed to the depth slider by default, opens to 72% height. Canvas sized above the collapsed sheet. Compact scrolling top bar. No title. |

Facts on the card come from `facts.json` (plain name → short facts, each with a source; one entry covers left and right). R2 fills the 100 most-viewed parts; the rest show the name only.

## 2. Rig (R3)

v5: the MakeHuman game skeleton fitted in pipeline step 7 (section 1.3) drives skin and anatomy for both sexes. The joint table below gives the landmarks the fit and the limits use. Skin uses MakeHuman's own weights; anatomy uses the rules below.

Joints, located from the bone meshes, not typed in by hand:

| Joint | Located from | Degrees of freedom |
|---|---|---|
| Pelvis (root) | Centre between the hip joints | Position, tilt forward/back, side tilt, turn |
| Lumbar, thoracic | L4–L5 and T10–T11 vertebra centres | Bend, side bend, twist (split across both) |
| Neck, head | C7 and C1 | Bend, side bend, turn |
| Shoulder | Head of humerus | Raise forward/back, raise sideways, rotate |
| Shoulder blade | Derived, not user-driven | Follows the arm above 30° of elevation |
| Elbow | Distal humerus | Bend. Forearm twist as a second axis. |
| Wrist | Distal radius | Bend, side bend |
| Hip | Head of femur | Forward/back, out/in, rotate |
| Knee | Distal femur | Bend |
| Ankle | Distal tibia | Point/pull, roll in/out |

Every axis has a limit from standard range-of-motion tables. Store limits in data.

Skinning:
- Bones: rigid, one joint each.
- Each muscle belongs to one chain (axial, arm L/R, leg L/R) and a bone range on that chain. Example: biceps = arm chain, shoulder blade to forearm. Pectoralis major = arm chain, thorax to upper arm.
- Vertex weights: smooth blend across each joint the muscle crosses, measured along the limb. For thorax-to-arm muscles blend sideways across the shoulder instead. Up to four weights per vertex.
- Skin: same rule using nearest chain by region.
- Fallback if this tears: rigid muscle segments, each tied to its main bone, with a short blend at joint caps.

Feet: when standing, feet are planted by two-bone IK. Moving the pelvis bends hips, knees and ankles together. A foot becomes free when the user drags it.

## 3. Interaction (R3)

Phone rule for every screen: the body is never covered. Controls live in a bottom sheet that starts collapsed (SPEC 1A).

| Input | Result |
|---|---|
| Click a joint handle | Select it. Panel shows its angles as sliders and number fields. |
| Drag a selected joint | Limb follows the pointer, inside joint limits. Hinge joints stay in their plane. |
| Drag the pelvis handle | Body moves. Planted feet stay. This is how you squat or hinge. |
| Drag a foot or hand handle | Moves that limb by IK. |
| Ctrl + drag | Orbit camera. Ctrl + scroll or pinch: zoom. Ctrl + right-drag: pan. |
| Drag on empty space | Also orbits, so touch screens work without Ctrl. |
| Tap a muscle | Name, actions, current effort and why. |
| Front, side, back buttons | Camera presets. |
| Undo, redo, reset joint, reset body | Required. |

Keyframes: a movement is two or more poses. The editor shows the keyframes on a strip. Select one, edit joints, play the blend. This is the "animation studio" control.

## 4. Effort engine (R4)

Pure function. No rendering. Fully unit-tested.

```
effort(pose, supports, loads, body) -> {
  jointDemand[joint][axis][direction] = torque needed / strength,
  muscle[muscleKey] = { level 0..1, role, reasons[] },
  lowerBack = { momentNm, level },
  balance = { comOverFeet: boolean, margin }
}
```

Steps:
1. Body segments have mass and a centre of mass. Use Winter's segment fractions (start values: head and neck 8.1%, trunk 49.7%, upper arm 2.8%, forearm 1.6%, hand 0.6%, thigh 10%, shank 4.65%, foot 1.45%). Body mass comes from My model, default 70 kg.
2. External forces: each load is a force at a body point (hands, shoulders, feet, shin). A free weight pulls straight down. A cable pulls toward its pulley. A machine pad pushes along its track.
3. Supports give reaction forces: floor under each planted foot, seat under the pelvis, back pad on the thorax, bench under the trunk, bar in the hands (hanging), floor under hands or forearms (push-up, plank). Solve vertical reactions from force and moment balance. Split between two feet by where the centre of mass sits.
4. For every joint, sum the moments of all forces on the far side of the joint. That is the torque the joint must hold.
5. Split the torque along the joint's axes. At the shoulder separate rotation along the upper arm from the rest, and treat torque about the trunk's long axis as horizontal adduction or abduction when the arm is raised.
6. Demand = torque ÷ strength for that axis and direction. Strengths are start values per kg of body mass, stored in data.
7. Muscles: an action table lists each muscle's actions with weights. Example: biceps brachii → elbow flexion 1.0, shoulder flexion 0.3, forearm supination 0.6. Level = strongest matching demand × weight.
8. Extra rules, kept separate and labelled:
   - Shoulder blade muscles from arm elevation and from load hanging off the arm.
   - Grip from the force in the hand.
   - Trunk bracing: abdominals and obliques co-contract with spinal load.
9. Roles: the joint moves between keyframes → "does the work". Demand without motion → "holds you still". Action weight under 0.6 → "helps".
10. Support removes demand. A back pad zeroes most spine torque. A seat takes the legs out. This must fall out of step 3, not be special-cased.

Must-pass checks:

| Case | Expected |
|---|---|
| Standing barbell curl vs seated with back pad | Same elbow flexors. Standing adds spinal erectors, glutes, calves. |
| Pick up 10 kg: stoop vs squat | Stoop: high lower-back moment, hamstrings, erectors. Squat: lower back moment falls, quadriceps and glutes rise. |
| Carry 10 kg in one hand vs 5 kg in each | One hand: opposite-side obliques, quadratus lumborum, gluteus medius. Split: these fall. |
| Push-up vs bench press | Same pressing muscles. Push-up adds abdominals and hip flexors. |
| Pull-up hang | Finger flexors high. Lats and elbow flexors rise as the elbows bend. |
| Plank | No joint moves. Everything shown is a stabiliser. |

Limits to state in the app: the engine is static. It ignores speed, momentum, fatigue, and individual differences. Levels are estimates, not lab measurements.

## 5. Exercises (R5)

Record:
```
Exercise
  id, name, aliases[], pattern, posture, equipment[], bodyParts[]
  supports[], loads[]            load weight is a user slider
  keyframes[]                    poses, each reviewed
  cues[], mistakes[]
  formChecks[]                   machine-checkable rules, for example "knee tracks over foot"
  sources[], reviewed: boolean
```

Scale comes from patterns. A pattern is a reviewed motion (curl, press, row, pulldown, squat, hinge, lunge, raise, fly, extension, rotation, carry, hold). Pattern × posture (standing, seated, incline, decline, lying, kneeling, hanging) × equipment (barbell, dumbbell, kettlebell, cable, machine, band, bodyweight) gives most named gym exercises. Names and text come from free-exercise-db and wger and are matched to a pattern.

Honest target: 50 hand-reviewed, 300+ generated at first release, growing toward the roughly 1,200–1,500 unique entries in open data. "Every exercise in the world" is not a finite list. Build-your-own covers the rest.

Equipment: real models (flat and adjustable bench, rack, barbell and plates, dumbbells, kettlebell, cable column, lat machine, leg press, leg extension and curl, pull-up rig, box, mat). CC0 sources or built in Blender. No placeholder boxes in a reviewed exercise.

## 6. Task builder (R5)

| Step | Options |
|---|---|
| Object | Box, bucket, bag, child, suitcase, gas cylinder, furniture edge, mop or broom, none |
| Weight | Slider, 0–50 kg |
| Where it starts | Floor in front, floor to the side, knee height, table, shelf, overhead |
| Action | Pick up, put down, carry, push, pull, climb step, sit down, stand up, reach, bend and hold |
| Style | Each action ships two or three ways of doing it. Pick up: stoop, squat, one-hand, golfer's lift. |
| Edit | Open any keyframe. Drag joints. Effort updates live. |
| Compare | Pin one version. Edit another. See both side by side with the differences in words. |

Outputs: per-muscle effort, lower-back moment in Nm with a low/medium/high band, balance warning when the centre of mass leaves the feet.

## 7. My model (R6)

Profile: sex (male or female, asked on first launch), height, body mass. Stored on the phone only. Sex selects the pelvic-floor and sexual-health programs in section 10. It can be changed later in My model.

Conditions. Each is a posture offset on the rig plus notes.

| Condition | Posture offset (start values) | Shown |
|---|---|---|
| Anterior pelvic tilt | Pelvis tilts forward 8–15°, lumbar arch increases, hips rest slightly flexed | Changed joint angles in every pose. Muscles commonly called short (hip flexors, lumbar erectors) and long (glutes, abdominals). |
| Posterior pelvic tilt | Reverse of the above | Same pattern |
| Forward head | Lower neck flexes, upper neck extends | Higher neck extensor demand from the engine |
| Rounded shoulders, thoracic kyphosis | Thoracic flexion, shoulder blades forward | Reduced overhead range. Pressing shifts. |
| Knee valgus | Hip adduction and internal rotation under load | Knee tracking warning in squats and steps |
| Flat feet | Ankle rolls in | Tibialis posterior demand |
| Limited range at a joint | User sets a tighter limit | Exercises that need more range are flagged |

Rules:
- Severity is a slider. Default is mild.
- The engine recomputes everything with the offset applied. Show "typical vs mine" as a difference list.
- The "often tight / often weak" lists are clinical convention with mixed evidence. Label them that way. Never present them as a diagnosis.
- Suggest exercises commonly used for the condition, labelled as general information.

Fat:

| Input | How |
|---|---|
| By hand | Sliders per region (arms, trunk, legs) and a deep-belly level |
| InBody sheet | Photo → read numbers → user confirms → apply |

- Show fat by thickening the skin layer per region. Show deep-belly fat inside the abdomen around the real organ meshes.
- Extra mass feeds the engine: heavier segments change joint demand. This is a real, checkable effect.
- Organs affected: deep-belly fat → liver, pancreas, heart and vessels, kidneys, intestines. Under-skin fat → no specific organ.
- Reduction: state plainly that fat cannot be removed from one chosen spot. Then: calorie deficit, cardio, strength training, sleep, less alcohol and sugary drinks.
- Education, not diagnosis. Show that line. Health numbers never leave the phone.

## 8. Architecture

v5 pages: `src/ui/body/` (Body page), `src/ui/workouts/` (exercises, tasks, move, programs), `src/ui/me/`. Body data loader in `src/body/`. Pipeline in `tools/pipeline/`; reference sample in `tools/sample/`.

```
src/
  body/      load glTF, parts index, layers, picking
  rig/       joints, limits, skinning, IK, pose and keyframe types
  engine/    effort engine (no three.js imports), action table, strengths
  library/   exercises, patterns, tasks, equipment
  me/        profile, conditions, fat
  ui/        screens, panels, joint handles, timeline
tools/       data pipeline (Python), importers
public/data/ body.glb, parts.json, actions.json, exercises.json
```

Rules: the engine is a pure module with tests. Data lives in JSON, not in code. Every data file has a `sources` field.

## 9. Phase 2 outline

Plan builder (balances weekly volume per muscle using engine output), workout log and progression, camera form check (phone pose detection compared with keyframes and `formChecks`), food photo log (draft from a vision model, user corrects, daily total against a target).

## 10. Programs (R6)

A program is an ordered list of exercises with a dose. Every item is a normal Exercise record (section 5), so it plays on the body and the engine shows the muscles.

```
Program
  id, title, audience            all | male | female
  linkedConditions[]             conditions from section 7 that suggest this program
  items[]                        exerciseId, sets, reps or holdSeconds, frequency
  evidence[]                     claim, source, strength (strong | moderate | weak | convention)
  cautions[]
```

Rules for all programs:
- Each on-screen claim carries its source and an evidence label.
- Education, not treatment. Pain, numbness or a lasting problem: the app says see a clinician.
- Doses are start values. Confirm each against a clinical guideline during M6b and record the source.

### 10.1 Posture correction

| Target | Exercises |
|---|---|
| Forward head | Chin tuck, deep neck flexor hold, upper trapezius and levator scapulae stretch |
| Rounded shoulders, thoracic kyphosis | Thoracic extension over a roller, wall slide, band pull-apart, face pull, prone Y and T raise, doorway chest stretch |
| Trunk control | Dead bug, bird dog, front plank, side plank, hip hinge drill |
| Knee valgus | Side-lying hip abduction, banded lateral walk, single-leg squat to a box |
| Flat feet | Short-foot drill, calf raise with slow lowering, towel curl |

Choosing a condition in My model suggests the matching program. The evidence that exercise changes standing posture is mixed. Label these "convention" unless a trial is cited.

### 10.2 Anterior pelvic tilt

| Aim | Exercises |
|---|---|
| Lengthen the front of the hip | Half-kneeling hip flexor stretch, couch stretch for rectus femoris |
| Strengthen what tilts the pelvis back | Glute bridge, hip thrust, dead bug, reverse crunch, plank held with the pelvis tucked |
| Hamstrings | Romanian deadlift, hamstring curl |
| Control | Standing and lying pelvic tilt practice: tilt forward, tilt back, find the middle |

Show the pelvis and lumbar spine from the side during each one, with the tilt angle. State plainly: pelvic tilt varies between people, a forward tilt is common, and it often comes with no pain.

### 10.3 Pelvic floor (both sexes)

Body data: the meshes exist for pubococcygeus, iliococcygeus, coccygeus (left and right) and the external anal sphincter. Add a view from below with the pelvis bones translucent.

| Step | Content |
|---|---|
| Find the muscles | Cue in words. Show the muscles lifting on the model. |
| Slow holds | Squeeze and lift, hold, then relax fully for the same time. Build the hold up gradually. |
| Quick squeezes | Short, strong contractions with full release between them. |
| Progress | Lying, then sitting, then standing, then during a lift or a cough. |
| Relaxation | Diaphragmatic breathing, deep squat hold, happy-baby pose. For people whose pelvic floor is tense, relaxing matters more than squeezing. |

Rules:
- These muscles do not hold a joint against gravity, so the effort engine cannot compute them. Highlight them from the exercise record. This is the one allowed exception to "muscles come from the engine". Mark it in the data.
- Do not teach stopping urine mid-flow as a routine exercise.
- Pain, or symptoms getting worse: stop and see a pelvic health physiotherapist.

Evidence to show: for women with stress urinary incontinence, pelvic floor training made a reported cure about eight times more likely than no treatment (Cochrane review, 31 trials). Label: strong.

### 10.4 Sexual health, male

Asked for as "longevity and keeping an erection longer". Read this as long-term erectile health and ejaculation control.

| Component | Exercises | Evidence to show |
|---|---|---|
| Pelvic floor training | Section 10.3 holds and quick squeezes, plus control practice | A systematic review of 10 trials found it appears effective for erectile dysfunction and premature ejaculation. Trial quality was low to moderate and no best protocol is known. Label: moderate. |
| Aerobic exercise | Brisk walking, cycling, running, swimming, on a weekly schedule | A meta-analysis of 11 randomised trials (1,147 men) found erectile function scores improved by 2.8 points on a 6–30 scale, more in men who started lower. Label: moderate. |
| Strength and weight | Whole-body strength work from the Exercises library. Link to the fat view. | General health link. Label: convention unless a trial is cited. |

Rules:
- No exercise makes the penis longer or larger. Say so. Do not include jelqing, stretching devices or supplements.
- Erection problems that last can be an early sign of heart, blood-vessel or blood-sugar disease. The app says see a doctor.
- The muscles most involved (bulbospongiosus, ischiocavernosus) are not in Z-Anatomy either (PLAN section 10). Show the region, or add simple meshes, and say which.

### 10.5 Sexual health, female

| Component | Exercises | Evidence to show |
|---|---|---|
| Pelvic floor training | Section 10.3 | The same Cochrane review reports better sexual outcomes in the training groups. Label: moderate. |
| Pelvic floor relaxation | Section 10.3 relaxation set, hip mobility | For pain or tension. Label: convention. |
| General fitness | Aerobic and strength work from the library | Label: convention. |

Rules:
- During pregnancy and after birth: the app says check with a clinician before starting.
- The female body is the warped female model (PLAN D4). Female reproductive organs are simplified shapes; the card says so.

### 10.6 Presentation

- Clinical wording. Anatomical model only. No explicit imagery.
- Confirm the user is 18 or over before opening a sexual-health program.
- Nothing in these programs, and no answer to the first-launch question, leaves the device.

### 10.7 Sources

- Myers and Smith 2019, Physiotherapy 105(2): https://pubmed.ncbi.nlm.nih.gov/30979506/
- Khera, Bhattacharyya and Miller 2023, Journal of Sexual Medicine 20(12): https://pubmed.ncbi.nlm.nih.gov/37814532/
- Dumoulin, Cacciari and Hay-Smith 2018, Cochrane CD005654: https://www.cochrane.org/evidence/CD005654
