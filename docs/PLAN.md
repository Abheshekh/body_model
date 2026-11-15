# Body Model — plan

Status: plan v5.1, 15 Nov 2026. v5.1: build the app now; complete the organs in R8. Replaces v4 and `docs/REBUILD-PLAN.md`.
Read with `docs/SPEC.md` (how each part works) and `docs/PROMPTS.md` (Claude Code prompts).
Approved sample: the anatomy sample artifact, built by the scripts in `tools/sample/`. It is the visual target for R1.

## 1. Goal

One Android app with two halves.

| Page | Purpose |
|---|---|
| **Body** | A complete human, male and female: skin, every muscle layer to the bone, skeleton, organs, heart and vessels, brain and nerves, lymphatic system, ligaments and cartilage. Correct facts, sourced. The reference the rest of the app points into. |
| **Workouts** | Exercises, everyday tasks, free joint moves and programs, played on the same body, with muscle effort computed from physics. |
| **Me** | Profile (sex, height, mass), conditions, body fat. Changes what both pages show. |

| Phase | Outcome |
|---|---|
| 1 | Body page complete. Workouts: understand any movement at single-muscle level. |
| 2 | Replace a personal trainer: plans, progression, form check. Photo calorie log. |

Release: personal use first. Play Store later as a simple free app. Other genders later (section 10).

## 2. Where the repo stands (15 Nov 2026)

| Item | State |
|---|---|
| M1 BodyParts3D pipeline + Explore | Committed. Superseded by R1. |
| M1b Android, profile, Programs (static) | Archived on branch `m1b-archive` and kept on `r0-clean-slate`. Main was fast-forwarded to M1 plus the v5.1 docs. |
| Rig, engine, exercises, tasks, My model | Not started |
| Sample (`tools/sample/`) | Z-Anatomy + MakeHuman, male and female, all systems, layer peeling, inspector UI, phone layout. Approved look. |

## 3. What changed from v4

| # | Feedback | Change |
|---|---|---|
| 1 | Body looked cheap; skull and muscles showed through skin | Z-Anatomy meshes, procedural fibre striation, baked AO, studio light. Opaque skin hides everything inside. |
| 2 | Female body had male genitals | Two bodies. Female skin from MakeHuman; female anatomy warped from male; male-only parts removed; female-only parts added. |
| 3 | Inspect every muscle at every depth | Depth slider peels layers computed by ray tests (Outer, 2…6, Bones), ghost of peeled layers, colour by layer, labels, list, isolate, hide, zoom. |
| 4 | Complete human, not only muscles | All Z-Anatomy systems: organs, heart and vessels, brain and nerves, lymphatic, ligaments and cartilage. |
| 5 | Body and workouts on separate pages | Body page = anatomy explorer. Workouts page = exercises, tasks, move, programs. |
| 6 | Phone UI covered the body | Bottom sheet, collapsed by default; canvas sized above it; compact top bar; fewer labels. |
| 7 | Exercises and chores disappeared | They were never ported. R3 brings back the prototype's 11 exercises and 5 chores first. |
| 8 | Bottom view button | Removed. Pelvic camera opens only from a pelvic-floor item. |
| 9 | No paid assets | Free sources only. Licence check before going public. |

## 4. Decisions

| # | Decision | Why | Confidence |
|---|---|---|---|
| D1 | TypeScript + three.js + Vite, Capacitor for Android | Unchanged. | 80% |
| D2 | **Anatomy: Z-Anatomy** (CC BY-SA 4.0, derived from BodyParts3D) | Free, one mesh per part, all systems, Latin/English names. Proven in the sample. | 85% |
| D3 | **Skin and body shape: MakeHuman** (CC0), male and female, posed to Z-Anatomy's joints with its game rig | Free, both sexes, same mesh for both, natural face and hands. | 85% |
| D4 | **Female anatomy = male anatomy warped** by the male→female MakeHuman shape difference (smoothed, breasts excluded). Male-only parts removed. Female-only parts added. | No free female anatomy atlas exists. Warp keeps every name and all engine data. | 65%. Pelvis and chest need review. |
| D5 | Opaque skin hides all anatomy. See-through skin overlays it. | Skin keeps its natural shape. No pull-fit, no poke-through. | 90% |
| D6 | Fibre detail = shader striation from a per-vertex fibre field (fibres converge on the tendon, fans radiate) | Free, cheap, reads as muscle. | 80% |
| D7 | Depth layers computed by peeling (ray tests), then a reviewed override list | Covers every region without hand typing. Spot-check ~85% right. | 80% after review |
| D8 | Quality gate = screenshots at fixed views, signed off against the sample and reference images | "Looks real" needs a test. | 75% |
| D9 | Rig for anatomy: muscles and bones bound to the MakeHuman game skeleton after the pose fit (SPEC §2) | One skeleton drives skin and anatomy. | 60%, see R-risk 3 |
| D10 | Muscle effort from the statics engine | Unchanged from v4. | 70% |
| D11 | Offline first. Data ships in the app, quantised and compressed. No accounts. | Free app, health data stays on the phone. | 85% |
| D12 | Simplified generated meshes are allowed only where no free mesh exists, and the app labels them "simplified" | Honest gap-filling; replaceable later. | 80% |

