/feature-build R5: exercise library and task builder (docs/PROMPTS.md "R5 — Workouts: exercise library and task builder")

Context: R0–R4 are built and committed on stacked branches (not pushed, not merged; main has only "Docs: plan v5.1"): r0-clean-slate cb7909e → r1-body-pipeline 2bf9323 → r2-body-page 8a1914f → r3-rig-move f4dd0b9 → r4-effort-engine <R4_HASH>. Start branch r5-library-tasks from r4-effort-engine (or from main if I have merged by then; check git log first). R5 has two steps; stop after each (see the checkpoint block).

Read first: CLAUDE.md, docs/PLAN.md, docs/SPEC.md §4–6, docs/PROMPTS.md R5, docs/reports/R1.md–R4.md, docs/done_development/r4-effort-engine/plans/PLAN.md §2b (binding clarifications and changelog) and plans/raw/cases.md, src/engine/*, src/ui/workouts/*, public/data/{actions,loads,supports,strengths,segments,exercises,tasks}.json.

Platform: build web and Android together until R7. Keep `make apk` working and report the APK size at each checkpoint. The web-vs-Android release decision is made at R7, not before. `make apk` needs Node >= 22: use PATH=$HOME/.nvm/versions/node/v24.15.0/bin:$PATH. Vitest's summary reporter crashes on Node 20: use --reporter=json there.

Token budget: plan critic and reviewer on Sonnet unless a task is genuinely hard (Opus only then); at most one fix round per failure, then stop and ask me; merge small tasks; screenshots only where the acceptance criteria need them.

Rules that still hold: src/engine/ is pure TypeScript with a test for every rule; data in JSON with sources; no hand-written muscle lists (since R4 every exercise and task gets its effort from the engine, so every new or generated exercise must too); medical wording is education only and every claim on screen is sourced; phone first (390×844), the body never covered by UI; nothing personal leaves the device; free assets only, source and licence recorded for each (equipment models: CC0 or built for the project, no placeholder boxes in reviewed exercises).

New binding decisions from R4 (details in r4 plans PLAN.md §2b):
- Engine API (src/engine): `effort(input, data)`, `effortOverMove(a, b, input, data)` (roles from the 5° rule on poses a and b; without poseB every working muscle is "hold"), `setupVariant(...)` (loads and supports per exercise variant), `supportPin(proto)`, `loadEngine(manifest)`.
- Data files: public/data/segments.json, strengths.json, actions.json, loads.json, supports.json. A new exercise adds no muscle list. It adds a pose (keyframes with a pin) and props from the existing tables.
- Props and pins: loads.json and supports.json props tables drive loads and supports. A missing prototype pin means `flat` for supports (heel and ball of both feet), though `fromPrototype` still grounds by toes. `toes` = balls only, `toeL`/`toeR` = that foot only, `none` = the seat or bench supplies the floor, `hands` = hang. `variantProps` in supports.json is the only per-variant support entry (plank, push-up). A new prop needs a loads.json and a supports.json entry (or a `none` listing).
- Joint keys are sideless (`elbow`, `hip`, ...) and resolved by muscle side; `ipsi`/`contra` are relative to the muscle's own side; `hadd` is engine-only.
- Move/player sheet layout rule: collapsed = title, variant, transport, legend and one summary line; everything else in `.more`; the open sheet is capped at 45vh. Every new screen (library, task builder, editor, compare) follows it.
- SPEC §4 changes: a back pad cannot lower the lumbar moment; stoop vs squat wording (see plans §2b item 13).

Known gaps R5 must handle or not make worse:
- Prototype bucket stoop and squat keyframes put the centre of mass beyond the feet (balance margin about -9 cm). R5's reviewed poses and form checks must include a balance check using `effort().balance` and fix or flag such poses.
- Curl top muscles are the wrist and finger flexors: review the wrist start values in strengths.json (a start value, not a verified number).
- Trunk mass sits on spine_02, so `lowerBack.momentNm` is overcounted. Note it where the lumbar band is shown.
- R3 skinning gap: tears at extreme shoulder poses, compression folds at hip, elbow and knee (docs/reports/R3.md). Don't fix unless a reviewed pose needs it.
- Phone fps is unmeasured: measure and report it at the step 1 checkpoint if a device is available.
- 6 of the largest 40 muscles are unmodelled by design (plans/raw/largest40.md).

Build R5 only, in two steps. Step 1: 50 reviewed exercises, form checks, exercise screen, keyframe editor, task builder (SPEC §5 and §6). Step 2: import and generate 300+ (free-exercise-db and wger). At each checkpoint:
1. Write the report (docs/reports/R5-step1.md after step 1, docs/reports/R5-step2.md after step 2) and commit on r5-library-tasks.
2. Write the prompt for the next piece of work to docs/prompts/next.md and also show it to me in chat. After step 1 that is the R5 step 2 prompt; after step 2 it is the R6 prompt. Write it in the same style as this prompt, with updated context (all branch names and commit hashes so far, new binding decisions, known gaps, files to read). It must keep the same platform, token-budget and rules sections, and include this same "At the checkpoint" block, so each milestone hands over to the next: R5 → R6 → R7. After R7 the next prompt is for R8 (organs), which runs separately and only when I ask.
3. Stop and ask me to review. Don't start the next step or milestone in the same chat.
