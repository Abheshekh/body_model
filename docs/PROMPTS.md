# Claude Code prompts

One prompt per milestone. Paste one, review the checkpoint, then paste the next. Do not paste two at once.

Every prompt assumes Claude Code is opened in the repo root and can read `CLAUDE.md`, `docs/PLAN.md` and `docs/SPEC.md`.

---

## M1 — Body pipeline and Explore screen

```
/feature-build M1: body pipeline and Explore screen

Read first: CLAUDE.md, docs/PLAN.md, docs/SPEC.md sections 1 and 8, tools/anatomy-spike/ (build_body.py, render.html), docs/preview/*.png.

Goal
Show the real anatomical body in the browser. One mesh per muscle. Fast enough for a mid-range Android phone.

Build
1. Scaffold: Vite + TypeScript + three.js (current stable), Vitest, ESLint. Folder layout from SPEC section 8.
2. Pipeline in tools/pipeline/ (Python). Start from tools/anatomy-spike/build_body.py:
   - fetch BodyParts3D with a partial clone, only the parts needed
   - classify parts by name into muscle, tendon, bone, cartilage, organ, skin
   - simplify per part to a phone budget (start at 400k triangles total, make it a config value)
   - convert to metres, Y up, +Z front, +X the body's left
   - export one compressed glTF binary with one named mesh per part
   - write parts.json: FMA id, name, plain name, kind, side, layer (superficial or deep), muscleKey (null for now)
   - search the full parts list for heart and pancreas and add them if present
3. Explore screen:
   - load the body, orbit camera, front / side / back buttons
   - layer toggles: skin, superficial muscles, deep muscles, skeleton, organs
   - tap a part: card with plain name and anatomical name
   - search a muscle by name and fly the camera to it
   - a highlight API the later milestones will use: setPartColor(id, color, level), clearHighlights()
4. Credits screen with the BodyParts3D attribution text from its LICENSE_content file.

Acceptance
- The body matches docs/preview/body-1-front-back.png in shape and completeness.
- Pipeline test: at least 340 muscle parts and 190 bone parts classified. No artery, nerve or brain part slips in.
- Report real numbers: triangle count, file size, load time, frames per second on desktop and on one Android phone over LAN.
- npm run build and npm test pass.

Out of scope
Rig, joint movement, effort engine, exercises, My model. Do not start them.

Checkpoint
Stop. Write docs/reports/M1.md with screenshots, the numbers above, the layer classification you are least sure about, and open questions. Update docs/PLAN.md and docs/SPEC.md if any decision changed.
```

---

## M2 — Rig and Move screen (go/no-go)

```
/feature-build M2: rig, skinning and the Move screen

Read first: CLAUDE.md, docs/PLAN.md, docs/SPEC.md sections 2 and 3, docs/reports/M1.md.

Goal
Make the anatomical body bend at every major joint with the muscles staying attached, and let me pose it by hand.

Build
1. Locate joints from the bone meshes (SPEC section 2 table). No hand-typed coordinates. Save them to data.
2. Joint limits per axis from standard range-of-motion tables. Store in JSON with a source for each.
3. Skinning: assign every muscle to a chain and a bone range by name, then compute vertex weights as SPEC section 2 describes. Bones rigid. Skin by region.
4. Two-bone IK for planted feet. Moving the pelvis bends hips, knees and ankles together.
5. Move screen (SPEC section 3):
   - click a joint handle to select it; drag to move the limb inside its limits
   - ctrl + drag orbits the camera; drag on empty space also orbits
   - panel with a slider and a number field for each axis of the selected joint
   - pelvis, hand and foot handles
   - undo, redo, reset joint, reset body
6. Pose type and keyframe type as plain JSON. Save and load a pose.

Acceptance
Screenshots of these poses, from front and side, with no muscle torn away from its bone and no mesh turned inside out:
elbow 90 and 140, shoulder raised sideways 90 and 170, shoulder raised forward 90, hip flexed 90, knee 120, trunk bent forward 45, deep squat with feet flat, arms overhead.
Unit tests for joint limits and IK. Frames per second still inside the M1 target.

If the skinning fails
Do not keep tuning past two attempts. Switch to the fallback in SPEC section 2 (rigid muscle segments with blended joint caps), show both results, and say which one you recommend.

Out of scope
Effort engine, exercises, tasks, My model.

Checkpoint
Stop. Write docs/reports/M2.md: the screenshots, what looks wrong and where, go or fallback, and the rule table that maps muscle names to chains.
```

