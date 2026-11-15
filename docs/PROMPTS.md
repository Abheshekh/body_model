# Claude Code prompts (plan v5)

Two ways to run:
- **Master prompt**: paste once. It runs R0 → R7 in order and stops at every checkpoint for your sign-off. Reply "go" to continue.
- **One milestone**: paste a single R prompt.

Every prompt assumes Claude Code is opened in the repo root and reads `CLAUDE.md`, `docs/PLAN.md` and `docs/SPEC.md` first. The approved visual target is the sample built by `tools/sample/` (see `tools/sample/README.md`).

---

## Master prompt

```
/feature-build Body Model v5: complete male and female human, Body page and Workouts page

Read first: CLAUDE.md, docs/PLAN.md (v5), docs/SPEC.md, docs/PROMPTS.md, tools/sample/README.md and its scripts, docs/reports/.

You will build milestones R0 to R7 from docs/PROMPTS.md, strictly in order.
For each milestone:
1. Read its prompt section in docs/PROMPTS.md and follow it exactly: Goal, Build, Acceptance, Out of scope, Checkpoint.
2. Plan, build, test. Measure real numbers. No guesses presented as results.
3. At the checkpoint: write docs/reports/<R>.md with screenshots and numbers, update PLAN/SPEC if a decision changed, commit on a branch named after the milestone, then STOP and ask me to review.
4. Continue to the next milestone only when I reply "go". If I give feedback, fix it first and re-run that checkpoint.

Global rules
- Free assets only (Z-Anatomy CC BY-SA 4.0, MakeHuman CC0, public-domain exercise data). Never add a paid asset.
- Data in JSON with sources. Engine is pure TypeScript with tests. No hand-written muscle lists for exercises after R4.
- Generated stand-in meshes only where PLAN section 10 allows, always labelled "simplified".
- Medical wording: education only, every claim sourced. Nothing personal leaves the device.
- Phone first: check every screen at 390 x 844. The body must never be hidden by UI.
- Never commit keystores, passwords or real personal numbers.
- Keep the Makefile targets `make apk` and `make aab` working, output in ./output.
- Organs are completed later in R8. Build every system as a separate data pack so R8 adds data, not UI. Do not start R8 inside this run.

Start with R0.
```

---

## R0 — Clean slate

```
/feature-build R0: clean slate for plan v5

Read first: CLAUDE.md, docs/PLAN.md, git status.

Goal
Keep the useful M1b work, remove what plan v5 replaces, and fix the two known bugs.

Build
1. Commit the current uncommitted M1b work to a new branch `m1b-archive`. Return to main.
2. On main, keep: Makefile, android/ and capacitor.config.ts, src/me/profile.ts (+tests), src/programs/ (+tests), public/data/programs.json. Bring them over from the archive branch.
3. Remove the "Below" view button from the UI. The pelvic camera opens only from a pelvic-floor program item.
4. Programs "Show" button: reproduce on desktop and at 390 x 844 headless, write a failing test, fix it once at the shared highlight path.
5. Copy tools/sample/ into the repo as given (it is reference code for R1 and R2).
6. Delete docs/REBUILD-PLAN.md (merged into PLAN v5) if it still exists.

Acceptance
- npm run build and npm test pass. The new test for "Show" passes.
- `make apk` still builds (report the APK size).

Checkpoint
Stop. Write docs/reports/R0.md.
```

---

## R1 — Body data pipeline (male + female, all systems)

```
/feature-build R1: body data pipeline from Z-Anatomy and MakeHuman

Read first: docs/SPEC.md sections 1 and 1A, tools/sample/ (za_export.py, mh_build.py, mh_fit.py, build_v3.py), docs/PLAN.md sections 4 and 10.

Goal
A tested, repeatable pipeline in tools/pipeline/ that produces the two bodies the sample shows, ready for the app.

Build
1. Port the sample scripts into tools/pipeline/ as small steps: fetch, export (bpy), clean, fibre, sheath, layers, AO, makehuman, pose, warp, sex parts, names, pack. One config file for ratios, budgets and paths. Sources fetched by git (partial clones), cached under tools/pipeline/cache/ (gitignored).
2. Follow SPEC section 1.3 exactly. Add layer_overrides.json with a reason per entry.
   Every system is its own pack with a manifest (pack name, kinds, part ids, file, size), so later packs (R8 organs) drop in.
   Move the heart chambers, valves and papillary muscles from "vessel" to "organ" (system "Heart"), so the Organs toggle shows the heart.
3. Split the pack into first-load (skin, muscle, tendon, bone, organ) and on-demand (vessel, nerve, lymph, joint) files. Budget: first load ≤ 10 MB compressed.
4. Write credits.json with Z-Anatomy, BodyParts3D and MakeHuman attributions.
5. Contact sheet script: fixed views (front, ¾, side, back, ¾ back, chest close-up, back close-up, pelvis) for male and female at Skin, Outer, Intermediate, Deep, Bones + organs.

Acceptance
- pytest: the tests listed at the end of SPEC section 1.3.
- Contact sheet matches the sample or better. Report triangle counts per kind, file sizes, build time.
- A table of the 30 most doubtful layer assignments (by exposure close to the threshold), with your proposed override for each.

Out of scope
App UI changes, rig, engine.

Checkpoint
Stop. Write docs/reports/R1.md with the contact sheets and tables.
```

