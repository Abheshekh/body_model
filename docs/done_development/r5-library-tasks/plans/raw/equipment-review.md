# Equipment sheet review (fix round after the user's gate review; both PNGs viewed with the Read tool)
Sheets: docs/reports/r5/equipment-gym.png (15 tiles), equipment-objects.png (12 tiles), `tiles: 27 of 27`. Rendered in headless Chrome with SwiftShader, so lighting is softer than on a phone.

## Items the user flagged
- Resistance band: now a closed flat latex loop (40 mm × 1 mm, matte red), two strands with a half-turn grip loop round each fist, slight twist, slack sag at rest; in the player the strands still run hand to hand and narrow when stretched. Weak: at rest it floats in mid-air (no hands to hold it); seen edge-on in the front view the strands look thin.
- Plyo box: dark rubberised finish on the faces, bare birch ply edges and hand-hold walls, 4 mm bevel, inset non-slip diamond-tread rubber top. Weak: the 6 mm tread pattern is too fine to read at sheet scale; the top reads as plain dark rubber.
- Exercise mat: 15 mm foam (collider and surface raised to match), edges rounded by a 6 mm bevel, grit normal map on the top, darker blue. Close-up now looks at a corner. Weak: from the front and three-quarter views a 15 mm mat on a 1.83 m length still looks thin; no rolled strap (optional, skipped).
- Shopping bag: canvas tote with an open top, gusset folding in at the top, bulge, creases, hemmed rim, woven-canvas normal map, two flat 25 mm webbing straps meeting in the hand, a loaf and a green glass bottle neck above the rim, muted colours. Weak: the loaf is still a smooth capsule (no scoring); the bottle cap reads as a white blob.
- Chair: shadow strip under the seat removed; mid-tone wood (#74512f). Weak: the wood grain map is speckle plus faint lines, so it reads more as stained board than oak.
- Cable column: at rest the active attachment hangs straight down clipped just under the carriage pulley (3.5 cm cable); the rope at rest shows its static hanging strands; sheet views now face the carriage and the close-up shows it. In the player the attachment and live rope still follow the hands.
- Lat machine: at rest the bar hangs on its cable near the top (grips at 1.85 m, 0.24 m of cable); the missing cable run over the top beam between the two pulleys is now drawn.
- Leg press: at rest the sled sits restT = 0.4 m up the rails (legs nearly straight, the start position) instead of at the bottom stop; follows the feet in the player.
- Leg extension / leg curl: levers already rest in the start position (shin pad hanging just in front of the knee axis; ankle pad level behind it); unchanged. Weak: the sheet close-ups crop the lever pads.

## Unchanged from the first review
OK: flat bench, adjustable bench, squat rack, barbell, dumbbells, kettlebell, pull-up rig, step1, step2, box, bucket, suitcase, chest of drawers, mop, broom, gas cylinder. Child stays "simplified". Squat rack close-up is still cropped to the upright holes (framing).

## For the wave 4 hand-off
- buildEquipment (equipment.ts) cannot draw `objects` ids (chair, steps, ...): use `buildProps` or `buildObjects` from src/ui/workouts/objects.ts.
- With no body (`f(null)`) every moving part sits in its rest place; there is no separate rest mode.
- Hand-held objects: one grip follows the right hand and hangs (bucket, bag, suitcase, gas-cylinder); two grips sit between the hands (box, child); mop and broom lean from the floor to the hands. A split carry (5+5) needs two bag ids; not supported by one id.
