"""Female anatomy and sex parts (SPEC §1.3 steps 8-9): warp by D, male-only flags, generated female parts, skin part."""
import re

import numpy as np
import trimesh
from scipy import sparse
from scipy.sparse.linalg import spsolve
from scipy.spatial import cKDTree

from v5 import names
from v5.body import Part
from v5.geom import outward, vertex_normals

MALE_ONLY = re.compile(r'^urethra$|penis|\btesti|scrot|prostat|seminal|epididym|deferens|spermatic|ejaculat|bulbo-?urethral', re.I)
EXTERNAL = re.compile(r'penis|\btesti|scrot|epididym|pubic hair', re.I)  # hidden while skin is opaque (clinical)
BUMP, RINGS = 0.004, 2  # breast region for the anatomy field: |Dfull - Dlow| > 4 mm on the chest, grown 2 rings
BREAST_VERTS = 400  # breast fat is subdivided to at least this many vertices per side (other generated organs: 504)


def warp_points(P, male_skin, D, k=10):
    """Moves each point by the inverse-distance-weighted D of its k nearest male skin vertices."""
    P = np.asarray(P, np.float64)
    if not len(P):
        return P.astype(np.float32)
    k = min(k, len(male_skin))
    d, j = cKDTree(male_skin).query(P, k=k)
    d, j = d.reshape(len(P), -1), j.reshape(len(P), -1)
    w = 1 / (d + 0.01) ** 2
    w /= w.sum(1, keepdims=True)
    return (P + (np.asarray(D)[j] * w[..., None]).sum(1)).astype(np.float32)


def chest(V):
    return (V[:, 1] > 1.05) & (V[:, 1] < 1.45) & (V[:, 2] > 0.02)


def anatomy_field(pose):
    """D for the anatomy with the breast taken out (SPEC step 8): the breast region of Dlow is replaced by the harmonic
    fill from its border, so the chest wall under the breast moves like the skin around it."""
    M, FQ = np.asarray(pose['male'], np.float64), pose['faces']
    D = np.asarray(pose['Dlow'], np.float64).copy()
    e = np.concatenate([FQ[:, [i, (i + 1) % FQ.shape[1]]] for i in range(FQ.shape[1])])
    A = sparse.coo_matrix((np.ones(len(e)), (e[:, 0], e[:, 1])), (len(M), len(M))).tocsr()
    A = ((A + A.T) > 0).astype(np.float64)
    box = chest(M)
    box[np.setdiff1d(np.arange(len(M)), FQ)] = False  # MakeHuman helper vertices have no faces
    m = box & (np.linalg.norm(pose['Dfull'] - D, axis=1) > BUMP)
    for _ in range(RINGS):
        m = box & (m | (A @ m.astype(np.float64) > 0))
    if m.any():
        L = sparse.diags(np.asarray(A.sum(1)).ravel()) - A
        i, b = np.flatnonzero(m), np.flatnonzero(~m)
        D[i] = spsolve(L[i][:, i].tocsc(), -(L[i][:, b] @ D[b]))
    return D.astype(np.float32)


def quads_to_tris(faces):
    return np.concatenate([faces[:, [0, 1, 2]], faces[:, [0, 2, 3]]]).astype(np.int32)


def ellipsoid(c, r, R=np.eye(3), nu=28, nv=18, profile=None):
    us, vs = np.meshgrid(np.linspace(0, 2 * np.pi, nu, endpoint=False), np.linspace(0, np.pi, nv))
    k = np.ones_like(vs) if profile is None else profile(vs / np.pi)
    P = np.stack([np.sin(vs) * np.cos(us) * k, np.cos(vs), np.sin(vs) * np.sin(us) * k], -1).reshape(-1, 3) * r
    P = P @ R.T + c
    T = []
    for a in range(nv - 1):
        for b in range(nu):
            i0, i1, i2, i3 = a * nu + b, a * nu + (b + 1) % nu, (a + 1) * nu + b, (a + 1) * nu + (b + 1) % nu
            T += [[i0, i2, i1], [i1, i2, i3]]
    return P, np.array(T)


def tube(pts, rad, nu=12):
    pts = np.asarray(pts)
    P, T = [], []
    for i, p in enumerate(pts):
        t = pts[min(i + 1, len(pts) - 1)] - pts[max(i - 1, 0)]
        t /= np.linalg.norm(t)
        a = np.cross(t, [0, 0, 1.0]) if abs(t[2]) < 0.9 else np.cross(t, [1.0, 0, 0])
        a /= np.linalg.norm(a)
        b = np.cross(t, a)
        r = rad(i / (len(pts) - 1)) if callable(rad) else rad
        for j in range(nu):
            ang = 2 * np.pi * j / nu
            P.append(p + r[0] * np.cos(ang) * a + r[1] * np.sin(ang) * b if np.ndim(r) else p + r * (np.cos(ang) * a + np.sin(ang) * b))
    for i in range(len(pts) - 1):
        for j in range(nu):
            i0, i1, i2, i3 = i * nu + j, i * nu + (j + 1) % nu, (i + 1) * nu + j, (i + 1) * nu + (j + 1) % nu
            T += [[i0, i2, i1], [i1, i2, i3]]
    return np.array(P), np.array(T)


def rotx(a):
    c, s = np.cos(a), np.sin(a)
    return np.array([[1, 0, 0], [0, c, -s], [0, s, c]])


