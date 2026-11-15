# Show reproduction (R5), before any code change

Taken 2026-11-15 on `r0-clean-slate` (M1b code, no R0 fixes), `npm run dev` on port 5173, headless Chrome via `raw/cdp-shot.mjs` (SwiftShader WebGL, default 8000 ms wait, 1500 ms after the click).
URL: `http://localhost:5173/?seed=male&adult=1#programs/<program id>`, js `document.querySelectorAll('.item-head')[i].click()`.

`yellow` / `yellowVisible` are the cdp-shot numbers (§4 rule: `r > 200 && g > 150 && b < 90 && r - b > 140`, every 4th pixel).
`loose` is a diagnostic only, from a scratch copy of cdp-shot: visible canvas samples with `r > 120 && g > 90 && b < 60 && r - b > 100`. It is not part of the plan's measurement.

| Item | i | Width | PNG | yellow | yellowVisible | loose | Turns yellow? | Can it be seen? | What covers the targets |
|---|---|---|---|---|---|---|---|---|---|
| wall-slide | 4 | 1280 | repro-wall-1280.png | 13 | 0 | 7 | yes (serratus anterior) | barely: a ~3 px sliver of serratus at each armpit | trapezius ascending parts are on the back; the front camera cannot see them. Superficial muscles (pectoralis, latissimus) cover most of serratus |
| wall-slide | 4 | 390 | repro-wall-390.png | 6 | 0 | 5 | yes | barely: serratus slivers at the chest sides | toolbar (3 rows + search, to y≈245) covers head and neck; sheet (from y≈338) covers from the lower chest down; trapezius on the back |
| dead-bug | 9 | 1280 | repro-deep-1280.png | 13 | 0 | 602 | yes (rectus abdominis, external oblique) | superficial targets yes; transversus abdominis and internal oblique no | rectus abdominis and external oblique (superficial) cover the deep targets |
| dead-bug | 9 | 390 | repro-deep-390.png | 6 | 0 | 204 | yes | upper abdomen only, in the band between toolbar and sheet | sheet covers the lower abdomen; superficial targets cover the deep ones; toolbar covers the head |
| hamstring-curl | 8 | 1280 | repro-leg-1280.png | 18 | 0 | 3 | yes | barely: slivers at the sides of each knee | the hamstrings are on the back of the thigh; the front camera sees only their edges |
| hamstring-curl | 8 | 390 | repro-leg-390.png | 6 | 0 | 0 | yes (by the 1280 shot) | no | sheet covers everything below the chest, including both legs; targets are also posterior |
| slow-holds | 1 | 1280 | repro-pelvic-1280.png | 24 | 0 | 93 | yes | yes: pelvic view from below, targets fill the centre | nothing |
| slow-holds | 1 | 390 | repro-pelvic-390.png | 13 | 0 | 59 | yes | top half only, in the band between search box and sheet | sheet covers the lower half of the targets; toolbar covers the area above |

The `yellow` counts (6–24) are the yellow "Show" buttons and banner bars in the sheet, not the body: `yellowVisible` is 0 in all eight.

## Defects seen

1. **Measurement rule misses the highlight (not covered by §4).** The lit `#ffd400` on the canvas renders darker than the rule allows. Sampled from repro-deep-1280's decoded PNG, inside the yellow abdomen: (144,114,0), (163,131,5), (172,140,11). None passes `r > 200 && g > 150`. The brightest low-blue pixel in that PNG is (255,212,0), the Show button. So `yellowVisible` is 0 even where a large yellow area is plainly visible (deep-1280, about 600 visible samples by the loose rule). As written, T4's verify and A17 (`yellowVisible ≥ 50`) cannot pass whatever the fixes do. Decision needed: change the threshold in §4 step 5 (for example the loose rule above), or change the highlight rendering (for example emissive or unlit), before T4.
2. Posterior targets (trapezius ascending parts, hamstrings) seen from the front. Covered by §4 `facing`.
3. Deep targets (transversus abdominis, internal oblique) hidden under superficial targets and muscles. Covered by §4 see-through at 0.35.
4. At 390×844 the sheet (60vh) covers the body from the chest down, and the toolbar covers the head. Covered by §4 inset, peek and `frameIds`.
5. The active row is not scrolled into view after the click (wall-slide, dead-bug and hamstring-curl rows sit off-screen in the sheet). Covered by §4 select step 6.
6. At 1280 the sheet sits over the right end of the Explore toolbar: the search box is hidden behind it. UI over UI, not over the body. Not covered by §4.
7. Pelvic items show "The body shown is male anatomy." twice: the sheet's top banner and the program's own note. Cosmetic, existing M1b behaviour. Not covered by §4.
