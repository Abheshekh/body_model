# Body Model

Android app that shows, on a real anatomical 3D body, which single muscles and joints any movement uses. Personal project. Play Store later as a free app.

## Read before any work
- `docs/PLAN.md`: goal, decisions, milestones, risks
- `docs/SPEC.md`: how each part must work
- `docs/PROMPTS.md`: one prompt per milestone
- `docs/reports/`: what earlier milestones found

## Rules
- One milestone at a time (R0…R7, docs/PROMPTS.md). Stop at its checkpoint and write the report. Do not start the next one.
- `src/engine/` is a pure module. No three.js imports. Every rule has a test.
- Data lives in JSON under `public/data/`, never hard-coded. Every data file carries its sources.
- Muscle effort comes from the engine. Never hand-write a muscle list for an exercise. Only exception: R3 provisional lists, marked "provisional" and removed in R4.
- No placeholder geometry in reviewed content. Generated stand-ins only where PLAN section 10 allows, labelled "simplified".
- Report real measurements (triangles, file size, frames per second). No guesses presented as results.
- If a decision in the docs turns out wrong, change the doc in the same commit and say so in the report.
- Assets: free only. Z-Anatomy (CC BY-SA 4.0, from BodyParts3D CC BY-SA 2.1 JP) and MakeHuman (CC0). Keep credits in the app. Record the source and licence of every asset added.
- Two bodies, male and female, share part ids. Every feature works on both.
- Phone first: the body is never covered by UI.
- Health data: never commit real personal numbers. Nothing on the My model screen leaves the device.
- Medical wording: education only, no diagnosis. Every medical claim on screen needs a source.

## Stack
TypeScript, three.js, Vite, Vitest. Capacitor for Android. Python only in `tools/` for the data pipeline. Android builds: `make apk` and `make aab`, output in `./output`.