---

## R2 — Body page

```
/feature-build R2: Body page (complete human explorer)

Read first: docs/SPEC.md section 1A, tools/sample/viewer.html, docs/reports/R1.md.

Goal
The Body page from the sample, rebuilt as proper app code, for both sexes, on desktop, tablet and phone.

Build
1. src/body/: loader (gzip + quantised buffers, first-load and on-demand files), per-part state texture, materials (SPEC 1.4), id pass, labels.
2. src/ui/body/: top bar, depth slider, systems, colour modes, labels, list with tabs and search, part card, isolate / hide / zoom, sex switch, skin tone, see-through skin, ghost.
3. Phone layout exactly as SPEC 1A. Check at 390 x 844, 768 x 1024 and 1440 x 900.
4. facts.json for the 100 parts people look at most (major muscles, major organs, major bones): 2–4 short facts each, each with a source. Show them on the part card.
5. App shell with three pages: Body, Workouts (empty placeholder list of what is coming), Me (profile from R0).

Acceptance
- Screenshots at the three sizes, both sexes, at Skin, Outer, Deep, Bones + organs.
- ≥ 30 fps on your phone at Outer, ≥ 45 fps at Skin. Load time on the phone. Report real numbers.
- Unit tests for state rules (sex, depth, systems, hidden, isolate, external genitalia under opaque skin).

Checkpoint
Stop. Write docs/reports/R2.md.
```

---

## R3 — Rig, Move screen, and the prototype content back

```
/feature-build R3: rig both bodies and bring back exercises and chores

Read first: docs/SPEC.md sections 2 and 3, docs/reports/R1.md, prototype/index.html (its exercise and chore data).

Goal
Skin, muscles and bones bend together on one skeleton, I can pose by hand, and the prototype's exercises and chores play again.

Build
1. Skeleton = MakeHuman game rig fitted in pipeline step 7. Export bone transforms per sex.
2. Bind: bones rigid to one joint; muscles per SPEC section 2 (chain + bone range, smooth weights across joints, up to four); organs to the trunk bones; skin with MakeHuman's own weights. Do this in the pipeline, ship weights in the data.
3. Move screen (SPEC section 3): joint handles, drag inside limits, ctrl+drag camera, sliders, typed angles, IK for planted feet, undo/redo/reset.
4. Port the prototype's 11 exercises (about 21 variations) and 5 chores (about 10 variants) into exercises.json and tasks.json as keyframes. Muscles from a provisional table, clearly marked "provisional".
5. Workouts page lists them; each plays on the current sex.

Acceptance
Screenshots, both sexes: elbow 90 and 140, shoulder abduction 90 and 170, shoulder flexion 90, hip flexion 90, knee 120, trunk flexion 45, deep squat feet flat, arms overhead. No muscle torn from bone, no inside-out mesh.
All prototype exercises and chores play. If skinning fails twice, switch to the rigid-segment fallback and show both.

Checkpoint
Stop. Write docs/reports/R3.md.
```

---

## R4 — Effort engine

```
/feature-build R4: effort engine and live muscle highlighting

Read first: docs/SPEC.md section 4, docs/reports/R3.md.

Goal
Which single muscles work, and how hard, from pose, supports and loads. No hand-written lists.

Build
1. src/engine/ pure TypeScript, no three.js, signature and steps as SPEC section 4.
2. segments.json, strengths.json, actions.json, each entry with a source; map every muscle part id to a muscle key. Segment masses per sex from the profile.
3. Supports and loads as data. Extra rules (shoulder blade, grip, bracing) each in its own tested function.
4. Wire to Move and to the R3 exercises and chores; remove the provisional lists.
5. Muscle panel: level bar, role, reason in words. Lower-back moment, balance warning.

Acceptance
The six must-pass cases of SPEC section 4 as automated tests (direction of change). Top eight muscles per case in the report. 40 largest muscles in actions.json reviewed by hand.

Checkpoint
Stop. Write docs/reports/R4.md.
```