## 5. Core idea (unchanged)

The body is a crane. Every joint is a hinge that must hold a turning force. Move the load or bend a hinge and different motors must work.

```
pose + supports + loads -> torque at every joint -> muscles that produce it -> role (moves / holds / helps)
```

## 6. App structure

| Page | Screens |
|---|---|
| Body | Explorer (depth, systems, colour modes, labels, list, isolate), part card with facts and sources, compare male / female |
| Workouts | Exercises, Tasks, Move (free joints), Programs |
| Me | Profile, conditions, fat |
| First launch | Male or female, height, mass. Selects the body and the programs. |

The Body page never shows effort. Workouts link a muscle to its Body page card.

## 7. Milestones

Each ends at a checkpoint. Nothing moves on without sign-off.

| # | Milestone | Done when | Risk |
|---|---|---|---|
| R0 | Clean slate | M1b on branch `m1b-archive`. Main keeps Makefile, profile, programs data. "Below" button gone. Programs "Show" bug fixed with a test. Result: all M1b code kept on `r0-clean-slate`, main fast-forwarded to M1; Show fixed (see docs/reports/R0.md). | Low |
| R1 | Body data pipeline | `tools/pipeline` builds male + female from Z-Anatomy + MakeHuman: all systems, fibre field, AO, layers, female warp, female-only parts, quantised data. Tests pass. Numbers match the sample or better. Result: done, 2,649 parts, first-load 9.28 MB gz (budget 10), run 22.1 s from cache, 48 tests OK; report docs/reports/R1.md. | Medium |
| R2 | Body page | Explorer from the sample, rebuilt in `src/`: two sexes, skin, depth, systems, colour modes, labels, list, isolate, phone sheet. Part facts with sources for the 100 most-viewed parts. ≥ 30 fps on your phone. Result: built; 106 tests pass; 24 screenshots; APK 20,067,991 bytes; desktop software-GL fps and load time measured; phone fps (≥ 30) is an open manual check; report docs/reports/R2.md. | Medium |
| R3 | Rig + bring back content | Anatomy and skin bend on the MakeHuman skeleton. Move screen. Prototype's 11 exercises and 5 chores play on both bodies (provisional muscle lists). Result: built; rig, GPU skinning, Move screen with IK, 11 exercises / 5 chores / 33 variants play on both sexes (provisional lists); first-load 9,279,138 gz, weights 315,884 gz on demand; APK 20,971,655 bytes. **Tear/flip acceptance (AC1) NOT met** for abd170, overhead, flex90 (teres major tear), hip90, squat (pectineus flip), elbow140, knee120 (compression flips); met for elbow90, abd90, trunk45. Rigid fallback not better, smooth is the default. Fix later: scapula bone, dual-quaternion or corrective blend. Report docs/reports/R3.md. | **High** |
| R4 | Effort engine | SPEC §4. Must-pass checks. Provisional lists replaced. | Medium |
| R5 | Workouts: library + tasks | 50 reviewed exercises with equipment, then 300+ generated. Task builder. | Medium |
| R6 | Me + Programs on the real bodies | Conditions, fat, organs affected. Programs animated on the correct sex. | Medium |
| R7 | Release build | `make apk` / `make aab`, offline, credits, disclaimer, release checklist. | Low |
| R8 | Organs complete | Lungs (lobes, pleura), cerebrum and cerebellum, properly modelled female reproductive organs, perineal muscles, rectus tendinous intersections. Added as data packs, no app rewrite. | Medium |
| R9+ | Phase 2 | Plans, log, camera form check, food photo. | High |

