# Pose MakeHuman male + female to Z-Anatomy's stance, register male skin onto the anatomy,
# derive the female skin from the male fit, and build the male->female warp field.
# ponytail: sample-grade fitter (LBS + nearest-point pulls + Laplacian smoothing); R1 hardens it.
import json, numpy as np
from scipy.spatial import cKDTree
D = '/tmp/src/mpfb/src/mpfb/data/'
mh = np.load('mh/mh.npz'); FQ = mh['faces']
rig = json.load(open(D + 'rigs/standard/rig.game_engine.json'))
W = json.load(open(D + 'rigs/standard/weights.game_engine.json'))['weights']
groups = {k: np.concatenate([np.arange(a, b + 1) for a, b in v]) for k, v in json.load(open(D + 'mesh_metadata/basemesh_vertex_groups.json')).items() if v}

# ---------- anatomy landmarks ----------
meta = json.load(open('out2/body.json')); raw = open('out2/body.bin', 'rb').read()
def grp(k):
    g = meta['groups'][k]
    f = lambda key, t=np.float32: np.frombuffer(raw, t, g[key][1] // np.dtype(t).itemsize, g[key][0])
    return f('pos').reshape(-1, 3), f('nrm').reshape(-1, 3), f('mid').astype(int), f('idx', np.uint32).reshape(-1, 3)
BP, _, BM, _ = grp('bone')
names = [n['name'] for n in meta['names']]
def part(nm):
    i = names.index(nm); return BP[BM == i]
def end(p, top, frac=0.05):
    y = p[:, 1]; q = np.quantile(y, 1 - frac if top else frac)
    return p[y >= q].mean(0) if top else p[y <= q].mean(0)
ZA = {}
for s, sx in (('l', 'l'), ('r', 'r')):
    hu, ra, fe, ti = part(f'Humerus.{s}'), part(f'Radius.{s}'), part(f'Femur.{s}'), part(f'Tibia.{s}')
    ZA[f'shoulder_{sx}'] = end(hu, True); ZA[f'elbow_{sx}'] = end(hu, False); ZA[f'wrist_{sx}'] = end(ra, False)
    ZA[f'hip_{sx}'] = end(fe, True, 0.08); ZA[f'knee_{sx}'] = end(fe, False); ZA[f'ankle_{sx}'] = end(ti, False)
ZA['L4'] = part('Vertebra L4').mean(0); ZA['C7'] = part('Vertebra C7').mean(0); ZA['C1'] = part('Atlas (C1)').mean(0)
pr = np.concatenate([part('Parietal bone.l'), part('Parietal bone.r')]); ZA['vertex'] = pr[np.argmax(pr[:, 1])]
print('ZA shoulder l', ZA['shoulder_l'].round(3), 'r', ZA['shoulder_r'].round(3))

# ---------- MakeHuman rig ----------
def joints(V):
    def pos(spec):
        if spec.get('strategy') == 'CUBE': return V[groups[spec['cube_name']]].mean(0)
        if spec.get('strategy') == 'MEAN': return V[spec['vertex_indices']].mean(0)
        if spec.get('strategy') == 'VERTEX': return V[spec['vertex_index']]
        return np.array(spec['default_position'])
    return {b: (pos(d['head']), pos(d['tail'])) for b, d in rig.items()}
def children(b):
    out = [b]
    for c, d in rig.items():
        if d['parent'] == b: out += children(c)
    return out
def rot_between(a, b):
    a = a / np.linalg.norm(a); b = b / np.linalg.norm(b); v = np.cross(a, b); c = a @ b
    if np.linalg.norm(v) < 1e-8: return np.eye(3)
    K = np.array([[0, -v[2], v[1]], [v[2], 0, -v[0]], [-v[1], v[0], 0]])
    return np.eye(3) + K + K @ K * (1 / (1 + c))

nV = len(mh['male'])
WM = {}  # bone -> (idx, w)
tot = np.zeros(nV)
for b, lst in W.items():
    if not lst: continue
    a = np.array(lst); idx = a[:, 0].astype(int); w = a[:, 1]; WM[b] = (idx, w); np.add.at(tot, idx, w)

def pose(V, scale, offset):
    V = V * scale + offset
    J = joints(V)
    T = {b: (np.eye(3), np.zeros(3)) for b in rig}          # world transform per bone: x -> R x + t
    def apply(T0, R, pivot):  # compose rotation about pivot after T0
        R0, t0 = T0; return (R @ R0, R @ (t0 - pivot) + pivot)
    def tf(T0, p): return T0[0] @ p + T0[1]
    # spine, neck, head first (children inherit), then limbs
    for b, nxt, a0, a1 in (('spine_01', 'neck_01', 'L4', 'C7'), ('neck_01', 'head', 'C7', 'C1')):
        p0, p1 = tf(T[b], J[b][0]), tf(T[nxt], J[nxt][0])
        R = rot_between(p1 - p0, ZA[a1] - ZA[a0])
        for c in children(b): T[c] = apply(T[c], R, p0)
    h0 = tf(T['head'], J['head'][0]); h1 = tf(T['head'], J['head'][1])
    R = rot_between(h1 - h0, ZA['vertex'] - ZA['C1'])
    for c in children('head'): T[c] = apply(T[c], R, h0)
    chains = [('upperarm', 'lowerarm', 'shoulder', 'elbow', 'wrist'), ('thigh', 'calf', 'hip', 'knee', 'ankle')]
    for sx in ('l', 'r'):
        for b1, b2, j0, j1, j2 in chains:
            u, l = f'{b1}_{sx}', f'{b2}_{sx}'
            p0, p1 = tf(T[u], J[u][0]), tf(T[u], J[u][1])
            R1 = rot_between(p1 - p0, ZA[f'{j1}_{sx}'] - ZA[f'{j0}_{sx}'])
            for c in children(u): T[c] = apply(T[c], R1, p0)
            q0, q1 = tf(T[l], J[l][0]), tf(T[l], J[l][1])
            R2 = rot_between(q1 - q0, ZA[f'{j2}_{sx}'] - ZA[f'{j1}_{sx}'])
            for c in children(l): T[c] = apply(T[c], R2, q0)
    out = np.zeros_like(V); acc = np.zeros(nV)
    for b, (idx, w) in WM.items():
        R, t = T[b]; out[idx] += w[:, None] * (V[idx] @ R.T + t); acc[idx] += w
    free = acc < 1e-6; out[~free] /= acc[~free, None]; out[free] = V[free]
    return out, J

# global placement: scale male to anatomy height, hips centred on anatomy hips
used = np.unique(FQ)
za_hip = (ZA['hip_l'] + ZA['hip_r']) / 2
s = 1.705 / ((mh['male'][used, 1].max() - mh['male'][used, 1].min()) * 0.1)
def place(V):
    Vs = V * 0.1 * s
    Jh = joints(Vs); hip = (Jh['thigh_l'][0] + Jh['thigh_r'][0]) / 2
    off = np.array([za_hip[0] - hip[0], -Vs[used, 1].min(), za_hip[2] - hip[2]])
    return off
Mp, _ = pose(mh['male'], 0.1 * s, place(mh['male']))
Fp, _ = pose(mh['female'], 0.1 * s, place(mh['female']))
print('male height', round(float(np.ptp(Mp[used, 1])), 3), 'female', round(float(np.ptp(Fp[used, 1])), 3))

# ---------- register male skin onto the anatomy's outer surface ----------
soft = []
for k in ('muscle', 'tendon'):
    P, N, M, _ = grp(k)
    soft.append(P[[not meta['names'][i]['name'].endswith('.g') for i in M]])
tgt = np.concatenate(soft + [BP]); tree = cKDTree(tgt)
# mesh adjacency for smoothing
nbr = [[] for _ in range(nV)]
for q in FQ:
    for i in range(4):
        a, b = q[i], q[(i + 1) % 4]; nbr[a].append(b); nbr[b].append(a)
nbr = [np.unique(n) if n else np.array([i]) for i, n in enumerate(nbr)]
deg = np.array([len(n) for n in nbr]); flat = np.concatenate(nbr); rows = np.repeat(np.arange(nV), deg)
def smooth(X, it):
    for _ in range(it):
        S = np.zeros_like(X); np.add.at(S, rows, X[flat]); X = 0.5 * X + 0.5 * S / deg[:, None]
    return X
def normals(V):
    n = np.zeros_like(V)
    for a, b, c, d in ((0, 1, 2, 3),):
        pass
    e1 = V[FQ[:, 2]] - V[FQ[:, 0]]; e2 = V[FQ[:, 3]] - V[FQ[:, 1]]; fn = np.cross(e1, e2)
    for i in range(4): np.add.at(n, FQ[:, i], fn)
    return n / (np.linalg.norm(n, axis=1, keepdims=True) + 1e-12)
X = Mp.copy(); body = np.zeros(nV, bool); body[used] = True
# pull strength per region from the rig weights: face, hands and feet keep their MakeHuman shape
def bone_w(prefixes):
    w = np.zeros(nV)
    for b, (idx, ww) in WM.items():
        if any(b.startswith(p) for p in prefixes): np.add.at(w, idx, ww)
    return np.clip(w, 0, 1)
soft_w = 1 - 0.75 * bone_w(('head', 'neck')) - 0.8 * bone_w(('hand', 'thumb', 'index', 'middle', 'ring', 'pinky', 'foot', 'ball'))
soft_w = np.clip(smooth(soft_w[:, None], 10)[:, 0], 0.15, 1)
GAP = 0.005   # skin + thin fat over muscle, metres (start value)
def contain(X, tree, tgt, rounds=6):
    for r in range(rounds):
        n = normals(X); d, j = tree.query(X)
        sd = ((X - tgt[j]) * n).sum(1)
        bad = body & (sd < GAP)
        X[bad] += n[bad] * (GAP - sd[bad])[:, None]
        if r < rounds - 1: X = X + (smooth(X, 1) - X) * 0.25
    return X
d, _ = tree.query(Mp[body]); print('male skin to anatomy: median gap mm', round(float(np.median(d)) * 1000, 1), 'p95', round(float(np.quantile(d, .95)) * 1000, 1))
male_skin = Mp.copy()   # skin keeps MakeHuman's shape; opaque skin hides the anatomy, so no pull-fit is needed
Dfull = Fp - Mp
Dsm = smooth(Dfull.copy(), 8); Dbig = smooth(Dfull.copy(), 60)
chest = (Mp[:, 1] > 1.05) & (Mp[:, 1] < 1.45) & (Mp[:, 2] > -0.01)
breast = chest & (np.linalg.norm(Dfull - Dbig, axis=1) > 0.006)
bw = smooth(breast[:, None].astype(float), 6)[:, 0]
Dw = Dsm * (1 - bw[:, None]) + Dbig * bw[:, None]      # anatomy warp: limb-level detail, no breast bump
female_skin = Fp.copy()
ktree = cKDTree(male_skin[used])
def warp(P):
    d, j = ktree.query(P, k=10); w = 1 / (d + 0.01) ** 2; w /= w.sum(1, keepdims=True)
    return P + (Dw[used][j] * w[..., None]).sum(1)
Dlow = Dw
np.savez('mh/fit.npz', male=male_skin.astype(np.float32), female=female_skin.astype(np.float32), Dfull=Dfull.astype(np.float32),
         Dlow=Dlow.astype(np.float32), faces=FQ, used=used, ZA=json.dumps({k: v.tolist() for k, v in ZA.items()}))
print('female height', round(float(np.ptp(female_skin[used, 1])), 3), 'breast verts', int(breast.sum()))
