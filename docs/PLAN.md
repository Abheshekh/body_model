# Body Model — plan

Status: plan v4, 14 Nov 2026. v4 adds Programs (posture, pelvic tilt, pelvic floor, sexual health), the first-launch question and the Makefile build. Replaces v2 and v3. The mannequin prototype (`prototype/index.html`) is rejected and kept only as a record.

Read with: `docs/SPEC.md` (how each part works) and `docs/PROMPTS.md` (Claude Code prompts, one per milestone).

## 1. Goal

One Android app that shows, on a real anatomical 3D body, what any movement does to you.

| Phase | Outcome |
|---|---|
| 1 | Understand any movement at single-muscle level: exercises, everyday tasks, free joint moves. See it on a typical body or on your own body. |
| 2 | Replace a personal trainer: plans, progression, form check. Photo calorie log. |

Release: personal use first. Play Store later as a simple free app.

## 2. What changed from v2

| # | Feedback | Change |
|---|---|---|
| 1 | Body looked odd, no detail | Use real anatomy meshes, one mesh per muscle. Verified renderable: see `docs/preview/`. |
| 2 | Form was wrong | Poses come from keyframes on a real skeleton with joint limits and planted feet (IK). Each exercise reviewed against a form checklist. |
| 3 | Exercises limited | Library built from movement patterns × posture × equipment, plus imported names. Target 300+ at first release. |
| 4 | Machines looked bad | Proper equipment models (glTF), not boxes. |
| 5 | Body fat page | Becomes **My model**: my conditions (for example anterior pelvic tilt), my fat levels. |
| 6 | Move joints directly | Click a joint, drag to move. Ctrl + drag moves the camera. Sliders and typed angles stay. |
| 7 | Chores | Becomes **Task builder**: place an object, set its weight, pick an action, then edit the motion joint by joint. |
| 8 | Hand-written muscle lists | Muscles are computed from pose and load (section 4), so any edited pose gives an answer. |

## 3. Decisions

| # | Decision | Why | Confidence |
|---|---|---|---|
| D1 | TypeScript + three.js + Vite, wrapped with Capacitor for Android | 3D is web tech either way. One codebase. | 75% |
| D2 | Anatomy source: BodyParts3D (FMA-named STL parts). Z-Anatomy as an upgrade path. | Fetched and rendered already. 431 muscle parts, 201 bone parts, skin (M1 build). No Blender needed. | 85% for static display |
| D3 | Rig built in code: joints located from the bone meshes, skin weights computed per muscle | No rigged open anatomy model exists. | 60%, see R1 |
| D4 | Muscle effort from a statics engine: joint torques from gravity and loads, mapped to muscles by an action table | Answers "what works when I change this joint or this load". Hand lists cannot. | 70% |
| D5 | Offline first. Data ships in the app. No accounts. | Free app, no server cost. Health data stays on the phone. | 85% |
| D6 | Server only for the food photo. Decide in Phase 2. | Vision models cost money per photo. | 80% |

## 4. Core idea

Analogy: the body is a crane. Every joint is a hinge that must hold a turning force. Move the load or bend a hinge, and different motors must work.

```
pose (joint angles) + supports (floor, seat, bench, bar) + loads (object, weight, cable)
        -> torque needed at every joint, in every direction
        -> muscles that produce that torque (action table, per single muscle)
        -> role: moving the joint = does the work; holding it still = stabiliser
```

One engine serves every screen. Exercises, tasks, free joint moves and "my body" are just different poses, supports and loads.

## 5. Screens

| Screen | What it does |
|---|---|
| Explore | The body. Layers: skin, muscles, deep muscles, skeleton, organs. Tap any muscle: name, actions, where it attaches. |
| Move | Click a joint and drag, or use sliders, or type an angle. Muscles update live. |
| Exercises | Library. Pick exercise, variation, load. Animated with correct form. Per-muscle effort, joints moving and held, cues and mistakes. Edit any keyframe. |
| Tasks | Build a task: object, weight, where it sits, action (pick up, carry, push, pull, climb, sit, reach). Compare ways of doing it. Edit joints to see the effect. |
| My model | My conditions and my fat levels. Toggle "typical body / my body" on every screen. Organs affected by fat. How to reduce it. |
| Programs | Ready-made routines: posture correction, anterior pelvic tilt, pelvic floor, sexual health. Each exercise plays on the body like any other. |
| First launch | Asks male or female, height and body mass. The answer selects the pelvic-floor and sexual-health programs. |

## 6. Milestones

Each ends at a checkpoint. Nothing moves on without sign-off.

| # | Milestone | Done when | Risk |
|---|---|---|---|
| M1 | Body pipeline + Explore screen | Real body in the browser at 30+ fps on a mid phone. Layers. Tap a muscle to name it. | Low |
| M2 | Rig + Move screen | Every major joint bends with muscles attached. Click-drag joints, ctrl-drag camera, typed angles, joint limits, planted feet. | **High** |
| M3 | Effort engine | Curl, squat, deadlift, push-up, plank, pull-up give sensible muscles from physics alone. Tests pass. | Medium |
| M4 | Exercises | 50 reviewed exercises with equipment models, then pattern-generated library to 300+. | Medium |
| M5 | Tasks | Object + weight + action + keyframe editing. Stoop vs squat pick-up shows the back-to-legs shift. | Medium |
| M6 | My model | Conditions, fat by hand, fat from an InBody sheet photo, organs, reduction guidance. | Medium |
| M6b | Programs | Posture, pelvic tilt and pelvic floor programs for both sexes. Sexual-health program per sex. Every claim on screen has a source and an evidence label. | Medium |
| M7 | Android build | Capacitor wrap, offline, installs on your phone. `make apk` and `make aab` write to `./output`. | Low |
| M8+ | Phase 2 | Plan builder, log, camera form check, food photo log. | High |

