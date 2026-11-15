# Body data format v1 (`public/data/body/`)

Contract between the v5 pipeline (`tools/pipeline/v5/pack.py`) and the app (R2). Written by `npm run pipeline:v5`.

## Files
| File | What |
|---|---|
| `manifest.json` | box, heights, pack list, part list |
| `<kind>.bin.gz` | one pack per kind, gzip (level 9) of the raw byte layout below |
| `credits.json` | sources, licences, commit hashes (show in the app) |

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
  "credits": "credits.json" }
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
