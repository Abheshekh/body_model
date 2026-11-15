# tools/sample — approved v5 sample (reference code)

The sample that was approved on 15 Nov 2026: male and female complete human from Z-Anatomy + MakeHuman, with layer peeling, all systems, skin, and the Body page inspector. R1 ports this into `tools/pipeline/` with tests; R2 ports `viewer.html` into `src/`. Do not ship this folder.

| File | Step |
|---|---|
| `za_export.py` | Blender (bpy) export of every Z-Anatomy part by kind → `out2/body.bin` + `body.json` (8–25 min) |
| `mh_build.py` | MakeHuman male and female from base mesh + ethnic targets → `mh/mh.npz` |
| `mh_fit.py` | Pose both MakeHuman bodies to Z-Anatomy landmarks (game rig, LBS); male→female warp field → `mh/fit.npz` |
| `build_v3.py` | Clean, decimate, fibre field, sheath removal, female warp, sex parts, layers, AO, names, quantise + gzip → `site/` |
| `viewer.html` | The Body page sample (three.js 0.170 from CDN) |
| `shot2.py` | Headless screenshots (Playwright + Chrome, swiftshader) |
| `post.py`, `bake_ao.py` | Earlier male-only steps, kept for reference |

Sources (partial git clones, paths hard-coded at the top of each script):
- Z-Anatomy: `git clone --depth 1 --filter=blob:none https://github.com/Z-Anatomy/Models-of-human-anatomy` then unzip `Z-Anatomy.zip` → `Startup.blend`
- MPFB2 (MakeHuman CC0 data): `git clone --depth 1 --filter=blob:none --no-checkout https://github.com/makehumancommunity/mpfb2`, then check out `src/mpfb/data/3dobjs/base.obj`, `targets/macrodetails/{african,asian,caucasian}-{male,female}-young.target.gz`, `mesh_metadata/basemesh_vertex_groups.json`, `rigs/standard/{rig,weights}.game_engine.json`. Do not run `git ls-tree -l` on a blobless clone: it downloads every blob.

Python packages: `bpy` (Python 3.13 wheel), `numpy`, `scipy`, `trimesh`, `embreex`, `fast-simplification`. Name scripts so they do not shadow stdlib modules (a file named `inspect.py` crashes bpy).

Sample numbers: 2,651 parts; triangles muscle 418k, tendon 50k, bone 72k, organ 97k, vessel 186k, nerve 216k, lymph 38k, joint 57k, skin 27k; 29.9 MB raw, 16.1 MB gzip; build 30 s after export.

Artifact quirks (sample only): binary files are shipped as base64 text chunks because the artifact host refuses binary extensions.