M2 is the go/no-go point. If muscles tear badly at the joints, fall back to rigid muscle segments with blended joint caps before trying anything else.

## 7. Data and licences

| Asset | Licence | Obligation |
|---|---|---|
| BodyParts3D anatomy | CC BY-SA 2.1 Japan, © DBCLS | Show the required credit in the app. Share the modified model under the same licence. |
| Z-Anatomy (optional upgrade) | CC BY-SA 4.0 | Same pattern. |
| free-exercise-db (names, text, images) | Public domain | None |
| wger exercises | Creative Commons, set per entry | Check each entry. Credit. |
| Equipment models | Must be CC0 or made for the project | Record source per model. |
| Condition and fat text | Written fresh from medical sources | Cite sources in the app. |

Check before Play Store listing (not yet verified): Google Play health-content policy, medical disclaimer wording, privacy policy for camera use, content rating and policy for sexual-wellness content.

## 8. Risks

| # | Risk | Mitigation | Confidence it works |
|---|---|---|---|
| R1 | Static atlas meshes do not bend | Code-built rig with per-muscle weights. Fallback: rigid segments. | 60% first path, 85% fallback |
| R2 | 20 million source triangles | Simplify per part. 1.0 million rendered fine in tests. Phone target 300–500 thousand, with Draco or meshopt. | 80% |
| R3 | Engine gives odd muscles in edge cases | Statics ignores speed, momentum and co-contraction. Add a bracing rule. Label results as estimates. | 70% |
| R4 | Muscle action table errors (about 150 muscles) | Build from standard anatomy references, review the 40 biggest muscles by hand, show sources. | 75% |
| R5 | Condition effects overstated | Posture offsets are visual and mechanical only. "Often tight / often weak" lists are labelled as clinical convention, not proof. | 80% |
| R6 | Exercise form quality at 300+ | Patterns reviewed once, then reused. Top 50 reviewed one by one. | 70% |
| R7 | Photo calories are rough | Photo gives a draft. User corrects. | 85% works, accuracy low |
| R8 | Camera form check | Last item. Start with two lifts. | 50% |
| R9 | The anatomy data is one male body | Female users get female programs shown on male anatomy until a female model is added. Say so in the app. | 90% that this limit stays through Phase 1 |
| R10 | Sexual-health claims overstated | Only what trials support: pelvic floor training and aerobic exercise. No size or length claims. Evidence label on each claim. Tell users to see a doctor for lasting problems. | 85% |
| R11 | Play Store rejects or age-restricts the sexual-health program | Clinical wording, anatomical model only, 18+ confirmation before that program. Check the policy before listing. | 70% |

## 9. What is already in the repo

| Path | What |
|---|---|
| `docs/preview/*.png` | Four renders of the real anatomy data: front and back, skin and skeleton, curl highlight, close-ups |
| `tools/anatomy-spike/build_body.py` | Script that made the data for those renders. Starting point for M1. |
| `tools/anatomy-spike/render.html` | Minimal three.js viewer used for the renders |
| `prototype/index.html` | Rejected v1 mannequin. Reference for screens only. |
| `Makefile` | `make apk` (debug APK) and `make aab` (signed Play Store bundle). Output in `./output`. Setup steps tested; the Gradle build itself not yet run. |

## 10. Working method

- Claude Code, one milestone per prompt, through `/feature-build`. Prompts are in `docs/PROMPTS.md`.
- Each prompt ends with a checkpoint: a demo to look at and a short report. Review before the next prompt.
- Keep `docs/PLAN.md` and `docs/SPEC.md` current. If a decision changes, change the doc in the same commit.

## 11. Sources

- BodyParts3D: https://github.com/Kevin-Mattheus-Moerman/BodyParts3D
- Z-Anatomy: https://github.com/Z-Anatomy/Models-of-human-anatomy
- free-exercise-db: https://github.com/yuhonas/free-exercise-db
- wger: https://github.com/wger-project/wger
- Visceral fat and organs: https://www.boltpharmacy.co.uk/guide/can-visceral-fat-injure-internal-organs
- Visceral fat reduction: https://www.medicalnewstoday.com/articles/320929.php
- Photo calorie accuracy: https://biolayne.com/reps/issue-44/can-we-use-ai-to-accurately-track-calories-with-a-picture/
- Pelvic floor training for erectile dysfunction and premature ejaculation (systematic review): https://pubmed.ncbi.nlm.nih.gov/30979506/
- Aerobic exercise and erectile function (meta-analysis of 11 trials): https://pubmed.ncbi.nlm.nih.gov/37814532/
- Pelvic floor training for urinary incontinence in women (Cochrane): https://www.cochrane.org/evidence/CD005654