---

## R5 — Workouts: exercise library and task builder

```
/feature-build R5: exercise library and task builder

Read first: docs/SPEC.md sections 5 and 6, docs/reports/R4.md.

Goal
A searchable library with correct form on the real body, and an everyday-task builder.

Build in two steps; stop after step 1.
Step 1: 50 reviewed exercises with free equipment models (CC0 or built for the project, source recorded, no placeholder boxes), form checks, exercise screen (search, filters, variation, load, play, compare), keyframe editor. Task builder per SPEC section 6.
Step 2: import names from free-exercise-db and wger, match to pattern × posture × equipment, generate to 300+, mark generated ones reviewed: false.

Acceptance
Step 1: contact sheet of all 50, zero failing form checks; stoop vs squat pick-up shows the back-to-legs shift; one-hand vs split carry shows the trunk change.
Step 2: 300+ playable, none passing through equipment; list of unmatched names.

Checkpoint
Stop after each step. Write docs/reports/R5-step1.md and R5-step2.md.
```

---

## R6 — Me and Programs on the real bodies

```
/feature-build R6: My model and programs on male and female bodies

Read first: docs/SPEC.md sections 7 and 10, docs/reports/R5-step1.md.

Goal
My conditions and fat change every screen; programs play animated on the correct body.

Build
- Conditions (SPEC 7) with severity, typical/mine toggle, difference list. Start with anterior pelvic tilt.
- Fat by region on the per-sex skin; deep-belly fat around the real organs; organs affected; reduction guidance with sources.
- InBody sheet import with per-value confirmation; typed form fallback.
- Programs from programs.json, now animated with reviewed keyframes. Pelvic-floor items highlight the real pelvic-floor muscles of the current sex. Sexual-health program per sex with the 18+ gate, wording exactly per SPEC 10.4 and 10.5.

Rules
No health value leaves the device. No claim beyond SPEC section 10. Clinical wording.

Acceptance
APT mild/medium/strong screenshots and difference lists; +20 kg trunk fat raises lower-back demand (test); male profile never sees the female program and the reverse (test); claim table with sources.

Checkpoint
Stop. Write docs/reports/R6.md.
```

---

## R7 — Release build

```
/feature-build R7: Android release build

Read first: CLAUDE.md, docs/PLAN.md, all docs/reports.

Goal
Install on my phone, fully offline, ready for a later Play Store listing.

Build
- Capacitor wrap with all data bundled; on-demand anatomy files load from the bundle.
- `make apk` and `make aab` write to ./output.
- Touch controls on a real phone. Credits and licences screen (Z-Anatomy, BodyParts3D, MakeHuman, exercise data). Medical disclaimer.
- docs/RELEASE.md: Play health-content policy, privacy policy, data safety form, content rating, licence review of every asset (deferred until now by decision). Mark each verified or not, with links.

Acceptance
Debug APK installs and runs offline. APK size, load time and fps on the phone.

Checkpoint
Stop. Write docs/reports/R7.md.
```

---

## R8 — Organs complete (later, separate run)

```
/feature-build R8: complete the organs

Read first: docs/PLAN.md section 10, docs/SPEC.md section 1, docs/reports/R1.md and R2.md, the pack manifest.

Goal
Every vital organ present and correct for both sexes, added as data packs with no UI rewrite.

Build
1. Lungs: lobes and pleura from BodyParts3D (CC BY-SA 2.1 JP) aligned to Z-Anatomy, or modelled in Blender if alignment fails. Fit around the existing bronchial tree.
2. Brain: cerebrum (lobes or gyri as available), cerebellum, from BodyParts3D or another CC source; else model. Fit to the skull and existing brainstem.
3. Female reproductive organs: replace the simplified uterus, ovaries, tubes and vagina with modelled meshes (Blender, ours), sized from an anatomy reference with sources.
4. Perineal muscles (bulbospongiosus, ischiocavernosus, superficial and deep transverse perineal) for each sex, and rectus abdominis tendinous intersections as tendon strips.
5. Run every new part through the R1 steps (normals, layers for muscles, AO, names, warp for female, pack).
6. Facts with sources for each new organ on the part card.

Acceptance
- Contact sheet both sexes: chest, head (sagittal cut view if available), pelvis, abdomen, before and after.
- No new part pokes through the skin at opaque skin; no overlap with existing organs above 3 mm (report the worst five).
- Pack sizes and load time on the phone.

Checkpoint
Stop. Write docs/reports/R8.md.
```
