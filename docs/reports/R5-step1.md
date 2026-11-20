# R5 step 1: exercise library and task builder (report)

Branch `r5-library-tasks` (from `r4-effort-engine` 9b3a664). Commit: 510df99. Numbers come from plans/raw/*.md under docs/done_development/r5-library-tasks/plans/ (cases.md, form.md, review.md, measure.md, equipment-review.md, wrist.md).

## AC status
- AC1 50 records, zero failing form checks, contact sheets: **partly met**. 50 records, schema-valid, all sourced; `tools/library/check.mjs` says `failing: 0 of 50` (364 checks over both sexes, none failing). Contact sheets exist (docs/reports/r5/contact-male.png, contact-female.png). `reviewed: true` on **25 of 50** only: the other 25 tiles could not be confirmed (list in section 4). That is a decision by the user on 2026-11-21: finish them in step 2.
- AC2 equipment built for the project, gate: **met**. The user approved the equipment sheets (equipment-gym.png, equipment-objects.png) after one fix round. Credits list it.
- AC3 exercise screen: **met** (search, filters, Variation, load, play, Compare with A/B and ghost, Edit). Phone layout `layout ok` at 390x844. Compare at 900 px and over: checked by the compare screenshot only.
- AC4 keyframe editor: **met** (editor.png). Save/revert on device only.
- AC5 task builder: **met** (numbers in section 3).
- AC6 pure engine/library, build, test, lint, APK: **met**. 504 tests pass, lint and tsc clean, `make apk` builds.
- AC7 this report and the step 2 prompt: **met**.

## 1. What was built
- **Exercise record v2** (`public/data/exercises.json`, SPEC section 5): flat, 50 records (22 migrated R4 variants, 28 new), `family` groups them for the Variation picker. Fields: id, name, family, aliases, pattern, posture, equipment, bodyParts, props, placement, loads, keyframes, cam, cues, mistakes, formChecks, note, sources, reviewed. No muscle list anywhere (grep A12 is empty); effort comes from the engine.
- **Equipment** (`public/data/equipment.json`, `src/ui/workouts/equipment.ts`, `materials.ts`, `objects.ts`): built in code, powder-coated steel, chrome, upholstery, rubber, bevels. 15 gym items and 12 task objects (27 tiles). One data file drives the mesh, the contact surfaces and the colliders, so the form checks and the picture agree. Source "built for the project", licence "ours (project licence)" on every item; no CC0 model was used. The child is labelled "simplified".
- **Form checks** (`src/library/form.ts`, pure): limits, balance, contacts, clearance, plus per-record kneeOverFoot and neutralSpine. Run on every keyframe and 3 in-betweens, both sexes.
- **Exercise screen** (`src/ui/workouts/library.ts`, `player.ts`): search, filter chips, grouped list, Variation, load sliders, play, form summary line, cues and mistakes. Sheet rule held: collapsed = title, variation, transport, legend, one line.
- **Compare** (`src/library/compare.ts`, `src/ui/workouts/compare-ui.ts`): one body, A/B switch, translucent ghost of the other pose, differences in words, side-by-side columns from 900 px.
- **Keyframe editor** (`src/library/edits.ts`, `editor.css`, route `#workouts/edit/<kind>/<id>`): add, remove, reorder (at least 2 kept), drag joints, live effort and checks, save and revert in localStorage.
- **Task builder** (`src/library/taskgen.ts`, `public/data/taskbuilder.json`, `taskbuilder.ts`): action x style x object x start with presets, templates + IK + balance fix, lumbar band and balance warning. `tasks.json` and `props.ts` are deleted.

## 2. The 50 records
Migrated (22): barbell-curl, seated-dumbbell-curl, preacher-curl, overhead-press, seated-dumbbell-press, bench-press, push-up, bent-over-row, seated-cable-row, pull-up, lat-pulldown, back-squat, leg-press, deadlift, romanian-deadlift, lateral-raise, seated-lateral-raise, triceps-pushdown, overhead-triceps-extension, plank, standing-calf-raise, seated-calf-raise.
New (28): hammer-curl, incline-dumbbell-curl, dumbbell-bench-press, incline-bench-press, dumbbell-fly, cable-fly, bench-dip, one-arm-dumbbell-row, chin-up, face-pull, band-pull-apart, dumbbell-shrug, front-raise, rear-delt-fly, goblet-squat, front-squat, reverse-lunge, bulgarian-split-squat, step-up, hip-thrust, glute-bridge, kettlebell-swing, leg-extension, lying-leg-curl, side-plank, crunch, farmer-carry, pallof-press.

## 3. Acceptance numbers
Form table (plans/raw/form.md): 364 checks, 0 failing. Per check: limits 100, clearance 100, balance 76, contacts 48, neutralSpine 26, kneeOverFoot 14 (50 records x 2 sexes where the check applies).

Task cases (plans/raw/cases.md, 10 kg, peak over keyframes, levels 0..1):

| Case | Male | Female |
|---|---|---|
| Pick up bucket, lower back stoop to squat | 116.0 to 92.3 Nm | 131.9 to 106.0 Nm |
| Vastus lateralis stoop to squat | 0.02 to 0.35 | 0.01 to 0.31 |
| Rectus femoris stoop to squat | 0.02 to 0.35 | 0.01 to 0.31 |
| Carry, left external oblique, one hand to 5+5 | 0.18 to 0.02 | 0.16 to 0.06 |
| Carry, left quadratus lumborum | 0.23 to 0.00 | 0.20 to 0.02 |
| Carry, left gluteus medius | 1.00 to 0.80 | 0.90 to 0.67 |
| Carry lower back one hand to 5+5 | 24.4 to 2.9 Nm | 25.1 to 11.6 Nm |

The squat bottom still has a negative balance margin (male -0.089 m, female -0.049 m) and the one-hand and split carry second keyframe always carries the "cannot balance this pose" warning (by design, the carry stands on the left leg). The stoop is at the edge (male +0.004 m, female -0.011 m).

Engine timing (tools/engine/cases.mjs --time): effort 0.20 to 0.21 ms, effortOverMove over 9 samples 1.95 to 2.11 ms.

## 4. Contact sheets and review
Sheets: docs/reports/r5/contact-male.png and docs/reports/r5/contact-female.png (mid pose, 50 tiles each). One line per tile in plans/raw/review.md. An OK is one frame at 0.55 scale where no fault was seen, not a form proof.

**25 reviewed true:** barbell-curl, seated-dumbbell-curl, bent-over-row, leg-press, deadlift, romanian-deadlift, lateral-raise, seated-lateral-raise, seated-calf-raise, hammer-curl, front-raise, farmer-carry, band-pull-apart, pallof-press, dumbbell-bench-press, dumbbell-fly, rear-delt-fly, kettlebell-swing, reverse-lunge, incline-dumbbell-curl, hip-thrust, crunch, leg-extension, bench-dip, bulgarian-split-squat.

**25 reviewed false (reason, from review.md):**
- preacher-curl: no preacher pad visible, bar floats.
- overhead-press, seated-dumbbell-press: tile crops hands and top of body.
- bench-press, incline-bench-press: rack and plates hide the body.
- push-up: no visible hand-floor contact at mid pose.
- seated-cable-row, face-pull, triceps-pushdown: machine cropped or hiding hand contact.
- pull-up, chin-up: rig bar out of frame or body cropped.
- lat-pulldown: bar out of frame, thigh pad covers legs.
- back-squat, front-squat, goblet-squat: head or feet cropped, rack hides bar.
- overhead-triceps-extension: cropped, machine covers half the body.
- plank: cropped at the right edge.
- standing-calf-raise: no heel rise readable at this scale.
- dumbbell-shrug: known gap, no scapular lift.
- cable-fly: known gap, one cable column for a two-handed fly.
- glute-bridge: needs new keyframes (hips do not lift at mid pose, pelvis dips below the mat line).
- lying-leg-curl: body cropped, pad contact unconfirmed.
- side-plank: reads as a twisted heap above the mat.
- one-arm-dumbbell-row: known gap, both dumbbells drawn.
- step-up: known gap, weight on the lead leg only, rear leg trails.

## 5. Screenshots (docs/reports/r5/)
- equipment-gym.png (15 tiles) and equipment-objects.png (12 tiles): equipment sheets approved at the gate. Weak spots after the fix round: band floats at rest, plyo-box tread too fine to read, mat looks thin from far, loaf and bottle cap simple, chair grain reads as stained board (plans/raw/equipment-review.md).
- contact-male.png, contact-female.png: the 50-tile review sheets.
- library-search.png: search "curl" with a filter chip.
- player-compare-ghost.png: Compare with the ghost visible (it was invisible before the fix, see section 7).
- editor.png: keyframe editor.
- builder-stoop.png, builder-squat.png: stoop vs squat pick-up.
- builder-carry-one-hand.png and builder-carry-split.png: one-hand vs split carry.

## 6. Measurements
- APK: `rm -f output/body-model-debug.apk && make apk` (Node 24.15.0): output/body-model-debug.apk = **20,963,609 bytes** (20.0 MiB), rebuilt after the fix round. R4 was 20,917,543.
- Tests: 504 pass (baseline 332), lint and tsc clean, `npm run build` ok.
- Desktop fps, player, back-squat playing, 10 s: **3 fps (30 frames)** in headless Chrome on SwiftShader (software GL, 390x844). Not representative of a GPU. No GPU run was made.
- **Phone fps: unmeasured.** `adb devices` lists no device.
- Phone layout (tools/library/layout.mjs, 390x844): `layout ok` for library, player, editor and builder, collapsed and open. The body box is measured by a colour heuristic.

## 7. Doc and data changes made
- `public/data/tasks.json` deleted; the task presets live in taskbuilder.json, the generator in taskgen.ts. `src/ui/workouts/props.ts` deleted (equipment.ts replaces it).
- Four test files trimmed (cases.test.ts, data.test.ts, library/data.test.ts, pin.test.ts): the stoop/squat and carry cases and the 12 task-variant pin tests moved to `src/library/taskgen.test.ts` (stoop vs squat at line 166). No exercise assertion was weakened or removed.
- Ghost opacity fix in `src/body/scene.ts` createGhost (ShaderMaterial `opacity` was never a uniform, so alpha was 0).
- `public/data/joints.json` pelvis pitch min -90 to -120 (glute-bridge hip lift; the tile still needs new keyframes).
- Camera zoom 0.85 while the sheet is open (the viewer caps camera distance at 6 m), so the open sheet does not cover the body at 390x844.
- T13 "reviewed" rule changed from "all tiles OK or stop" to the OK count (user decision 2026-11-21).
- SPEC sections 5 and 6 and the PLAN R5 row updated in the same commit.

## 8. Known gaps
- **25 tiles not reviewed** (section 4); their `reviewed` stays false.
- glute-bridge needs new keyframes; one-arm row draws both dumbbells; cable-fly draws one column; shrug has no scapular lift; step-up weight is on the lead leg; side-plank looks twisted; preacher-curl has no pad drawn.
- **Lumbar overcount**: trunk mass sits on spine_02, so `lowerBack.momentNm` is overcounted. The band label says "estimate"; no injury threshold is claimed.
- **Skinning** (R3 gap): tears at extreme shoulder poses and folds at hip, elbow, knee are not fixed. The review lines do not name a tile as a skinning fault; the side-plank "twisted heap" tile may be one and needs a look in step 2.
- **Wrist strengths not verified** (plans/raw/wrist.md): flexion +0.12 / -0.08, deviation +0.10 / -0.12 Nm per kg kept, status "not verified". Delp isometric means for a 75-80 kg adult would be about 0.15 and 0.09 Nm/kg, the same order, but the sources were read from snippets only.
- Compare keeps the pin across a Variation change but draws the new record's equipment.
- Builder, compare and editor were looked at only through the T13 screenshots; no manual run on a phone.
- Desktop fps (3) is software GL and untrustworthy; phone fps unmeasured.
- Squat-bottom and carry balance margins are negative in the task cases (section 3); the warning shows.
- 6 of the largest 40 muscles are unmodelled by design (R4).

## 9. Hand-off to step 2
Import and generate 300+ from free-exercise-db (public domain) and wger (check each entry's licence, credit it). See docs/prompts/next.md.

## Review findings carried to the next steps (Sonnet reviewer, 11 low, 0 high)
- Test plan A6 (all 50 `reviewed`) fails by decision: 25 of 50 are reviewed (user, 2026-11-21). Tester run: 20 pass, 1 expected fail.
- Saved versions: stored per `<kind>/<id>` without sex, so a version edited on one body is wrong on the other (root offsets, seat contacts about 4 cm, estimate not measured); all custom tasks share one key `tasks/custom`, so one task's saved version loads for another. Fix in R6/R7 (key by sex and by task settings).
- Three assertions of the old stoop/squat case did not move to taskgen.test.ts (stoop higher hamstrings and erectors, squat glutes >= 90% of stoop, balance flag).
- No `npm test` asserts 50 records or formChecks on all (only tools/library/check.mjs); back-squat test checks limits, clearance, neutralSpine only; leg-press has no neutralSpine check (seated machine, undocumented); compare.test.ts does not assert the 6-line cap or the ranking.
- Load labels missing for kettlebell, band, hipBar, legext, legcurl, crossover, child, suitcase, and LOAD_NAME is duplicated in player.ts and move.ts.
- supports.json `floorForearms` is unused; no preacher pad item exists.
