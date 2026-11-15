"""R3: export every Z-Anatomy part from Startup.blend -> cache/za_raw.npz + .json.

Run with the venv python (it imports bpy): tools/pipeline/.venv/bin/python -I tools/pipeline/v5/za_export.py
Port of tools/sample/za_export.py: same kind rules, curves, decimate, triangulate, determinant flip.
"""
import os
import re
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import bpy  # noqa: E402  (bpy first: it makes bmesh importable)
import bmesh  # noqa: E402
import numpy as np  # noqa: E402

from v5 import body  # noqa: E402

RATIO = body.CFG['decimate']
BLEND = os.path.join(body.CACHE, 'za', body.CFG['sources']['za']['blend'])
OUT = os.path.join(body.CACHE, 'za_raw')

KEEP = re.compile(r"thoracolumbar fascia|iliotibial|aponeurosis|retinaculum|linea alba", re.I)
SKIP = re.compile(r"bursa|fascia|septum|sheath|ring|ligament|arytenoid|tarsal|pharyn|laryn|tongue|uvula|palat|auricular|\(", re.I)
TENDONISH = re.compile(r"tendon|aponeurosis|retinaculum|linea alba|galea|epicranial|fascia|iliotibial", re.I)
LABEL = re.compile(r"\.(j|t|g|i|s|o\w*|e\w*)$")
SKIP_COLS = re.compile(r"regions|reference lines|muscular insertions", re.I)
SYSMAP = {"8: Visceral systems": "organ", "5: Cardiovascular system": "vessel",
          "7: Nervous system & Sense organs": "nerve", "6: Lymphoid organs": "lymph", "3: Joints": "joint"}


def kind(o):
    """Sample kind() rules; label objects (LABEL suffix) are skipped in every collection."""
    cols = [c.name for c in o.users_collection]
    if not cols or LABEL.search(o.name):
        return None
    if o.type == "MESH" and len(o.data.polygons) == 0:
        return None
    if cols[0] == "4: Muscular system":
        if SKIP.search(o.name) and not KEEP.search(o.name):
            return None
        return "tendon" if TENDONISH.search(o.name) else "muscle"
    if cols[0] == "1: Skeletal system":
        return "bone"
    return SYSMAP.get(cols[0])


def ancestry(o, parent):
    out = []
    for c in o.users_collection:
        n = c.name
        while n:
            out.append(n)
            n = parent.get(n)
    return sorted(set(out))


def skipped_collection(name, parent):
    """True when the collection or one of its parents is Regions / Reference lines / Muscular insertions."""
    while name:
        if SKIP_COLS.search(name):
            return True
        name = parent.get(name)
    return False


def conv(a):
    """Blender Z-up/-Y-front -> Y-up/+Z-front: (x, z, -y). Units: metres already (factor 1)."""
    return np.stack([a[:, 0], a[:, 2], -a[:, 1]], 1).astype(np.float32)


def export_object(o, k, dg):
    """Evaluated, decimated, triangulated, world-space mesh -> (pos, nrm, tri) or None."""
    if o.type == "MESH":
        for m in o.modifiers:
            if m.type == "SUBSURF":
                m.show_viewport = False
        o.modifiers.new("dec", "DECIMATE").ratio = RATIO[k]
    else:
        o.data.resolution_u = min(o.data.resolution_u, 4)
        if getattr(o.data, "bevel_resolution", 0) > 2:
            o.data.bevel_resolution = 2
    dg.update()
    ev = o.evaluated_get(dg)
    try:
        me = ev.to_mesh()
    except Exception:
        return None
    try:
        if me is None or len(me.polygons) == 0:
            return None
        bm = bmesh.new()
        bm.from_mesh(me)
        bmesh.ops.triangulate(bm, faces=bm.faces[:])
        bm.to_mesh(me)
        bm.free()
        me.transform(o.matrix_world)
        if o.matrix_world.determinant() < 0:
            me.flip_normals()
        me.update()
        nv = len(me.vertices)
        if nv < 4:
            return None
        co = np.empty(nv * 3, np.float32)
        me.vertices.foreach_get("co", co)
        no = np.empty(nv * 3, np.float32)
        me.vertices.foreach_get("normal", no)
        tri = np.empty(len(me.polygons) * 3, np.int32)
        me.polygons.foreach_get("vertices", tri)
        return conv(co.reshape(-1, 3)), conv(no.reshape(-1, 3)), tri.reshape(-1, 3)
    finally:
        ev.to_mesh_clear()


def main():
    t0 = time.time()
    bpy.ops.wm.open_mainfile(filepath=BLEND)
    print(f"opened {BLEND} in {time.time() - t0:.1f}s", flush=True)
    parent = {ch.name: c.name for c in bpy.data.collections for ch in c.children}
    dg = bpy.context.evaluated_depsgraph_get()
    parts, skipped = [], {"collection": 0, "empty": 0}
    objs = [o for o in bpy.data.objects if o.type in ("MESH", "CURVE")]
    for i, o in enumerate(objs):
        k = kind(o)
        if not k:
            continue
        anc = ancestry(o, parent)
        # ponytail: only the primary collection's chain; region collections also link real parts
        if skipped_collection(o.users_collection[0].name, parent):
            skipped["collection"] += 1
            continue
        r = export_object(o, k, dg)
        if r is None:
            skipped["empty"] += 1
            continue
        pos, nrm, tri = r
        parts.append(body.Part(id=len(parts), name=o.name, kind=k, ancestry=anc, pos=pos, tri=tri, nrm=nrm))
        if len(parts) % 200 == 0:
            print(f"{len(parts)} parts ({i + 1}/{len(objs)} objects) {time.time() - t0:.0f}s", flush=True)
    body.save_parts(OUT, parts)
    allpos = np.concatenate([p.pos for p in parts])
    lo, hi = allpos.min(0), allpos.max(0)
    print("skipped", skipped)
    for k in RATIO:
        ks = [p for p in parts if p.kind == k]
        print(f"{k:7s} parts {len(ks):5d} tris {sum(len(p.tri) for p in ks):8d}")
    print("total parts", len(parts), "tris", sum(len(p.tri) for p in parts))
    print("bbox min", lo.round(4).tolist(), "max", hi.round(4).tolist(), "size", (hi - lo).round(4).tolist())
    print(f"export time {time.time() - t0:.1f}s")


if __name__ == "__main__":
    main()
