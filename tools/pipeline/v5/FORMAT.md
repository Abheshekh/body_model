# Body data format v1 (`public/data/body/`)

Contract between the v5 pipeline (`tools/pipeline/v5/pack.py`) and the app (R2). Written by `npm run pipeline:v5`.

## Files
| File | What |
|---|---|
| `manifest.json` | box, heights, pack list, part list |
| `<kind>.bin.gz` | one pack per kind, gzip (level 9) of the raw byte layout below |
| `credits.json` | sources, licences, commit hashes (show in the app) |
| `rig.json` | R3: skeleton per sex, joint table, part → bone for rigid parts (written by `rig.py`) |
| `weights.bin.gz` | R3: per-vertex skin weights, a demand file loaded only when the body moves (not in `packs`) |

## manifest.json
```
{ "version": 1, "box": [[x,y,z],[x,y,z]], "sexes": ["male","female"],
  "heights": {"male": m, "female": m},
  "packs": [ { "name": "muscle", "kinds": ["muscle"], "load": "first", "file": "muscle.bin.gz",
               "bytes": n, "gzBytes": n, "verts": n, "tris": n,
               "arrays": { "idx": [offset, bytes], "posM": [...], "posF": [...], "nrmM": [...], "nrmF": [...],
                           "fib": [...], "acr": [...], "mid": [...], "ao": [...] } } ],
  "parts": [ { "id": 0, "name": "...", "plain": "...", "side": "left|right|center", "kind": "...",
               "region": "...", "system": "...", "colour": "#rrggbb", "layer": 1|null,
               "sex": "both|male|female", "ext": false, "simplified": false, "defaultHidden": false, "pack": "muscle" } ],
  "credits": "credits.json",
  "rig": { "file": "rig.json",
           "weights": { "file": "weights.bin.gz", "bytes": n, "gzBytes": n,
                        "arrays": { "skin": { "bi": [offset, bytes], "bw": [offset, bytes] }, "muscle": {...}, ... } } } }
```
- Units: metres. Axes: Y up, +Z front, X = body's left. Both sexes stand in the same pose, feet on y = 0.
- `box`: shared body box (all male and female positions, padded 1 cm) used to decode positions.
- `heights`: posed skin height per sex (max y − min y).
- `packs` is a list, not a fixed set. Today: `skin, muscle, tendon, bone, organ` are `load: "first"`; `vessel, nerve, lymph, joint` are `load: "demand"`. Later packs (e.g. an organ group) may have `kinds: ["organ"]` too.
- `parts[].id` is the value stored in `mid`. Ids are unique and stable across both sexes; they are not list positions.
- `layer`: 1–6 for muscle and tendon (1 = outermost), `null` otherwise.
- `sex`: `male` parts are hidden on the female and `female` parts on the male. `simplified: true` = generated stand-in (female organs), label it "simplified".
- `defaultHidden`: true for Greater omentum, Lesser omentum, Mesocolon, Pleura (they cover the organs); start hidden, the user can show them.
- `ext`: external genitalia, hidden while the skin is opaque.

## Pack byte layout
`arrays[name] = [offset, bytes]` into the decompressed pack. Every array starts on a 4-byte boundary. Little-endian.

| Array | Type | Per | Decode |
|---|---|---|---|
| `idx` | uint32 × 3 | triangle | vertex indices into this pack; triangles are sorted by part id |
| `posM` | uint16 × 3 | vertex | male position = box[0] + v / 65535 × (box[1] − box[0]) |
| `posF` | uint16 × 3 | vertex | female position, same decode |
| `nrmM` | int8 × 3 | vertex | male normal = v / 127 |
| `nrmF` | int8 × 3 | vertex | female normal = v / 127 |
| `fib` | int8 × 3 | vertex | fibre direction = v / 127 (origin → insertion); meaningful for muscle and tendon only |
| `acr` | int16 | vertex | across-fibre coordinate (m) = v / 8000 (stripe phase) |
| `mid` | uint16 | vertex | part id (`parts[].id`) |
| `ao` | uint8 | vertex | ambient occlusion 0–1 = v / 255 (skin = 1) |

Counts: `tris` = idx bytes / 12; `verts` = posM bytes / 6. The viewer decompresses with `DecompressionStream('gzip')`.

## rig.json (R3)
```
{ "version": 1, "sources": ["..."],
  "bones": [ { "name": "pelvis", "parent": null, "headM": [x,y,z], "tailM": [...], "headF": [...], "tailF": [...] }, ... ],
  "joints": { "<jointKey>": { "bones": ["upperarm_l"], "axes": ["flex","abd","rot"], "derived": true? } },
  "partBone": { "<part id>": boneIndex } }
```
- `bones`: the 22 driven bones, parents before children: `pelvis, spine_01..03, neck_01, head, clavicle_l/r, upperarm_l/r, lowerarm_l/r, hand_l/r, thigh_l/r, calf_l/r, foot_l/r, ball_l/r`. A bone index is its position in this list.
- Heads/tails: the MakeHuman game rig as posed by the fit (`pose.py`), metres, same frame as the packs, per sex (`M`, `F`). Limb heads are snapped to joint centres fitted to the bones (male: Z-Anatomy; female: the warped anatomy): upperarm = humeral head sphere, lowerarm = distal humerus sphere, hand = distal radius end, thigh = femoral head sphere, calf = distal femur sphere, foot = distal tibia end. A parent tail that met the old head moves with it; the hand (no driven child) moves whole, keeping MakeHuman's direction and length.
- `joints`: PLAN §4 joint table. `pelvis` axes `x, y, z` are root offsets (m); `scapula_*` is `derived` (follows the arm, not user-driven).
- `partBone`: every `bone` and `organ` part is rigid to one bone (bones by `tools/pipeline/v5/bone_map.json`, nearest segment if unmatched; organs by the nearest trunk bone to the part centre). These parts have no per-vertex weights.

## weights.bin.gz (R3)
gzip (level 9). For each pack in manifest order whose kind is one of `skin, muscle, tendon, vessel, nerve, lymph, joint`: `bi` (uint8 × 4 per vertex, bone indices into `rig.json` `bones`) then `bw` (uint8 × 4 per vertex, weights, sum 255), in that pack's vertex order. Each array starts on a 4-byte boundary; `manifest.rig.weights.arrays[pack] = {bi: [offset, bytes], bw: [offset, bytes]}`. Unused slots have weight 0 (index 0). One set of weights serves both sexes.
- Skin: MakeHuman's game-engine weights, finger bones folded into the hand, top 4.
- Other kinds: chain by region (Arm, Hand → arm of that side; Leg, Foot → leg; else axial); each vertex goes to its nearest bone segment on the chain and blends (smoothstep, ±4 cm along the limb) into the next bone at each joint. Thorax-to-arm muscles blend sideways instead: by the vertex's |x| distance from the shoulder pivot (±4 cm) between spine_03/clavicle and the arm.

## weights_rigid.bin.gz (R3, R11 fallback; not app data)
Written to `tools/pipeline/cache/` for measurement only (`acceptance_rig.py` compares it with the smooth set); it does not ship. Same layout as `weights.bin.gz`; `tools/pipeline/cache/weights_rigid.json` holds its entry (same shape as `manifest.rig.weights`). Skin keeps MakeHuman's weights. Other kinds: each vertex goes to its single nearest bone segment on its chain (same chains as above; thorax-to-arm muscles use the arm chain of their side) and blends (smoothstep, ±1.5 cm along the limb) into the next bone only at the joint caps. No full-length gradient or sideways rule.
