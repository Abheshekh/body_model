# Body Model — spec

Companion to `docs/PLAN.md`. Says how each part must work. Numbers marked "start value" are tuning points, not facts.

## 1. Body data

Source: BodyParts3D. 934 STL parts, each named by an FMA id (`parts_list_e.txt`). Units are millimetres. Axes: x runs right to left, front is −y, z is up. Height about 1.64 m.

| Kind | Parts | Notes |
|---|---|---|
| Muscle | 352 | Separate left and right. Heads are separate parts (for example long and short head of biceps). |
| Tendon, aponeurosis, fascia | 11 | Render pale. |
| Bone | 195 | Every vertebra, rib and phalanx is its own part. |
| Cartilage, discs | 39 | |
| Skin | 1 | Whole-body surface. Used for the skin layer and the fat view. |
| Organs found so far | 8 | Liver, stomach, both kidneys, duodenum, jejunum, ileum, rectum. Heart and pancreas need a name search in the full list. |

Pipeline (M1):
1. Classify parts by name. Start from `tools/anatomy-spike/build_body.py`.
2. Simplify per part. Test budget was 1.02 million triangles total (7% of each muscle, 3.5% of each bone, 60 thousand for skin). Phone target 300–500 thousand.
3. Convert to metres, Y up, +Z front, +X the body's left.
4. Export glTF binary with one named mesh per part, compressed (Draco or meshopt).
5. Write `parts.json`: FMA id, name, kind, side, layer (superficial or deep), muscle key (section 4).

The source meshes are smooth. They have no fibre texture. Add a simple procedural fibre normal map later if wanted. Do not promise the sculpted look of paid models.

## 2. Rig (M2)

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

## 3. Interaction (M2)

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

## 4. Effort engine (M3)

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

## 5. Exercises (M4)

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

## 6. Task builder (M5)

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

## 7. My model (M6)

Profile: height, body mass, sex. Stored on the phone only.

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