## 8. Data and licences

| Asset | Licence | Obligation |
|---|---|---|
| Z-Anatomy (anatomy) | CC BY-SA 4.0 | Credit Z-Anatomy and BodyParts3D (CC BY-SA 2.1 JP, © DBCLS). Share modified anatomy data under CC BY-SA. |
| MakeHuman base mesh, targets, rig (via MPFB2 repo) | CC0 | None. Credit as courtesy. |
| OpenStax Anatomy and Physiology 2e (part facts) | CC BY-NC-SA 4.0 as stated on its pages | Facts are our own short paraphrases with a citation to the chapter page; no text copied. Check the NC clause before a Play Store listing. |
| free-exercise-db | Public domain | None |
| wger | Per entry | Check each, credit |
| Generated parts (female organs, breast tissue) | Ours | Label "simplified" |

Licence review is deferred until going public (your decision). Credits ship in the app from R2.

## 9. Risks

| # | Risk | Mitigation | Confidence it works |
|---|---|---|---|
| 1 | Data too big for phones (sample: 16 MB compressed, 1.2M triangles) | Per-system lazy load; drop nerves/vessels detail on low-end; LOD; meshopt. Target ≤ 10 MB first load. | 75% |
| 2 | Female warp wrong at pelvis, chest, hips | Review screenshots per region; hand-corrected pelvis targets; add female pelvis landmarks. | 60% |
| 3 | Muscles tear when posed | Per-muscle weights from bone ranges (SPEC §2); fallback rigid segments. | 60% |
| 4 | Layer errors (e.g. rectus abdominis read as deep) | Peeling + reviewed override list in data, with reason per override. | 80% |
| 5 | Missing parts in free data | Section 10 list, labelled in app. | — |
| 6 | Engine gives odd muscles | Statics only; bracing rule; label estimates. | 70% |
| 7 | Sexual-health and anatomy content on Play Store | Clinical rendering, external genitalia hidden under opaque skin, 18+ gate, policy check before listing. | 70% |

## 10. Known gaps in free data

| Gap | Now | Fix later |
|---|---|---|
| Lung tissue (lobes) | Only the bronchial tree | R8: BodyParts3D lungs (CC BY-SA) or model in Blender |
| Cerebrum and cerebellum | Only brainstem, ventricles, deep nuclei | R8: BodyParts3D brain parts or a CC source; else model |
| Female reproductive organs (uterus, ovaries, tubes, vagina) | Simplified generated shapes, labelled | R8: model properly in Blender, or a CC source |
| Female breast tissue | Generated from the female skin shape | Add lobes, ducts, fat pads |
| Female pelvis shape | Warped from male | Hand-corrected landmarks |
| Perineal muscles (bulbospongiosus, ischiocavernosus, transverse perineal) | Missing for both sexes | Model in Blender |
| Rectus abdominis tendinous intersections ("six-pack" lines) | Missing | Add as tendon strips |
| Tensor fasciae latae | Not in Z-Anatomy; dropped from the side-lying hip abduction targets | Model in Blender |
| Hair, eyebrows | Not shown (clinical) | Optional |
| Other genders, ages, body types | — | MakeHuman targets make this a data change |

## 11. Working method

- Build first, organs later (your decision, 15 Nov): R0–R7 ship the app on the current data; R8 adds the missing organs as data packs. The pipeline and viewer must treat each system as a pack so R8 needs no UI rewrite.
- Claude Code, one milestone per prompt via `/feature-build`. Prompts in `docs/PROMPTS.md`; the master prompt runs them in order with a stop at each checkpoint.
- Each checkpoint: screenshots, real measurements, a short report in `docs/reports/`.
- Keep PLAN and SPEC current in the same commit as any decision change.

## 12. Sources

- Z-Anatomy: https://github.com/Z-Anatomy/Models-of-human-anatomy
- MakeHuman licence (CC0 assets since 2020): https://static.makehumancommunity.org/oldsite/faq/what_changed_regarding_the_license_in_2020.html
- MPFB2 (MakeHuman assets and rigs): https://github.com/makehumancommunity/mpfb2
- BodyParts3D: https://dbarchive.biosciencedbc.jp/en/bodyparts3d/download.html
- free-exercise-db: https://github.com/yuhonas/free-exercise-db
- wger: https://github.com/wger-project/wger
- Programs evidence: see SPEC §10.7
