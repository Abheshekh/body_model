# m1b-android-programs: plan

## 1. Goal and requirements
Get the app installed on the user's Android phone (debug APK, signed AAB proven). Add a first-launch profile question and a Programs screen backed by `public/data/programs.json`, with sourced claims and highlights on the static body. No animation.

- **R1 Gradle fix.** In `android/gradle/wrapper/gradle-wrapper.properties`, set `networkTimeout=120000`. Delete the stale `~/.gradle/wrapper/dists/gradle-8.14.3-all/*/` folder, which holds only `.part` and `.lck` (outside the repo, not committed).
- **R2 JDK 21.** The Makefile exports `JAVA_HOME` for all gradle calls. Order: (a) an existing `JAVA_HOME` whose `bin/java -version` reports major ≥ 21; (b) `/usr/libexec/java_home -v 21`; (c) `/Applications/Android Studio.app/Contents/jbr/Contents/Home`. `_check` fails with "JDK 21 not found. Install JDK 21 or Android Studio." if none gives ≥ 21. Paths contain spaces: quote them.
- **R3 Make targets.** Keep `apk` and `aab` and `./output`. Add `run`: `npm run dev -- --host`, the Vite dev server reachable on the LAN. Add `install`: `adb install -r output/body-model-debug.apk`. Update the header comment.
- **R4 AAB proof.** Generate a throwaway keystore in the scratchpad (never in the repo). Run `make aab KEYSTORE=… KEYSTORE_PASS=… KEY_ALIAS=…`. The output prints "AAB: … (signed)", and `jarsigner -verify output/body-model-release.aab` prints "jar verified". The keystore and password are never committed or written to `.env.local`.
- **R5 Profile.** `{ sex: 'male' | 'female', heightCm: number, massKg: number }`. Valid when height is a finite number from 100 to 250 and mass is a finite number from 25 to 300 (inclusive, decimals allowed, strings, NaN and Infinity invalid) and sex is one of the two. Storage is injectable: functions take `s?: Storage`; the default is `globalThis.localStorage`, read inside the try/catch (vitest runs in node with no localStorage, so tests pass a fake). Stored in `localStorage` key `bodyModel.profile.v1`. Every storage access is in try/catch: a read error or invalid JSON returns `null`, and a write error is reported to the caller. No network call, no analytics.
- **R6 First launch.** With no valid profile, the app shows only the profile form: sex (two radio buttons), height in cm, body mass in kg, Save. Out-of-range values show an inline message and do not save. The line "Stored on this device only. Nothing is sent anywhere." is always visible. Save goes to `#`. Hash `#profile` shows the same form, prefilled, for edits. Every screen has a nav row: Explore · Programs · Profile.
- **R7 Programs data.** `public/data/programs.json` follows §5. It has five programs: `posture-correction` (all), `anterior-pelvic-tilt` (all), `pelvic-floor` (all), `sexual-health-male` (male, adultOnly), `sexual-health-female` (female, adultOnly). Exercise items are exactly the ones in SPEC §10.1–10.5 tables, each `animated: false`. Claims are only the ones in the §5 claim list, word for word in meaning, no additions.
- **R8 Doses.** Confirm each dose against a clinical guideline with a URL the builder has fetched and read. Candidate guidelines (verify, don't trust):
  - NICE NG123 (2019), PFMT for stress UI in women: at least 8 contractions, 3 times a day, at least 3 months.
  - NICE NG210 (2021), pelvic floor dysfunction.
  - WHO 2020 physical activity guidelines: adults 150–300 min/week moderate aerobic activity, muscle strengthening on ≥ 2 days/week.

  Doses with no guideline found → `dose: null`, and listed in `raw/doses.md` and the report. Expected null: posture, pelvic tilt, the male PFMT protocol, and stretches, unless a guideline is found. Every non-null dose carries `source {title, url}`.
- **R9 Visibility.** `visiblePrograms(programs, profile)` returns programs with `audience === 'all'` or `audience === profile.sex`. `canOpen(program, profile)` uses the same rule. Opening `#programs/<id>` for a hidden program shows "This program is not available for your profile." and never renders the program. No profile → nothing.
- **R10 18+ gate.** Opening an `adultOnly` program first shows: "This program covers sexual health. Confirm you are 18 or over." with "I am 18 or over" and "Back". Confirming calls `confirmAdult()` (stores `bodyModel.adult.v1 = "1"`; the flag is per device and is not reset when sex changes) and opens it. Back returns to the list. `isAdultConfirmed()` reads the flag. Both live in `src/me/profile.ts` with tests, with the same try/catch rule as the profile.
- **R11 Programs screen.** Hash `#programs` shows the list (title, item count) over the body canvas, which stays mounted. Hash `#programs/<id>` shows the program:
  - title and the line "Education, not treatment. Pain, numbness or a lasting problem: see a clinician.";
  - its cautions;
  - each item: name, cues, dose (or "Dose not yet confirmed against a clinical guideline"), each linked claim with its label chip (Strong / Moderate / Weak / Convention) and source link (or the convention text), and the plain line "Animation arrives with the exercise library.".

  Tapping an item calls `clearHighlights()` and then `setPartColor(id, '#ffd400', 1)` for every resolved target part. It makes the needed layers visible, and if every target is a pelvic-floor part, it switches to the pelvic view (R13). Provisional targets show the heading "Main muscles (provisional)". Target names that don't resolve are skipped with `console.warn` (the data test prevents this). `targets.parts` may be empty (aerobic, strength, breathing and mobility items with no single target muscle): then show "No single target muscle for this activity." and highlight nothing. If the body failed to load, `mountPrograms` receives `viewer = null`: the program text still works and the panel shows "The body could not be loaded, so highlights are off."
- **Route and form logic is pure and tested.** `parseRoute(hash)` in `src/programs/programs.ts` returns `{ screen: 'explore'|'profile'|'credits'|'programs', programId?: string }`. `profileErrors(values)` in `src/me/profile.ts` returns `{ height?: string; mass?: string; sex?: string }` messages, empty when valid. The UI only renders these results.
- **R12 Male sexual health note.** On the `sexual-health-male` program, show: "Bulbospongiosus and ischiocavernosus are not in this anatomy model. The pelvic floor region is shown instead."
- **R13 Pelvic view.** Ownership: the viewer owns camera, layers and opacity. Explore owns the banner and the checkboxes. Programs only calls viewer methods.
  - `viewer.setView('below')` moves the camera only. `VIEWS` gains a per-view target, and `below` is camera `(0, 0.35, 0.22)`, target `(0, 0.80, 0.06)` as start values. T3 tunes them by headless screenshot until the pelvic floor meshes fill the middle of the frame, with no leg or hip muscle in the line of sight.
  - `viewer.setPelvicView(on, keepIds)`: on → saves the current layer visibility and opacities, hides skin and every muscle mesh except `keepIds` (the pelvic-floor parts), keeps the skeleton visible at opacity 0.25 (`transparent = true`, `depthWrite = false`), sets the `below` camera. off → restores the saved layers and opacity 1.
  - `viewer.onLayersChanged(cb)` fires whenever layers change, so Explore re-syncs its checkboxes. `setLayerOpacity(key, o)` is the primitive (clamped 0..1).
  - Pelvic-floor parts = names `pubococcygeus`, `puborectalis`, `iliococcygeus`, `coccygeus`, `external anal sphincter` (resolved with `partIdsByName`; `tendinous arch of levator ani` is not included).
  - Explore's front, side and back buttons call `setPelvicView(false)` first. Explore's new "Below" button calls `setPelvicView(true, ids)` and shows the banner "The body shown is male anatomy.".
  - Programs: tapping an item whose targets are all pelvic-floor parts calls `setPelvicView(true, ids)` and shows the banner. The `sexual-health-female` program shows the banner on every item. Disposing the programs screen calls `clearHighlights()`, `setPelvicView(false)` and removes its banner.
- **R14 Docs.** `docs/reports/M1b.md` contains: build versions (JDK, Gradle, AGP, compileSdk, build-tools, Capacitor), APK and AAB sizes, phone numbers ("not measured yet (manual)" until the user measures), the claim table (claim | source | label), doses not confirmed, and open questions. Changed decisions go into SPEC §10 (item record, provisional targets, convention-claim source rule), PLAN §6 and §9 (Android build pulled forward into M1b, Gradle run), and the CLAUDE.md Stack line (`make run`, `make install`).

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

Decisions and rules:
- One milestone. No rig, engine, exercise library, animation, My model conditions or fat, or GitHub Pages.
- Data in JSON with `sources`. Medical wording: education only, clinical, anatomical model only. No size or length claims. No jelqing, devices or supplements. Do not teach stopping urine mid-flow.
- Never commit real personal numbers, keystores or passwords. Test fixtures use made-up values (for example 170 cm, 70 kg).
- Profile data never leaves the device. No `fetch` outside `${import.meta.env.BASE_URL}data/…`.
- Targets: pelvic-floor items use `from: "record"` (the SPEC §10.3 exception). Every other item uses `from: "provisional"` with `provisional: true`.
- Convention claims have `source: { "title": "Clinical convention, no trial cited", "url": null }`. Strong, moderate and weak claims need an `https://` URL.

Repo conventions: TypeScript strict, vanilla DOM, no framework, small files. Vitest tests as `src/**/*.test.ts`. Mark shortcuts with `// ponytail:`.

Reference code to imitate:
- `src/ui/explore.ts:mountExplore`: template-string DOM, the `$` helper, event wiring. Change it to return `Promise<Viewer>` so main.ts can hand the viewer to the programs screen. Keep `window.bodyModel`.
- `src/ui/credits.ts`: fetch `${import.meta.env.BASE_URL}data/…` with an error message on failure.
- `src/main.ts`: hash routing. Explore is mounted once and never remounted, because WebGL contexts are expensive. Programs overlays explore and does not hide it.
- `src/body/viewer.ts`: `VIEWS`, `setCamera`, `layerMeshes`, `setPartColor` and `clearHighlights` (the M1 highlight API).
- `src/body/data.test.ts`: how tests read `public/data/*.json` from disk.

Gotchas:
- The `python3` on PATH is a foreign env. M1b needs no Python.
- `npm install` needs `--legacy-peer-deps` (npm 10.8.2). Node 20: if vitest's reporter crashes with `Map.groupBy`, rerun with `--reporter=verbose`.
- Never take `JAVA_HOME` from the shell blindly: the shell `java` is 17.
- Capacitor debug builds allow `chrome://inspect` WebView debugging. Phone fps and load time are measured that way (manual check), so no in-app toggle is needed.
- The gradle-8.14.3 download is about 200 MB. Run `make apk` with a 600000 ms timeout or in the background.
- `android/.gitignore` from Capacitor already ignores `local.properties`, build output and `app/src/main/assets/public`. Check it before committing `android/`.
- Material transparency: set `transparent = true`, `depthWrite = false` and `opacity` together, and reset all three at opacity 1.

UI/UX quality bar (T6, T7). The user asked for "taste" and "impeccable" skills. Neither is installed in this session, so these rules carry the intent:
- Mobile first. Design at 360×800 first, then widen. Touch targets ≥ 44 px. No horizontal scroll. Respect safe-area insets (`env(safe-area-inset-*)`).
- One visual system in `style.css`. Colour tokens in `:root` (bg, surface, text, muted, accent `#ffd400` for highlight, chip colours per evidence label), a 4/8 px spacing scale, two type sizes plus a heading. Reuse them everywhere, with no inline colours.
- Panels: a bottom sheet on phones (max 60vh, scrolls inside, drag handle look, the body stays visible above it). A side panel ≥ 900 px wide.
- Evidence chips: Strong, Moderate, Weak and Convention are each distinct, with a label always in text, never colour alone. Contrast ≥ 4.5:1.
- Forms: real `<label>`s, `inputmode="numeric"`, units shown beside inputs, inline errors under the field, the Save button disabled until valid.
- Nav: a fixed top row with clear active state. Back affordances on detail and gate screens.
- Motion: only short (≤ 200 ms) transitions on the sheet. Honour `prefers-reduced-motion`.
- Accessibility: focus-visible outlines, `aria-live` for errors, buttons are `<button>`.
- T7 ends with screenshots of the list, gate, detail and pelvic view at 360 px (headless Chrome, as in M1's `docs/reports/m1/`), saved to `docs/reports/m1b/`.

## 3. Files
| Path | Create / Change | Why |
|---|---|---|
| Makefile | Change | JDK 21 selection, `run`, `install` |
| eslint.config.js | Change | add `android` and `output` to ignores (lint was scanning the copied web build) |
| android/gradle/wrapper/gradle-wrapper.properties | Change | networkTimeout 120000 |
| src/me/profile.ts, src/me/profile.test.ts | Create | profile load, save, validate, `profileErrors`, adult flag |
| src/programs/programs.ts, src/programs/programs.test.ts | Create | types, visiblePrograms, canOpen, parseRoute |
| src/programs/data.test.ts | Create | programs.json rules |
| public/data/programs.json | Create | five programs |
| src/body/model.ts, src/body/model.test.ts | Change | `partIdsByName` |
| src/body/viewer.ts | Change | `below` view, `setLayerOpacity`, `setPelvicView`, `onLayersChanged` |
| src/ui/profile.ts | Create | first-launch and edit form |
| src/ui/programs.ts | Create | list, gate, detail, highlights; returns a dispose function |
| src/ui/explore.ts | Change | return viewer, Below button, banner, checkbox sync |
| src/main.ts, src/style.css | Change | nav row, routes, panels, DEV-only seed (`import.meta.env.DEV`) |
| docs/reports/M1b.md | Create | report |
| docs/reports/m1b/*.png | Create | 360 px screenshots (T3 pelvic view, T7 list, gate, detail) |
| docs/SPEC.md, docs/PLAN.md, CLAUDE.md | Change | changed decisions (CLAUDE.md: Stack line only) |
| docs/done_development/m1b-android-programs/plans/raw/doses.md, raw/build-versions.md | Create | dose research log; build versions |
| ~/.gradle/wrapper/dists/gradle-8.14.3-all/ | Delete | only the stale `.part` and `.lck` folder, outside the repo; T4 may delete exactly this |

## 4. Interfaces
| Name | Signature | Returns | Job |
|---|---|---|---|
| validateProfile | `(p: unknown) => Profile \| null` | valid profile or null | range and type check |
| loadProfile | `(s?: Storage) => Profile \| null` | stored profile | read and validate, try/catch |
| saveProfile | `(p: Profile, s?: Storage) => boolean` | false on invalid or write error | write |
| visiblePrograms | `(ps: Program[], p: Profile \| null) => Program[]` | filtered | audience rule |
| canOpen | `(prog: Program, p: Profile \| null) => boolean` | | same rule, for direct links |
| partIdsByName | `(parts: Part[], names: string[]) => { ids: string[]; missing: string[] }` | | `n` matches `name === n`, `'left ' + n` or `'right ' + n` |
| profileErrors | `(v: { sex?: string; heightCm?: unknown; massKg?: unknown }) => { sex?: string; height?: string; mass?: string }` | message per bad field, `{}` when valid | form validation text |
| isAdultConfirmed / confirmAdult | `(s?: Storage) => boolean` | flag read / write ok | 18+ flag |
| parseRoute | `(hash: string) => { screen: 'explore'\|'profile'\|'credits'\|'programs'; programId?: string }` | | pure routing |
| Viewer.setView | `('front'\|'side'\|'back'\|'below')` | | camera only, per-view target |
| Viewer.setLayerOpacity | `(key: LayerKey, opacity: number)` | | clamped 0..1, transparency per R13 |
| Viewer.setPelvicView | `(on: boolean, keepIds: string[] = [])` | | R13 |
| Viewer.onLayersChanged | `(cb: () => void) => void` | | Explore checkbox sync |
| mountExplore | `(root) => Promise<Viewer>` | viewer; rejects if the body fails to load | was `void` |
| mountProfile | `(root, onSaved: () => void) => void` | | form |
| mountPrograms | `(root, viewer: Viewer \| null, profile: Profile, programId?: string) => () => void` | dispose function | list, gate, detail |

Routing in main.ts (nav row rendered once by main.ts, shown on every screen including credits):
1. No valid profile → profile screen only, whatever the hash. Explore stays mounted but hidden.
2. On every `hashchange`: call the previous programs dispose function, then `parseRoute(location.hash)` and render.
3. `#profile` → profile form (prefilled).
4. `#credits` → credits.
5. `#programs` or `#programs/<id>` → explore stays visible and `mountPrograms` runs (viewer null if `mountExplore` rejected).
6. Otherwise → explore.
7. DEV-only: `if (import.meta.env.DEV)`, `?seed=male|female&adult=1` writes a made-up profile (170 cm, 70 kg) and the adult flag, so headless screenshots work. It is removed from production builds.

## 5. Data models
```
programs.json
{ sources: [{name, url}],                // every URL used below
  programs: [{
    id, title, audience: "all"|"male"|"female", adultOnly: boolean,
    linkedConditions: string[], cautions: string[], notes: string[],
    evidence: [{ id, claim, strength: "strong"|"moderate"|"weak"|"convention",
                 source: { title, url: string|null } }],
    items: [{ id, name, component?: string, cues: string[], animated: false,
              targets: { from: "record"|"provisional", provisional: boolean, parts: string[] },
              dose: null | { sets?, reps?, holdSeconds?, frequency, source: {title, url} },
              evidence: string[] }]   // ≥1 claim id from this program
  }] }
```
Item list (T5 builds exactly these; the SPEC §10 table rows that name no exercise are expanded as below). `component` is the SPEC table column value. `linkedConditions`: posture-correction `["forward-head","rounded-shoulders","kyphosis","knee-valgus","flat-feet"]`; anterior-pelvic-tilt `["anterior-pelvic-tilt"]`; others `[]`. `dose.frequency` is a string. `notes[]` is plain strings.
- posture-correction (provisional targets): chin tuck, deep neck flexor hold, upper trapezius and levator scapulae stretch, thoracic extension over a roller, wall slide, band pull-apart, face pull, prone Y and T raise, doorway chest stretch, dead bug, bird dog, front plank, side plank, hip hinge drill, side-lying hip abduction, banded lateral walk, single-leg squat to a box, short-foot drill, calf raise with slow lowering, towel curl.
- anterior-pelvic-tilt (provisional): half-kneeling hip flexor stretch, couch stretch, glute bridge, hip thrust, dead bug, reverse crunch, plank with pelvis tucked, Romanian deadlift, hamstring curl, pelvic tilt practice (standing and lying).
- pelvic-floor (targets `from: "record"`, parts = the five pelvic-floor names): find the muscles, slow holds, quick squeezes, progress (lying, sitting, standing, during a lift or cough), diaphragmatic breathing, deep squat hold, happy-baby pose.
- sexual-health-male: pelvic floor items copied from pelvic-floor (slow holds, quick squeezes, control practice, record targets); aerobic items (brisk walking, cycling, running, swimming) and one item "whole-body strength work", all with `parts: []` and provisional.
- sexual-health-female: pelvic floor items copied from pelvic-floor (slow holds, quick squeezes), the relaxation set (diaphragmatic breathing, deep squat hold, happy-baby pose) plus "hip mobility", then "aerobic work" and "strength work" with `parts: []`.

Each program also gets one generic convention claim `<program-id>-convention`: "Commonly used in practice. No trial is cited for this item." (source `{title: "Clinical convention, no trial cited", url: null}`). Items with no specific claim below link to it. It makes no factual claim.

Claim to item mapping: the Cochrane strong claim links to pelvic-floor slow holds and quick squeezes only. In sexual-health-male, the Myers claim links to its pelvic floor items and the Khera claim to the four aerobic items. In sexual-health-female, the Cochrane sexual-outcomes claim links to its pelvic floor items. Convention claims link to everything else. The strong Cochrane claim is about women with SUI and the text says so, so showing it to every audience is accurate.

Claims, the only ones allowed (from SPEC §10; the convention texts below are added so every claim has text):
- pelvic-floor
  - "For women with stress urinary incontinence, pelvic floor training made a reported cure about eight times more likely than no treatment (Cochrane review, 31 trials)." · strong · Dumoulin 2018 CD005654.
  - "For people whose pelvic floor is tense, relaxing matters more than squeezing." · convention.
- sexual-health-male
  - "A systematic review of 10 trials found pelvic floor training appears effective for erectile dysfunction and premature ejaculation. Trial quality was low to moderate and no best protocol is known." · moderate · Myers and Smith 2019 (pubmed 30979506).
  - "A meta-analysis of 11 randomised trials (1,147 men) found erectile function scores improved by 2.8 points on a 6–30 scale, more in men who started lower." · moderate · Khera 2023 (pubmed 37814532).
  - "Whole-body strength work supports general health." · convention.
- sexual-health-female
  - "The same Cochrane review reports better sexual outcomes in the pelvic floor training groups." · moderate · CD005654.
  - "Relaxation and hip mobility are commonly used for pelvic pain or tension." · convention.
  - "Aerobic and strength work support general fitness." · convention.
- posture-correction: "The evidence that exercise changes standing posture is mixed." · convention.
- anterior-pelvic-tilt: "Pelvic tilt varies between people, a forward tilt is common, and it often comes with no pain." · convention.

Cautions, per program (every program also gets the generic "Pain, numbness or a lasting problem: see a clinician."):
- pelvic-floor: do not stop urine mid-flow as an exercise; pain or symptoms getting worse → stop and see a pelvic health physiotherapist; during pregnancy and after birth, check with a clinician first.
- sexual-health-male: lasting erection problems can be an early sign of heart, blood-vessel or blood-sugar disease → see a doctor; no exercise makes the penis longer or larger; do not stop urine mid-flow as an exercise.
- sexual-health-female: during pregnancy and after birth, check with a clinician first; pain → see a pelvic health physiotherapist.
- posture-correction, anterior-pelvic-tilt: generic only.
`notes[]`: male program carries the R12 text; female program carries "The body shown is male anatomy." and the pelvic-floor program carries the same.

## 6. Decisions and things to avoid
| Decision | Reason |
|---|---|
| Show the region for male muscles | user; no placeholder geometry |
| Provisional hand targets for non-pelvic items | user; engine arrives in M3 |
| 18+ confirmation stored once per device | ponytail: re-ask each time if Play policy needs it |
| Phone fps through chrome://inspect plus `?fps=1` | no new in-app toggle |
| Programs overlays explore | one WebGL context |

Avoid: new deps, Ionic UI, a service worker, analytics, any network call with profile data, claims not in §5, size or length claims, committing keystores.

## 7. Allowed dependencies
None.

## 8. Tasks
Waves run in order. Wave 1 is T4 alone because `make apk` compiles all of `src/` and runs `npm run build`, which would collide with half-written files. It also de-risks the Gradle download first, on the unchanged M1 code.

- [x] T4: Android build fix | size: L | wave: 1 | files: Makefile, eslint.config.js, android/gradle/wrapper/gradle-wrapper.properties, plans/raw/build-versions.md, and deleting `~/.gradle/wrapper/dists/gradle-8.14.3-all/` (stale `.part`/`.lck` only) | steps: set `networkTimeout=120000`; delete that stale folder; Makefile picks JDK 21 per R2 and `_check` tests that JDK (not `command -v java`); add `run` and `install`; add `android` and `output` to eslint ignores; run `make apk` (timeout 600000 ms; the Gradle download is about 200 MB); make a throwaway keystore with `keytool -genkeypair -keystore <scratchpad>/throwaway.jks -storepass throwaway-pass -keypass throwaway-pass -alias throwaway -keyalg RSA -keysize 2048 -validity 1 -dname "CN=throwaway"` (scratchpad dir is given by main in the prompt; never inside the repo); run `make aab KEYSTORE=<that> KEYSTORE_PASS=throwaway-pass KEY_ALIAS=throwaway`; write versions (`$JAVA_HOME/bin/java -version`, Gradle, AGP 8.13.0, compileSdk, build-tools, Capacitor, APK and AAB sizes in bytes) to raw/build-versions.md | verify: `make apk` prints `APK: output/body-model-debug.apk`; `jarsigner -verify output/body-model-release.aab` prints `jar verified.`; `npm run lint` → exit 0
- [x] T1: profile module + tests (R5, R10 helpers, `profileErrors`) | size: M | wave: 2 | files: src/me/profile.ts, src/me/profile.test.ts | verify: `npx vitest run src/me/profile.test.ts` → all pass
- [x] T3: `partIdsByName` + tests; viewer `below` view, `setLayerOpacity`, `setPelvicView`, `onLayersChanged`; tune the `below` camera by headless screenshot, saved to docs/reports/m1b/below.png (R13) | size: M | wave: 2 | files: src/body/model.ts, src/body/model.test.ts, src/body/viewer.ts, docs/reports/m1b/below.png | verify: `npx vitest run src/body` → pass; `npx tsc --noEmit` → exit 0; the screenshot shows the pelvic floor meshes centred with translucent bones
- [x] T2: programs types, `visiblePrograms`, `canOpen`, `parseRoute` + tests; `data.test.ts` for programs.json rules (§5, R7–R9) written test-first, importing `partIdsByName` from T3 | size: M | wave: 3 | files: src/programs/programs.ts, src/programs/programs.test.ts, src/programs/data.test.ts | verify: `npx vitest run src/programs/programs.test.ts` → pass; `npx vitest run src/programs/data.test.ts` → every test fails, and the first failure message contains `programs.json` (file missing)
- [x] T5: research doses (fetch and read every guideline URL), write programs.json and raw/doses.md (R7, R8, §5) | size: L | wave: 4 | files: public/data/programs.json, plans/raw/doses.md | verify: `npx vitest run src/programs/data.test.ts` → pass; `test -s docs/done_development/m1b-android-programs/plans/raw/doses.md` and it lists every null dose and every guideline URL fetched
- [x] T6: profile screen, first-launch routing, nav row, DEV seed, design tokens in style.css (R6) | size: M | wave: 4 | files: src/ui/profile.ts, src/main.ts, src/style.css, src/ui/explore.ts | verify: `npm run build` → exit 0; `npx vitest run` → pass
- [ ] T7: programs screen: list, 18+ gate, detail, claims, highlights, pelvic view, banners, dispose; add `Viewer.isLayerVisible(key)` and wire Explore checkboxes to `onLayersChanged` (replace the snapshot workaround); then 360 px screenshots through `npm run dev` with `?seed=male&adult=1` (list, gate, detail) saved to docs/reports/m1b/ (R9–R13) | size: L | wave: 5 | files: src/ui/programs.ts, src/main.ts, src/style.css, src/ui/explore.ts, src/body/viewer.ts, docs/reports/m1b/*.png | verify: `npm run build && npm test && npm run lint` → exit 0; four screenshots exist
- [ ] T8: final `make apk`, docs and report (R14) | size: M | wave: 6 | files: docs/reports/M1b.md, docs/SPEC.md, docs/PLAN.md, CLAUDE.md | verify: `make apk` prints the APK line; `grep -c "|" docs/reports/M1b.md` > 10
- [ ] T9: main session, not a builder: after T8, commit only `android/` and `capacitor.config.ts` (the user asked for this in the brief) with message "M1b: Android project and Capacitor config", after checking `android/.gitignore` | size: S | wave: 7 | files: none edited | verify: `git ls-files android capacitor.config.ts | wc -l` > 0 and `git ls-files android | grep -Ec "/build/|local.properties|assets/public"` → 0

## 9. Out of scope
Rig, joint movement, effort engine, exercise animation, My model conditions and fat, GitHub Pages, PWA, female anatomy, Play Store listing.

## 10. Acceptance criteria
- AC1: `make apk` writes output/body-model-debug.apk using JDK 21, with no wrapper timeout.
- AC2: `make aab` with a throwaway keystore gives a signed AAB, and `jarsigner -verify` → "jar verified". No keystore is in git.
- AC3: A male profile never sees or opens the female program, and the reverse (unit test).
- AC4: Every claim in programs.json has a source and a valid label. Non-convention claims have an https URL. Every item is `animated: false`, has ≥ 1 valid claim id, and has target names that all resolve in parts.json. A non-null dose has a source URL.
- AC5: `npm run build`, `npm test` and `npm run lint` pass.
- AC6: Profile validation edge cases pass. Storage errors return null without throwing. No fetch outside BASE_URL data.
- AC7: The 18+ gate shows before any adultOnly program.
- AC8: The pelvic view shows the pelvic floor from below with translucent bones and the male-anatomy banner.
- AC9: `make run` serves the app on the LAN.
- AC10: The APK installs and opens offline on the phone. Load time and fps are reported (manual).
- AC11: docs/reports/M1b.md has versions, the claim table, unconfirmed doses and open questions.

## 11. Open questions
None.

## 12. Changelog
| When | Change | Why |
|---|---|---|
| 2026-11-14 16:17 | T4 also edits eslint.config.js: add `android`, `output` to `ignores`. A1 (lint) needs it. | Baseline lint fails with 1418 errors, all in android/app/src/main/assets/public/ (copied web build) |
| 2026-11-14 16:30 | Critic round 1: T4 moved to wave 1 alone and sized L; T3 before T2; T5 and T6 share wave 4; T9 done by main. Added pelvic-view ownership, `setPelvicView`, `onLayersChanged`, dispose, `parseRoute`, `profileErrors`, adult-flag helpers, exact item list, claim and caution mapping, DEV-only seed for screenshots. | Plan critic listed 16 guesses |
| 2026-11-14 16:30 | CLAUDE.md rules "no hand-written muscle list" and "claim needs a source" are not edited. SPEC §10 records the provisional-targets exception and convention claims with no URL. Flagged as an open question in the M1b report. | User approved provisional targets; changing project rules is the user's call |
| 2026-11-14 16:40 | T4 decisions after blockers. (1) Node: no Makefile change. The builder's shell has a foreign Node 20; the user's own shell already runs `npx cap sync` fine. Builder prefixes `PATH=$HOME/.nvm/versions/node/v24.15.0/bin:$PATH` for its runs only. (2) Download: the Gradle wrapper's Java client hits a dead GitHub CDN IP (185.199.109.133) and does not fall back. T4 may fetch the official zip with `curl -L` into the existing hash folder under `~/.gradle/wrapper/dists/gradle-8.14.3-all/`, after checking its SHA-256 against https://services.gradle.org/distributions/gradle-8.14.3-all.zip.sha256. The wrapper reuses a zip already there. The curl command goes into raw/build-versions.md and the report. | Builder blocker report |
| 2026-11-14 16:45 | T7 also edits src/body/viewer.ts: add `Viewer.isLayerVisible(key)`; Explore re-syncs checkboxes from it on `onLayersChanged`, replacing T6's snapshot workaround. | T6 builder blocker: no way to read layer visibility |