---

## M3 — Effort engine

```
/feature-build M3: effort engine and live muscle highlighting

Read first: CLAUDE.md, docs/PLAN.md section 4, docs/SPEC.md section 4, docs/reports/M2.md.

Goal
Compute which single muscles work, and how hard, from the pose, the supports and the loads. No hand-written muscle lists per exercise.

Build
1. src/engine/ as a pure TypeScript module with no three.js imports. Signature and steps exactly as SPEC section 4.
2. Data files, each entry with a source:
   - segments.json: mass fractions and centre-of-mass positions
   - strengths.json: strength per joint axis and direction
   - actions.json: every muscle key with its actions and weights; map every muscle part from parts.json to a muscle key
3. Supports and loads as data: floor, seat, back pad, bench, bar in hands, hands or forearms on floor; free weight, cable with a pulley point, machine pad.
4. The extra rules from SPEC section 4 step 8, each in its own function with its own tests.
5. Wire it to the Move screen: muscles colour by role and level as I drag joints. Add a load picker (weight in each hand, 0 to 50 kg) and a support picker.
6. Muscle panel: sorted list with level bar, role, and the reason in words ("holds the trunk up against 10 kg in front of you").
7. Lower-back moment in Nm and a balance warning.

Acceptance
The six must-pass cases in SPEC section 4 as automated tests, asserting the direction of change, not exact numbers.
A short table in the report: for each case, the top eight muscles the engine returns.
Review the 40 largest muscles in actions.json by hand against an anatomy reference and list any you changed.

Out of scope
Exercise library, tasks, My model.

Checkpoint
Stop. Write docs/reports/M3.md with the tables above, known wrong results, and what the engine cannot model.
```

---

## M4 — Exercises

```
/feature-build M4: exercise library with correct form

Read first: CLAUDE.md, docs/SPEC.md section 5, docs/reports/M3.md.

Goal
A searchable exercise library where every exercise animates with correct form on the real body and shows computed muscle effort.

Build in two steps. Stop for review after step 1.

Step 1: 50 reviewed exercises
- Exercise record and pattern record as SPEC section 5.
- Equipment models as glTF: flat and adjustable bench, rack, barbell with plates, dumbbells, kettlebell, cable column, lat machine, leg press, leg extension and curl, pull-up rig, box, mat. CC0 sources or built for the project. Record the source of each. No placeholder boxes.
- Keyframes for 50 common exercises covering every pattern. Feet planted by IK. Hands fixed to the bar where there is one.
- Form checks as machine-checkable rules, and run them on every keyframe.
- Exercise screen: search, filters (body part, equipment, pattern), variation switch, load slider, play and scrub, muscle panel from the engine, joints moving and held, cues and mistakes, "compare with" another variation.
- Keyframe editor: open a keyframe, drag joints, see effort change, save as my variation.

Step 2: scale
- Import names and text from free-exercise-db and wger, match each to a pattern, posture and equipment.
- Generate the library from patterns. Mark every generated exercise reviewed: false and show that in the UI.
- Report how many imported names matched a pattern and list the ones that did not.

Acceptance
Step 1: a contact sheet of all 50 at start and end pose. Zero failing form checks.
Step 2: 300 or more exercises, each playable, none with a body part passing through equipment.

Checkpoint
Stop after each step. Write docs/reports/M4-step1.md and M4-step2.md.
```

---

## M5 — Task builder

```
/feature-build M5: task builder

Read first: CLAUDE.md, docs/SPEC.md section 6, docs/reports/M4-step1.md.

Goal
Let me build an everyday task, change how I do it, and see which muscles and how much lower-back load each way costs.

Build
- Objects with models and a weight slider (SPEC section 6 list).
- Start positions for the object.
- Actions, each with two or three styles as keyframes: pick up, put down, carry, push, pull, climb step, sit down, stand up, reach, bend and hold.
- The object attaches to the hands at the right keyframe and its weight feeds the engine from that moment.
- Keyframe editing by dragging joints, same editor as M4.
- Compare: pin one version, edit another, show both with a difference list in words.
- Outputs: muscle panel, lower-back moment with a band, balance warning.

Acceptance
Pick up 10 kg from the floor: the stoop style and the squat style show the shift from back to legs described in SPEC section 4.
Carrying in one hand vs split between two hands shows the opposite-side trunk muscles rise and fall.
I can start from "pick up, stoop", drag the knees and hips into a squat, and watch the numbers change live.

Checkpoint
Stop. Write docs/reports/M5.md.
```

