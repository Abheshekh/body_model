"""Geometry steps (SPEC §1.3 steps 2-4): outward normals, fibre field, rectus sheath, per-part decimation."""
import dataclasses
import re

import fast_simplification
import numpy as np
import trimesh

RECTUS = re.compile(r'^(Rectus abdominis|Pyramidalis)')
SHEATH = re.compile(r'^((External|Internal) abdominal oblique|Transversus abdominis)')


def vertex_normals(pos, tri):
    """Area-weighted vertex normals (the face cross product is twice the area)."""
    pos = np.asarray(pos, np.float64)
    tri = np.asarray(tri, np.int64)
    n = np.zeros_like(pos)
    A = np.zeros(len(pos))
    if len(tri):
        fn = np.cross(pos[tri[:, 1]] - pos[tri[:, 0]], pos[tri[:, 2]] - pos[tri[:, 0]])
        fa = np.linalg.norm(fn, axis=1)
        for i in range(3):
            np.add.at(n, tri[:, i], fn)
            np.add.at(A, tri[:, i], fa)
    L = np.linalg.norm(n, axis=1)
    bad = (L <= 1e-6 * A) | (A == 0)  # real data: back-to-back faces cancel; unused vertices have no faces
    if bad.any():  # ponytail: radial from the part centre; a smarter fallback if it ever shows on screen
        n[bad] = pos[bad] - pos.mean(0)
        n[bad & (np.linalg.norm(n, axis=1) == 0)] = (0, 1, 0)
        L[bad] = np.linalg.norm(n[bad], axis=1)
    return (n / L[:, None]).astype(np.float32)


def clean(part):
    """Real data: drops duplicate triangles (same 3 vertices, any winding), zero-area triangles and unused vertices."""
    if not len(part.tri):
        return part
    _, first = np.unique(np.sort(part.tri, 1), axis=0, return_index=True)
    keep = np.zeros(len(part.tri), bool)
    keep[first] = True
    p, t = part.pos.astype(np.float64), part.tri
    keep &= np.linalg.norm(np.cross(p[t[:, 1]] - p[t[:, 0]], p[t[:, 2]] - p[t[:, 0]]), axis=1) > 1e-12
    if keep.all() and len(np.unique(t)) == len(p):
        return part
    return _subset(part, keep)


def outward(pos, tri):
    """Flips the winding when the normals point toward the part's own centre on average."""
    tri = np.asarray(tri, np.int32)
    if len(pos) < 4 or not len(tri):
        return tri
    c = pos.mean(0)
    if (vertex_normals(pos, tri) * (pos - c)).sum(1).mean() < 0:
        return np.ascontiguousarray(tri[:, ::-1])
    return tri


def fibre_field(pos, tri):
    """SPEC step 3. Returns (fib (N,3), acr (N,)); fibres run origin -> insertion (the narrow end)."""
    p = np.asarray(pos, np.float64)
    fib, acr = np.zeros((len(p), 3), np.float32), np.zeros(len(p), np.float32)
    if len(p) < 4:
        return fib, acr
    c = p.mean(0)
    w, v = np.linalg.eigh((p - c).T @ (p - c))
    ax = v[:, -1]
    t = (p - c) @ ax
    lo, hi = np.quantile(t, [0.06, 0.94])
    E0, E1 = p[t <= lo], p[t >= hi]
    e0, e1 = E0.mean(0), E1.mean(0)
    s0 = np.linalg.norm(E0 - e0, axis=1).mean() + 1e-3
    s1 = np.linalg.norm(E1 - e1, axis=1).mean() + 1e-3
    if s0 < s1:  # e1 must be the narrow (insertion, tendon) end
        e0, e1, s0, s1 = e1, e0, s1, s0
    d0 = p - e0
    d0 /= np.linalg.norm(d0, axis=1, keepdims=True) + 1e-9
    d1 = e1 - p
    d1 /= np.linalg.norm(d1, axis=1, keepdims=True) + 1e-9
    d = d0 / s0 + d1 / s1
    fib[:] = d / (np.linalg.norm(d, axis=1, keepdims=True) + 1e-9)
    u2, u3 = v[:, -2], v[:, -3]
    if w[0] / (w[1] + 1e-12) < 0.12:  # flat or fan: angle around the tendon end in the sheet plane
        r = p - e1
        th = np.arctan2(r @ u2, np.abs(r @ ax) + 1e-4)
        R = np.sqrt(w[1] / len(p)) * 2
    else:  # spindle: angle around the long axis x mean radius
        r = p - c
        th = np.arctan2(r @ u3, r @ u2)
        R = np.sqrt((w[0] + w[1]) / len(p))
    acr[:] = th * R
    return fib, acr


