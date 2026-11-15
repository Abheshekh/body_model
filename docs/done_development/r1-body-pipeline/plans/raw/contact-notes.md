# R1 contact sheet notes (T10)

Sheets: `docs/reports/r1/sheet-<sex>-<depth>.png`, 1600×800, 8 views each (front, ¾ front, side, back / ¾ back, chest close-up, back close-up, pelvis). Taken with `node tools/pipeline/v5/contact/shoot.mjs` against Vite on 5190 (headless Chrome, SwiftShader). 10 sheets in 39 s; 1.2–4.8 s per sheet. No page errors.

Every sheet was looked at. Numbers below were measured by decoding the packs (Python, numpy) to confirm what the images show.

## Top problems
1. **AO far too dark (all non-skin sheets).** Ambient occlusion in the packs is near its floor for most vertices: muscle layer 1 median ao 0.13 (10th pct 0.12, 90th pct 1.0), layer 2 median 0.12, layers 3–6 all 0.12; bone mean 0.18, organ mean 0.21. Superficial muscle should be mostly open. The bimodal 0.12-or-1.0 spread looks like the AO rays hit the part's own surface (self-hits) in `layers.ambient_occlusion`. Effect: muscles render almost black on the back, ¾ back and back close-up views; detail is lost. Not fixable in T10's files.
2. **Limbs are bare from "intermediate" on.** Almost every arm and leg muscle is layer 1 or 2 (layers: 173/144/58/33/11/24 muscles for 1–6). The intermediate sheet (layer ≥ 3) already shows a bare limb skeleton with a few thin strips; only the trunk (intercostals, erector spinae, abdominal wall) is left. Intermediate and deep differ only in the thorax and back. Expected deep limb muscles (brachialis, vastus intermedius, soleus, tibialis posterior, deep forearm flexors) do not survive to layer 3. Worth checking in the T11 layer review.
3. **Female chest.** On the outer sheet the breast shape is made by the pectoralis major itself (sternocostal head pushed forward by the warp: female z max 0.118 m vs the generated breast fat's 0.113 m), so the "Mammary gland and breast fat" parts sit behind the muscle and are not seen. With the muscles removed (deep, bones) the breast fat shows as flat, jagged flaps floating in front of the ribs: each side is only 78 vertices. It reads as broken geometry, not a breast.

## Other findings
- **Inside-out generated female organs:** Uterus, Ovary.l/.r, Vagina (all `simplified`) have 0% of normals pointing outward (both sexes' positions). Not visible on the sheets because they sit behind the bladder and pelvis, but they will render inside-out in the app. Female "Right main bronchus" and "Right superior lobar bronchus" have only 22–28% outward normals (warp fold?); male versions are fine.
- **Female pelvis:** pelvis and organs look plausible in place; the uterus and ovaries cannot be seen from the pelvis view at any depth (bladder and pubis in front). No external genitalia on the female (none are generated; skin is a smooth MakeHuman mons).
- **Male pelvis:** with the skin off, the penis and testes hang in front of the pubis with no scrotum and no visible attachment (external genitalia are `ext` and shown on non-skin sheets, as specified). The MakeHuman male skin has no genitals, only a smooth bulge.
- **Greater omentum** (organ, dark red) covers the whole abdomen on every non-skin sheet and hides the intestines. All organs are drawn by spec; R2 may want it hidden by default (the sample viewer hid omentum, pleura, mesocolon).
- **Unused skin vertices:** the skin pack holds 19,158 vertices but its triangles use only 13,524. The unused 5,634 (MakeHuman helpers) reach y = −0.016 m (male) / −0.022 m (female) and widen the box; the drawn skin is correct (min y 0.000, max 1.710 / 1.567, matching `heights`). Costs pack bytes only; not visible.
- **Hands on the outer sheet** look white and bony: hand bones, palmar aponeurosis and retinacula are exposed because the intrinsic hand muscles are not layer 1.
- **Iliotibial tract** shows as a large white sheet on the lateral thigh (layer 1 tendon) — anatomically right, visually strong.
- **Skin sheets:** both sexes stand in the same A-pose, feet on the floor shadow, skin opaque, no holes or spikes seen. Female proportions and breasts look plausible.
- No exploded parts, no stray parts far from the body, and no inside-out muscle, tendon or bone parts (0 parts with mostly inward normals in those packs, both sexes).
- Both sexes' muscle sheets line up with the skin silhouettes; the female anatomy follows her shape (narrower shoulders, wider hips).

## Fix round 1 (F1–F5): sheets retaken
All 10 sheets retaken (`shoot.mjs`, Vite on 5190, 39 s, no page errors). Looked at sheet-female-outer, sheet-male-outer,
sheet-male-deep, plus female deep and bones chest close-ups. Numbers from decoding the packs.

- **F5 done:** omentum, mesocolon and pleura are skipped (`defaultHidden`). Deep and bones sheets now show the intestines,
  stomach and liver in the abdomen and the lungs behind the ribs, both sexes.
- **F2:** female pectoralis major is flatter in the chest close-up; it no longer follows the breast bulge. Its forward shift
  beyond the sternum's is 5.9 mm (was 12.2). Male sheets unchanged.
- **F3:** uterus, ovaries and vagina have 100% outward normals. The uterine tubes are right too (100% outward from each ring's
  centre), but only 57.7% / 59.6% by the F3 rule, because the curved tube's centroid lies outside the tube.
- **F4:** breast fat is 894 / 970 vertices, smooth border, 100% outward normals. It still sits behind the pectoralis on the
  outer sheet (the anatomy reaches past the MakeHuman skin on the chest: male pec max z 0.126 m vs male skin 0.117 m). On the
  deep and bones sheets 12–17% of its vertices have a rib in front of them (11–15% with the old field). This comes from the
  skin not fitting the anatomy, not from this fix.
- **F1 not fixed (pass rule cannot be met):** self hits are 3% of AO hits within 5 cm. Skipping them moves layer-1 median AO
  0.127 → 0.152 and the anatomy share at the floor 73.4% → 72.0%. Vertices you can see on the outer sheet have median AO
  0.98 (front) and 0.999 (back), so the dark backs on the outer sheet come from the lighting (the blue rim light on red
  muscle), not from AO. Half of every closed part sits against bone or a neighbour, so the layer-1 median counts hidden
  contact faces. Intermediate and deep sheets are dark because AO uses all anatomy as occluders (SPEC), so the faces the
  peel uncovers keep the occlusion from the layers above: visible median 0.12. A layer-aware test (part of layer L
  occluded only by layer ≥ L and non-soft parts; non-soft parts only by non-soft parts; self skipped) gives layer-1 median
  0.274 and 55% at the floor.

## Fix round 2 (F1b): sheets retaken
10 sheets retaken (39 s, no page errors). Intermediate sheets: intercostals, erector spinae and the remaining trunk muscles are
lit red now, not black; the back close-up is still darker than the front (lighting). Deep sheets: layer >= 5 leaves very few
muscles (some intercostals and deep back muscles), so they look like the bones sheet with organs; what muscle is left is lit.
The all-vertex medians do not move (layer-3+ 0.122) because most deep-muscle vertices touch bone or other deep muscle.