---

## M6 — My model

```
/feature-build M6: My model (conditions and fat)

Read first: CLAUDE.md, docs/SPEC.md section 7, docs/reports/M3.md.

Goal
Show how my body differs from a typical one and what that changes in every movement.

Build
- Profile: height, body mass, sex. Stored on the device only.
- Conditions from SPEC section 7 as data: posture offsets, severity slider, notes, sources. Start with anterior pelvic tilt and get it right before adding the rest.
- "Typical / mine" toggle on every screen. The engine recomputes with my offsets and my segment masses. Show a difference list.
- Fat: sliders per region and a deep-belly level. Thicken the skin layer per region. Show deep-belly fat around the real organ meshes.
- InBody sheet import: photo or file, read the numbers, I confirm each value, then apply. If on-device text reading is not reliable, fall back to a typed form with the same fields.
- Organs affected and how to reduce, with the exact rules in SPEC section 7. Cite sources on screen.

Rules
- No health value leaves the device. No analytics on this screen.
- Never commit real personal numbers to the repo. Use invented sample values in tests and fixtures.
- Education wording only. No diagnosis.

Acceptance
Anterior pelvic tilt at mild, medium and strong: screenshots from the side, plus the difference list for standing, squat and deadlift.
Adding 20 kg of trunk fat raises lower-back and hip demand in standing poses, as a test.
A sample sheet image imports with every value shown for confirmation.

Checkpoint
Stop. Write docs/reports/M6.md, including every medical claim on screen with its source.
```

---

## M6b — Programs

```
/feature-build M6b: programs (posture, pelvic tilt, pelvic floor, sexual health)

Read first: CLAUDE.md, docs/SPEC.md sections 5, 7 and 10, docs/reports/M4-step1.md, docs/reports/M6.md.

Goal
Ready-made routines the user can follow, each exercise shown on the real body, each health claim sourced.

Build
- First-launch screen: male or female, height, body mass. Stored on the device only. Editable later in My model.
- Program record and Programs screen as SPEC section 10.
- Posture correction and anterior pelvic tilt programs. Every exercise is a normal Exercise record with reviewed keyframes. Link them from the matching condition in My model.
- Pelvic floor program for both sexes. Add the pelvic floor meshes to the pipeline if they are not in the build, and a view from below with the pelvis translucent. Highlight these muscles from the exercise record (the documented exception to the engine rule).
- Sexual-health program per sex, exactly as SPEC sections 10.4 and 10.5. Show only the one that matches the profile. 18+ confirmation before it opens.
- Evidence labels and sources on screen for every claim. Confirm each dose against a clinical guideline and record the source in the data.

Rules
- No claim beyond SPEC section 10. No size or length claims. No jelqing, devices or supplements.
- Clinical wording. Anatomical model only.
- No profile value or program state leaves the device.

Acceptance
Each program plays end to end with no failing form check.
A table in the report: every claim shown on screen, its source and its evidence label.
Male profile never shows the female program, and the reverse, as a test.

Checkpoint
Stop. Write docs/reports/M6b.md.
```

---

## M7 — Android build

```
/feature-build M7: Android build

Read first: CLAUDE.md, docs/PLAN.md, all docs/reports.

Goal
Install the app on my Android phone. It must work with no network.

Build
- Capacitor wrap. All data bundled. No runtime network calls.
- The repo has a Makefile: `make apk` and `make aab` write to ./output. Keep both working. Fix the Makefile if the Capacitor setup differs from what it assumes.
- Touch controls checked on a real phone: joint drag, one-finger orbit on empty space, pinch zoom.
- Camera permission only where the sheet import needs it.
- Credits and licences screen complete. Medical disclaimer screen.
- A release checklist in docs/RELEASE.md for the Play Store: health-content policy, privacy policy, data safety form, attribution. Mark each item verified or not verified with a link.

Acceptance
A debug APK installs and runs offline. Frames per second and load time on the phone reported.

Checkpoint
Stop. Write docs/reports/M7.md.
```