def _subset(part, keep_tri):
    """Part with only the kept triangles; unused vertices are dropped."""
    tri = part.tri[keep_tri]
    used = np.unique(tri)
    remap = np.full(len(part.pos), -1, np.int64)
    remap[used] = np.arange(len(used))
    per_vertex = {k: getattr(part, k)[used] for k in ('pos', 'nrm', 'fib', 'acr', 'ao')}
    if part.posF is not None:
        per_vertex['posF'] = part.posF[used]
    return dataclasses.replace(part, tri=remap[tri].astype(np.int32), **per_vertex)


def remove_sheath(parts, depth):
    """SPEC step 4: deletes oblique/transversus triangles within `depth` m of rectus abdominis along the normal."""
    rectus = [p for p in parts if p.kind == 'muscle' and RECTUS.match(p.name) and len(p.tri)]
    if not rectus:
        return parts
    off = np.cumsum([0] + [len(p.pos) for p in rectus])
    mesh = trimesh.Trimesh(np.concatenate([p.pos for p in rectus]),
                           np.concatenate([p.tri + o for p, o in zip(rectus, off)]), process=False)
    out = []
    for p in parts:
        if p.kind != 'muscle' or not SHEATH.match(p.name) or not len(p.tri):
            out.append(p)
            continue
        n = p.nrm / (np.linalg.norm(p.nrm, axis=1, keepdims=True) + 1e-9)
        apo = np.zeros(len(p.pos), bool)
        for sg in (-1, 1):
            o = p.pos + sg * n * 0.001
            loc, ri, _ = mesh.ray.intersects_location(o, sg * n, multiple_hits=False)
            apo[ri[np.linalg.norm(loc - o[ri], axis=1) < depth]] = True
        out.append(_subset(p, apo[p.tri].sum(1) < 2))
    return out


def decimate_parts(parts, keep):
    """Per-part fast_simplification to `keep[kind]` of the triangles; kinds missing from keep stay whole."""
    out = []
    for p in parts:
        k = keep.get(p.kind, 1.0)
        if k >= 1.0 or len(p.tri) <= 60:  # ponytail: tiny parts stay whole, as the sample
            out.append(p)
            continue
        try:
            V, T = fast_simplification.simplify(p.pos.astype(np.float64), p.tri, target_reduction=1.0 - k)
        except Exception:  # ponytail: as the sample, a part the simplifier rejects stays whole
            out.append(p)
            continue
        out.append(dataclasses.replace(p, pos=V.astype(np.float32), tri=T.astype(np.int32),
                                       nrm=vertex_normals(V, T), fib=None, acr=None, ao=None, posF=None))
    return out


def run(ctx):
    cfg, parts = ctx['cfg'], ctx['parts']
    parts = [clean(p) for p in parts]
    for p in parts:
        p.tri = outward(p.pos, p.tri)
        p.nrm = vertex_normals(p.pos, p.tri)
    parts = [clean(p) for p in decimate_parts(parts, cfg['keep'])]
    for p in parts:
        if p.kind in ('muscle', 'tendon'):
            p.fib, acr = fibre_field(p.pos, p.tri)
            p.acr = acr + (p.id % 7) * 0.013  # per-part stripe phase, as the sample
    ctx['parts'] = remove_sheath(parts, cfg['sheath']['depth'])
    return ctx