def female_parts(bladder, pose):
    """Generated (simplified) female organs, as the sample: (name, V, T) placed from the warped bladder and the skin bump."""
    out = []
    bl_c = bladder.mean(0)
    # uterus: pear, ~7.5 x 5 x 3 cm, anteverted over the bladder
    ut_c = bl_c + np.array([0, 0.045, -0.035])
    Rut = rotx(-0.75)
    out.append(('Uterus (simplified)', *ellipsoid(ut_c, np.array([0.025, 0.038, 0.016]), Rut,
                                                    profile=lambda f: 0.55 + 0.45 * np.sin(np.clip(f, 0, 1) * np.pi * 0.8 + 0.3))))
    top, cervix = ut_c + Rut @ np.array([0, 0.03, 0]), ut_c + Rut @ np.array([0, -0.036, 0])
    for sx in (1, -1):
        sd = '.l' if sx > 0 else '.r'
        ov = ut_c + np.array([sx * 0.06, 0.012, -0.012])
        out.append((f'Ovary{sd} (simplified)', *ellipsoid(ov, np.array([0.016, 0.009, 0.011]))))
        path = [top + (ov - top) * t + np.array([0, 0.022 * np.sin(t * np.pi), 0.006 * np.sin(t * np.pi)]) for t in np.linspace(0.0, 1, 13)]
        out.append((f'Uterine tube{sd} (simplified)', *tube(path, 0.0028)))
    out.append(('Vagina (simplified)', *tube([cervix + np.array([0, -0.08 * t, 0.025 * t]) for t in np.linspace(0, 1, 10)], (0.014, 0.006))))
    # breast: mammary gland + fat = female skin bump over the chest, offset 4 mm inward
    FQ, skinF = pose['faces'], pose['female']
    bump = np.linalg.norm(pose['Dfull'] - pose['Dlow'], axis=1)
    bvert = np.zeros(len(skinF), bool)
    bvert[np.unique(FQ)] = True
    bvert &= chest(skinF) & (bump > 0.008)
    ft = FQ[bvert[FQ].all(1)]
    if len(ft):
        nF = vertex_normals(skinF, quads_to_tris(FQ))
        vid = np.unique(ft)
        remap = -np.ones(len(skinF), int)
        remap[vid] = np.arange(len(vid))
        V, T = skinF[vid] - nF[vid] * 0.004, remap[quads_to_tris(ft)]
        for sx, sd in ((1, '.l'), (-1, '.r')):
            keepv = np.sign(V[:, 0]) == sx
            tt = T[keepv[T].all(1)]
            vv = np.unique(tt)
            rm = -np.ones(len(V), int)
            rm[vv] = np.arange(len(vv))
            if len(tt):
                Vs, Ts = V[vv].astype(np.float64), rm[tt]
                while len(Vs) < BREAST_VERTS:  # the skin is too coarse; trimesh's subdivide_loop moves open borders wrongly
                    Vs, Ts = trimesh.remesh.subdivide(Vs, Ts)
                m = trimesh.Trimesh(Vs, Ts, process=False)
                trimesh.smoothing.filter_taubin(m)  # rounds the staircase border and the flat facets, without shrinking
                out.append((f'Mammary gland and breast fat{sd}', m.vertices, m.faces))
    return out


def apply(parts, pose):
    """posF for every part (IDW warp by the breast-free anatomy field), male-only and external flags, generated female
    parts appended."""
    used = np.unique(pose['faces'])
    D = anatomy_field(pose)
    male = pose['male'][used]
    for p in parts:
        p.posF = warp_points(p.pos, male, D[used])
        p.sex = 'male' if MALE_ONLY.search(p.name) else 'both'
        p.ext = bool(EXTERNAL.search(p.name))
    bladder = [p for p in parts if p.kind == 'organ' and p.name == 'Urinary bladder']
    if not bladder:
        raise ValueError('Urinary bladder not found: female organs are placed from it')
    nid = max(p.id for p in parts) + 1
    new = []
    for name, V, T in female_parts(bladder[0].posF, pose):
        V = np.asarray(V, np.float32)
        T = outward(V, T)  # SPEC step 2 for the generated parts too: the ellipsoids and tubes come out inside-out
        new.append(Part(id=nid + len(new), name=name, kind='organ', ancestry=[], pos=V, tri=T, posF=V.copy(),
                        nrm=vertex_normals(V, T), sex='female', simplified=True))
    return parts + names.annotate(new)


def skin_part(pose, parts=()):
    """§2b.3 skin part from the posed MakeHuman skins (eye helpers included, as the sample); id = next free id in parts."""
    tri = quads_to_tris(pose['faces'])
    male = np.asarray(pose['male'], np.float32)
    return Part(id=max((p.id for p in parts), default=-1) + 1, name='skin', kind='skin', ancestry=[],
                pos=male, tri=tri, posF=np.asarray(pose['female'], np.float32), nrm=vertex_normals(male, tri),
                ao=np.ones(len(male), np.float32), plain='Skin', side='center', region='Whole body',
                system='Skin', colour=names.colour('skin', 'skin'), sex='both')


def run(ctx):
    ctx['parts'] = apply(ctx['parts'], ctx['pose'])
    ctx['parts'].append(skin_part(ctx['pose'], ctx['parts']))
    return ctx
