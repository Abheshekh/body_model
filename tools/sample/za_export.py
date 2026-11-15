# Export a sample écorché from Z-Anatomy: muscles, tendons, bones -> raw buffers + json.
# ponytail: one-off sample exporter, not the R1 pipeline.
import bpy, bmesh, json, re, sys
import numpy as np

SRC = "/tmp/src/za/Z-Anatomy/Startup.blend"
OUT = "/home/claude/sample/out2"
RATIO = {"muscle": float(sys.argv[1]) if len(sys.argv) > 1 else 0.14, "tendon": 0.3, "bone": 0.12, "organ": 0.35, "vessel": 0.5, "nerve": 0.2, "lymph": 0.3, "joint": 0.3}

bpy.ops.wm.open_mainfile(filepath=SRC)
keep = re.compile(r"thoracolumbar fascia|iliotibial|aponeurosis|retinaculum|linea alba", re.I)
skip = re.compile(r"bursa|fascia|septum|sheath|ring|ligament|arytenoid|tarsal|pharyn|laryn|tongue|uvula|palat|auricular|\(", re.I)
tendonish = re.compile(r"tendon|aponeurosis|retinaculum|linea alba|galea|epicranial|fascia|iliotibial", re.I)

def kind(o):
    cols = [c.name for c in o.users_collection]
    if not cols: return None
    if o.type == "MESH" and len(o.data.polygons) == 0: return None
    if cols[0] == "4: Muscular system":
        if skip.search(o.name) and not keep.search(o.name): return None
        return "tendon" if tendonish.search(o.name) else "muscle"
    if cols[0] == "1: Skeletal system":
        return "bone"
    if re.search(r"\.(j|t|g|i|s|o\w*|e\w*)$", o.name): return None
    sysmap = {"8: Visceral systems": "organ", "5: Cardiovascular system": "vessel", "7: Nervous system & Sense organs": "nerve",
              "6: Lymphoid organs": "lymph", "3: Joints": "joint"}
    return sysmap.get(cols[0])

parent = {}
for c in bpy.data.collections:
    for ch in c.children: parent[ch.name] = c.name
def ancestors(o):
    out = []
    for c in o.users_collection:
        n = c.name
        while n:
            out.append(n); n = parent.get(n)
    return sorted(set(out))
dg = bpy.context.evaluated_depsgraph_get()
buckets = {k: {"pos": [], "nrm": [], "fib": [], "mid": [], "idx": [], "n": 0, "parts": []} for k in RATIO}
names = []
for o in list(bpy.data.objects):
    if o.type not in ("MESH", "CURVE"): continue
    k = kind(o)
    if not k: continue
    if o.type == "MESH":
        for m in o.modifiers:
            if m.type in ("SUBSURF",): m.show_viewport = False
        dm = o.modifiers.new("dec", "DECIMATE"); dm.ratio = RATIO[k]
    else:
        o.data.resolution_u = min(o.data.resolution_u, 4)
        if getattr(o.data, "bevel_resolution", 0) > 2: o.data.bevel_resolution = 2
    dg.update()
    ev = o.evaluated_get(dg)
    try: me = ev.to_mesh()
    except Exception: continue
    if me is None or len(me.polygons) == 0: ev.to_mesh_clear(); continue
    bm = bmesh.new(); bm.from_mesh(me); bmesh.ops.triangulate(bm, faces=bm.faces[:]); bm.to_mesh(me); bm.free()
    me.transform(o.matrix_world)
    if o.matrix_world.determinant() < 0: me.flip_normals()
    me.update()
    nv = len(me.vertices)
    if nv < 4: ev.to_mesh_clear(); continue
    co = np.empty(nv * 3, np.float32); me.vertices.foreach_get("co", co); co = co.reshape(-1, 3)
    no = np.empty(nv * 3, np.float32); me.vertices.foreach_get("normal", no); no = no.reshape(-1, 3)
    tri = np.empty(len(me.polygons) * 3, np.int32); me.polygons.foreach_get("vertices", tri)
    ev.to_mesh_clear()
    # fibre axis = principal axis of the part (origin -> insertion, roughly)
    c = co - co.mean(0)
    w, v = np.linalg.eigh(c.T @ c)
    ax = v[:, -1].astype(np.float32)
    b = buckets[k]
    mid = len(names); names.append({"name": o.name, "kind": k, "cols": ancestors(o)})
    b["parts"].append([mid, len(b["idx"]) and sum(len(x) for x in b["idx"]) // 3, len(tri) // 3])
    b["pos"].append(co); b["nrm"].append(no); b["fib"].append(np.tile(ax, (nv, 1)))
    b["mid"].append(np.full(nv, mid, np.float32)); b["idx"].append(tri + b["n"]); b["n"] += nv

import os; os.makedirs(OUT, exist_ok=True)
meta = {"names": names, "groups": {}}
blob = bytearray()
for k, b in buckets.items():
    pos = np.concatenate(b["pos"]); nrm = np.concatenate(b["nrm"]); fib = np.concatenate(b["fib"])
    mid = np.concatenate(b["mid"]); idx = np.concatenate(b["idx"]).astype(np.uint32)
    # Blender Z-up -> three Y-up: (x, z, -y)
    conv = lambda a: np.stack([a[:, 0], a[:, 2], -a[:, 1]], 1).astype(np.float32)
    pos, nrm, fib = conv(pos), conv(nrm), conv(fib)
    g = {"parts": b["parts"], "verts": len(pos), "tris": len(idx) // 3}
    for key, arr in (("pos", pos), ("nrm", nrm), ("fib", fib), ("mid", mid.astype(np.float32)), ("idx", idx)):
        g[key] = [len(blob), arr.nbytes]; blob += arr.tobytes()
    meta["groups"][k] = g
    print(k, "parts", len(b["parts"]), "tris", g["tris"], "bbox", pos.min(0), pos.max(0))
open(f"{OUT}/body.bin", "wb").write(blob)
json.dump(meta, open(f"{OUT}/body.json", "w"))
print("bytes", len(blob))
