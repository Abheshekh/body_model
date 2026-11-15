# Build the two-sex complete-body sample: out2/ (Z-Anatomy, all systems) + mh/fit.npz (MakeHuman skins, warp field)
# -> site/data.gz.b64.* + site/body.json
# ponytail: sample pipeline in one file; R1 splits it into tools/pipeline steps with tests.
import json, re, gzip, base64, time, collections
import numpy as np, trimesh
from scipy.spatial import cKDTree
from trimesh.ray.ray_pyembree import RayMeshIntersector

t0 = time.time()
m = json.load(open('out2/body.json')); raw = open('out2/body.bin', 'rb').read()
names = m['names']
fit = np.load('mh/fit.npz')

# ---------- load + clean groups ----------
G = {}
for k, g in m['groups'].items():
    A = {key: np.frombuffer(raw, np.uint32 if key == 'idx' else np.float32, g[key][1] // 4, g[key][0]).copy() for key in ('pos', 'nrm', 'fib', 'mid', 'idx')}
    pos, nrm, mid, tri = A['pos'].reshape(-1, 3), A['nrm'].reshape(-1, 3), A['mid'].astype(int), A['idx'].reshape(-1, 3)
    keep = np.array([not re.search(r'\.(g|j|t)$', names[x]['name']) for x in mid[tri[:, 0]]], bool) if len(tri) else np.zeros(0, bool)
    tri = tri[keep]
    if not len(tri): continue
    G[k] = dict(pos=pos, nrm=nrm, mid=mid, idx=tri, fib=np.zeros_like(pos), acr=np.zeros(len(pos), np.float32))
print('groups', {k: len(g['idx']) for k, g in G.items()})
# ---------- decimate heavy systems per part ----------
import fast_simplification
def _vn(V, T):
    n = np.zeros_like(V); fn = np.cross(V[T[:, 1]] - V[T[:, 0]], V[T[:, 2]] - V[T[:, 0]])
    for i in range(3): np.add.at(n, T[:, i], fn)
    return n / (np.linalg.norm(n, axis=1, keepdims=True) + 1e-12)
for k, red in (('vessel', 0.78), ('nerve', 0.6)):
    if k not in G: continue
    g = G[k]; P, I, M = [], [], []; off = 0
    tm = g['mid'][g['idx'][:, 0]]
    for i in np.unique(tm):
        tri = g['idx'][tm == i]; vid = np.unique(tri); rm = -np.ones(len(g['pos']), int); rm[vid] = np.arange(len(vid))
        V, T = g['pos'][vid].astype(np.float64), rm[tri]
        if len(T) > 60:
            try: V, T = fast_simplification.simplify(V, T, target_reduction=red)
            except Exception: pass
        P.append(V.astype(np.float32)); I.append(T + off); M.append(np.full(len(V), i)); off += len(V)
    pos = np.concatenate(P); idx = np.concatenate(I).astype(np.uint32)
    G[k] = dict(pos=pos, nrm=_vn(pos, idx).astype(np.float32), mid=np.concatenate(M), idx=idx, fib=np.zeros_like(pos), acr=np.zeros(len(pos), np.float32))
print('after decimation', {k: len(g['idx']) for k, g in G.items()})


# ---------- per part: outward normals, fibre field ----------
for k, g in G.items():
    pos, nrm, mid, tri = g['pos'], g['nrm'], g['mid'], g['idx']
    for i in np.unique(mid[tri[:, 0]]):
        sel = mid == i; p = pos[sel]; c = p.mean(0)
        if len(p) < 4: continue
        if ((nrm[sel] * (p - c)).sum(1)).mean() < 0:
            nrm[sel] *= -1
            t = np.isin(tri[:, 0], np.flatnonzero(sel)); tri[t] = tri[t][:, ::-1]
        if k not in ('muscle', 'tendon'): continue
        w, v = np.linalg.eigh((p - c).T @ (p - c)); ax = v[:, -1]
        t_ = (p - c) @ ax; lo, hi = np.quantile(t_, [0.06, 0.94])
        E0, E1 = p[t_ <= lo], p[t_ >= hi]; e0, e1 = E0.mean(0), E1.mean(0)
        s0 = np.linalg.norm(E0 - e0, axis=1).mean() + 1e-3; s1 = np.linalg.norm(E1 - e1, axis=1).mean() + 1e-3
        d0 = p - e0; d0 /= np.linalg.norm(d0, axis=1, keepdims=True) + 1e-9
        d1 = e1 - p; d1 /= np.linalg.norm(d1, axis=1, keepdims=True) + 1e-9
        d = d0 / s0 + d1 / s1; g['fib'][sel] = d / (np.linalg.norm(d, axis=1, keepdims=True) + 1e-9)
        u2, u3 = v[:, -2], v[:, -3]; flat = w[0] / (w[1] + 1e-12) < 0.12; en = e1 if s1 < s0 else e0
        if flat: r = p - en; th = np.arctan2(r @ u2, np.abs(r @ ax) + 1e-4); R = np.sqrt(w[1] / len(p)) * 2
        else: r = p - c; th = np.arctan2(r @ u3, r @ u2); R = np.sqrt((w[0] + w[1]) / len(p))
        g['acr'][sel] = th * R + (i % 7) * 0.013

# ---------- rectus sheath removal (atlas convention) ----------
gm = G['muscle']
ra = [i for i, n in enumerate(names) if re.match(r'(Rectus abdominis|Pyramidalis)', n['name'])]
cov = [i for i, n in enumerate(names) if re.match(r'(External|Internal) abdominal oblique|Transversus abdominis', n['name'])]
rit = RayMeshIntersector(trimesh.Trimesh(gm['pos'], gm['idx'][np.isin(gm['mid'][gm['idx'][:, 0]], ra)], process=False))
cv = np.flatnonzero(np.isin(gm['mid'], cov)); nn = gm['nrm'][cv] / (np.linalg.norm(gm['nrm'][cv], axis=1, keepdims=True) + 1e-9)
apo = np.zeros(len(gm['pos']), bool)
for sg in (-1, 1):
    o = gm['pos'][cv] + sg * nn * 0.001
    loc, ri, _ = rit.intersects_location(o, sg * nn, multiple_hits=False)
    apo[cv[ri[np.linalg.norm(loc - o[ri], axis=1) < 0.035]]] = True
gm['idx'] = gm['idx'][apo[gm['idx']].sum(1) < 2]

# ---------- sex-specific parts ----------
MALE_ONLY = re.compile(r'^urethra$|penis|testi|scrot|prostat|seminal|epididym|deferens|spermatic|ejaculat|bulbo-?urethral', re.I)
EXTERNAL = re.compile(r'penis|testi|scrot|epididym|pubic hair', re.I)   # hidden while skin is opaque (clinical)
for n in names:
    n['sex'] = 'm' if MALE_ONLY.search(n['name']) else ''
    n['ext'] = 1 if EXTERNAL.search(n['name']) else 0

# ---------- female warp of anatomy ----------
skinM, skinF, Dlow, Dfull, used = fit['male'], fit['female'], fit['Dlow'], fit['Dfull'], fit['used']
ktree = cKDTree(skinM[used])
def warp(P):
    d, j = ktree.query(P, k=10); w = 1 / (d + 0.01) ** 2; w /= w.sum(1, keepdims=True)
    return P + (Dlow[used][j] * w[..., None]).sum(1)
for g in G.values(): g['posF'] = warp(g['pos']).astype(np.float32)

# ---------- skin group ----------
FQ = fit['faces']
skin_tri = np.concatenate([FQ[:, [0, 1, 2]], FQ[:, [0, 2, 3]]])
skin_mid = len(names); names.append({'name': 'Skin', 'kind': 'skin', 'sex': '', 'ext': 0})
def vnormals(V, T):
    n = np.zeros_like(V); fn = np.cross(V[T[:, 1]] - V[T[:, 0]], V[T[:, 2]] - V[T[:, 0]])
    for i in range(3): np.add.at(n, T[:, i], fn)
    return n / (np.linalg.norm(n, axis=1, keepdims=True) + 1e-12)
G['skin'] = dict(pos=skinM.astype(np.float32), posF=skinF.astype(np.float32), idx=skin_tri.astype(np.uint32), nrm=vnormals(skinM.astype(np.float32), skin_tri),
                 mid=np.full(len(skinM), skin_mid), fib=np.zeros_like(skinM), acr=np.zeros(len(skinM), np.float32))

# ---------- female-only parts (simplified, generated) ----------
def add_part(name, V, T, kind='organ'):
    i = len(names); names.append({'name': name, 'kind': kind, 'sex': 'f', 'ext': 0, 'simplified': 1})
    g = G[kind]; base = len(g['pos'])
    for key, val in (('pos', V), ('posF', V), ('nrm', vnormals(V, T)), ('fib', np.zeros_like(V)), ('acr', np.zeros(len(V), np.float32)), ('mid', np.full(len(V), i))):
        g[key] = np.concatenate([g[key], val.astype(g[key].dtype if key != 'mid' else int)])
    g['idx'] = np.concatenate([g['idx'], (T + base).astype(np.uint32)])
def ellipsoid(c, r, R=np.eye(3), nu=28, nv=18, profile=None):
    us, vs = np.meshgrid(np.linspace(0, 2 * np.pi, nu, endpoint=False), np.linspace(0, np.pi, nv))
    k = np.ones_like(vs) if profile is None else profile(vs / np.pi)
    P = np.stack([np.sin(vs) * np.cos(us) * k, np.cos(vs), np.sin(vs) * np.sin(us) * k], -1).reshape(-1, 3) * r
    P = P @ R.T + c; T = []
    for a in range(nv - 1):
        for b in range(nu):
            i0, i1, i2, i3 = a * nu + b, a * nu + (b + 1) % nu, (a + 1) * nu + b, (a + 1) * nu + (b + 1) % nu
            T += [[i0, i2, i1], [i1, i2, i3]]
    return P, np.array(T)
def tube(pts, rad, nu=12):
    pts = np.asarray(pts); P = []; T = []
    for i, p in enumerate(pts):
        t = pts[min(i + 1, len(pts) - 1)] - pts[max(i - 1, 0)]; t /= np.linalg.norm(t)
        a = np.cross(t, [0, 0, 1.0]) if abs(t[2]) < 0.9 else np.cross(t, [1.0, 0, 0]); a /= np.linalg.norm(a); b = np.cross(t, a)
        r = rad(i / (len(pts) - 1)) if callable(rad) else rad
        for j in range(nu): ang = 2 * np.pi * j / nu; P.append(p + r[0] * np.cos(ang) * a + r[1] * np.sin(ang) * b if np.ndim(r) else p + r * (np.cos(ang) * a + np.sin(ang) * b))
    for i in range(len(pts) - 1):
        for j in range(nu):
            i0, i1, i2, i3 = i * nu + j, i * nu + (j + 1) % nu, (i + 1) * nu + j, (i + 1) * nu + (j + 1) % nu
            T += [[i0, i2, i1], [i1, i2, i3]]
    return np.array(P), np.array(T)
def rotx(a): c, s = np.cos(a), np.sin(a); return np.array([[1, 0, 0], [0, c, -s], [0, s, c]])
go = G['organ']
def centre_of(nm):
    i = [k for k, n in enumerate(names) if n['name'] == nm][0]
    return go['posF'][go['mid'] == i].mean(0), go['posF'][go['mid'] == i]
bl_c, bl_p = centre_of('Urinary bladder')
# uterus: pear, ~7.5 x 5 x 3 cm, anteverted over the bladder
ut_c = bl_c + np.array([0, 0.045, -0.035]); Rut = rotx(-0.75)
P, T = ellipsoid(ut_c, np.array([0.025, 0.038, 0.016]), Rut, profile=lambda f: 0.55 + 0.45 * np.sin(np.clip(f, 0, 1) * np.pi * 0.8 + 0.3))
add_part('Uterus (simplified)', P, T)
top = ut_c + Rut @ np.array([0, 0.03, 0]); cervix = ut_c + Rut @ np.array([0, -0.036, 0])
for sx in (1, -1):
    ov = ut_c + np.array([sx * 0.06, 0.012, -0.012])
    P, T = ellipsoid(ov, np.array([0.016, 0.009, 0.011])); add_part(f'Ovary{".l" if sx > 0 else ".r"} (simplified)', P, T)
    P, T = tube(np.array([ (top + (ov - top) * t + np.array([0, 0.022 * np.sin(t * np.pi), 0.006 * np.sin(t * np.pi)])) for t in np.linspace(0.0, 1, 13)]), 0.0028)
    add_part(f'Uterine tube{".l" if sx > 0 else ".r"} (simplified)', P, T)
vag = [cervix + np.array([0, -0.08 * t, 0.025 * t]) for t in np.linspace(0, 1, 10)]
P, T = tube(vag, (0.014, 0.006)); add_part('Vagina (simplified)', P, T)
# breast: mammary gland + fat = female skin bump over the chest, offset inward
bump = np.linalg.norm(Dfull - Dlow, axis=1)
chest = (skinF[:, 1] > 1.05) & (skinF[:, 1] < 1.45) & (skinF[:, 2] > 0.02)
bvert = np.zeros(len(skinF), bool); bvert[used] = True; bvert &= chest & (bump > 0.008)
ft = FQ[bvert[FQ].all(1)]
if len(ft):
    nF = vnormals(skinF, skin_tri)
    vid = np.unique(ft); remap = -np.ones(len(skinF), int); remap[vid] = np.arange(len(vid))
    V = skinF[vid] - nF[vid] * 0.004; T = remap[np.concatenate([ft[:, [0, 1, 2]], ft[:, [0, 2, 3]]])]
    for sx, side in ((1, '.l'), (-1, '.r')):
        keepv = np.sign(V[:, 0]) == sx; tt = T[keepv[T].all(1)]; vv = np.unique(tt); rm = -np.ones(len(V), int); rm[vv] = np.arange(len(vv))
        add_part(f'Mammary gland and breast fat{side}', V[vv], rm[tt])
print('female parts added', time.time() - t0)

# ---------- layer peeling (muscle + tendon, male) ----------
soft = ['muscle', 'tendon']
SP = np.concatenate([G[k]['pos'] for k in soft]); SN = np.concatenate([G[k]['nrm'] for k in soft]); SM = np.concatenate([G[k]['mid'] for k in soft])
off = 0; ST = []
for k in soft: ST.append(G[k]['idx'] + off); off += len(G[k]['pos'])
ST = np.concatenate(ST); TM = SM[ST[:, 0]]; SN = SN / (np.linalg.norm(SN, axis=1, keepdims=True) + 1e-9)
layer = {}; remaining = set(np.unique(TM).tolist()); r = 0
while remaining and r < 6:
    r += 1
    tsel = np.isin(TM, list(remaining)); sub = ST[tsel]; submid = TM[tsel]
    BP = np.concatenate([SP, G['bone']['pos']]); BT = np.concatenate([sub, G['bone']['idx'] + len(SP)])
    btm = np.concatenate([submid, np.full(len(G['bone']['idx']), -1)])
    it = RayMeshIntersector(trimesh.Trimesh(BP, BT, process=False))
    vsel = np.flatnonzero(np.isin(SM, list(remaining))); org = SP[vsel] + SN[vsel] * 0.002
    loc, ri, ti = it.intersects_location(org, SN[vsel], multiple_hits=False)
    covered = np.zeros(len(vsel), bool); covered[ri] = (np.linalg.norm(loc - org[ri], axis=1) < 0.5) & (btm[ti] != SM[vsel][ri])
    exp = {x: 1 - covered[SM[vsel] == x].mean() for x in remaining}
    outer = [x for x in remaining if exp[x] >= 0.16] if r < 6 else list(remaining)
    if not outer: outer = sorted(remaining, key=lambda x: -exp[x])[: max(1, len(remaining) // 3)]
    for x in outer: layer[x] = r
    remaining -= set(outer)
print('layers', collections.Counter(layer.values()), time.time() - t0)

# ---------- AO (male shape, reused for female) ----------
allk = list(G)
# skin excluded as an occluder; build with offsets for the non-skin groups only
off = 0; F2 = []; P2 = []
for k in allk:
    if k == 'skin': continue
    F2.append(G[k]['idx'] + off); P2.append(G[k]['pos']); off += len(G[k]['pos'])
rt = RayMeshIntersector(trimesh.Trimesh(np.concatenate(P2), np.concatenate(F2), process=False))
rng = np.random.default_rng(1); S = 24
dirs = rng.normal(size=(S, 3)); dirs /= np.linalg.norm(dirs, axis=1, keepdims=True)
for k in allk:
    p, n = G[k]['pos'], G[k]['nrm']; n = n / (np.linalg.norm(n, axis=1, keepdims=True) + 1e-9)
    if k == 'skin': G[k]['ao'] = np.ones(len(p), np.float32); continue
    occ = np.zeros(len(p), np.float32); ws = np.zeros(len(p), np.float32)
    for s in range(S):
        dd = np.where((n @ dirs[s])[:, None] < 0, -dirs[s], dirs[s]); o = p + n * 0.002
        loc, ri, _ = rt.intersects_location(o, np.ascontiguousarray(np.broadcast_to(dd, o.shape)), multiple_hits=False)
        dist = np.full(len(p), np.inf); dist[ri] = np.linalg.norm(loc - o[ri], axis=1)
        w = np.clip((n * dd).sum(1), 0, 1); ws += w; occ += w * np.clip(1 - dist / 0.05, 0, 1)
    G[k]['ao'] = np.clip(1 - occ / (ws + 1e-6) * 1.3, 0.12, 1).astype(np.float32)
print('ao done', time.time() - t0)

# ---------- names: region / system / colour ----------
REG = [('Head', 'Head'), ('Neck', 'Neck'), ('hand', 'Hand'), ('upper limb', 'Arm'), ('foot', 'Foot'), ('lower limb', 'Leg'),
       ('Back', 'Back'), ('Thorax', 'Chest'), ('Abdomen', 'Abdomen'), ('Perineum', 'Pelvis'), ('Pelvi', 'Pelvis')]
SYS = [('Heart', 'Heart'), ('Arter', 'Arteries'), ('Vein', 'Veins'), ('Digestive', 'Digestive'), ('Respiratory', 'Respiratory'),
       ('Urinary', 'Urinary'), ('Genital', 'Reproductive'), ('Endocrine', 'Endocrine'), ('Central nervous', 'Brain and spinal cord'),
       ('Peripheral nervous', 'Nerves'), ('Sense organ', 'Sense organs'), ('Lymph', 'Lymphatic'), ('Ligament', 'Ligaments'),
       ('Cartilag', 'Cartilage'), ('Intervertebral', 'Cartilage')]
def colour(n):
    nm = n['name'].lower(); k = n['kind']
    if k == 'muscle': return '#7a1c22'
    if k == 'tendon': return '#e6d8c4'
    if k == 'bone': return '#e2d6c1'
    if k == 'skin': return '#b8876a'
    if k == 'vessel': return '#3a5aa8' if 'vein' in nm or 'sinus' in nm else '#a8262c' if not re.search('atrium|ventric|papillary|leaflet|valve|cusp|chorda', nm) else '#8c2f2c'
    if k == 'nerve':
        if re.search('eye|lens|cornea|retina|scler|iris', nm): return '#e8e4dc'
        if re.search('brain|cortex|lobe|gyrus|cerebel|thalam|midbrain|pons|medulla|hemisphere|nucleus|ventric|spinal cord|cerebr|hippoc|amygd|putamen|caudate|corpus|fornix|insula|cingul', nm): return '#dbb4a7'
        return '#e8cf6e'
    if k == 'lymph': return '#86b46f'
    if k == 'joint': return '#c8d6dc'
    if re.search('liver|segment of liver', nm): return '#6b2721'
    if re.search('lung|lobe of', nm): return '#c9958f'
    if re.search('kidney|renal', nm): return '#7c2e2e'
    if 'spleen' in nm: return '#5b2235'
    if 'pancrea' in nm: return '#d6ae7a'
    if re.search('gallbladder|bile', nm): return '#4f7a3a'
    if re.search('stomach|duoden|jejun|ile|colon|cecum|caecum|append|rectum|oesoph|esoph|taenia', nm): return '#c98676'
    if re.search('bladder|ureter|urethra', nm): return '#d8a487'
    if re.search('thyroid|thymus|adrenal|supraren|gland', nm): return '#b9735a'
    if re.search('mammary', nm): return '#e7c79a'
    if re.search('uter|ovar|vagin|tube', nm): return '#c97a86'
    if re.search('penis|testi|epididym|prostat|seminal|scrot|glans', nm): return '#b9707a'
    if re.search('tooth|incisor|canine|molar|premolar', nm): return '#efe8da'
    if re.search('tongue|gingiva|palat|uvula', nm): return '#c06a6a'
    return '#b87d73'
cen_y = {}
for g in G.values():
    for i in np.unique(g['mid']): cen_y[int(i)] = float(g['pos'][g['mid'] == i][:, 1].mean())
for i, n in enumerate(names):
    cols = ' | '.join(n.get('cols', []))
    reg = next((v for kk, v in REG if kk.lower() in cols.lower()), None)
    nm = n['name'].lower()
    if reg is None:
        reg = ('Chest' if re.search(r'pector|serratus anterior|intercost|subclavius|diaphragm|transversus thoracis|costarum|heart|lung|mammary', nm) else
               'Pelvis' if re.search(r'coccyg|anal|levator ani|pubo|iliopectineal|uter|ovar|vagin|bladder|prostat|penis|testi', nm) else
               'Back' if re.search(r'teres|interspinales', nm) else 'Abdomen' if n.get('kind') == 'organ' else 'Other')
    if n.get('kind') in ('organ', 'vessel', 'nerve', 'lymph') and i < len(names):
        cy = cen_y.get(i)
        if cy is not None and reg in ('Abdomen', 'Other', 'Chest', 'Pelvis'):
            reg = 'Head' if cy > 1.5 else 'Neck' if cy > 1.38 else 'Chest' if cy > 1.08 else 'Abdomen' if cy > 0.86 else 'Pelvis'
    n['region'] = reg
    n['system'] = next((v for kk, v in SYS if kk.lower() in cols.lower()), {'organ': 'Organs', 'vessel': 'Heart and vessels', 'nerve': 'Nervous system',
                   'lymph': 'Lymphatic', 'joint': 'Joints', 'muscle': 'Muscles', 'tendon': 'Muscles', 'bone': 'Skeleton', 'skin': 'Skin'}.get(n.get('kind'), 'Other'))
    if re.search('uter|ovar|vagin|mammary', nm): n['system'] = 'Reproductive'
    n['side'] = 'left' if re.search(r'\.l( \(simplified\))?$', n['name']) else 'right' if re.search(r'\.r( \(simplified\))?$', n['name']) else ''
    n['base'] = re.sub(r'\.[lr](?= \(simplified\)|$)', '', n['name'])
    n['layer'] = layer.get(i, 0)
    if re.match(r'(Rectus abdominis|Pyramidalis)', n['name']): n['layer'] = 1
    n['colour'] = colour(n)
    n.pop('cols', None)

# ---------- pack (quantised) ----------
blob = bytearray(); meta = {'names': names, 'groups': {}}
def put(arr):
    while len(blob) % 4: blob.append(0)
    o = len(blob); blob.extend(arr.tobytes()); return [o, arr.nbytes]
allP = np.concatenate([np.concatenate([g['pos'], g['posF']]) for g in G.values()]); lo, hi = allP.min(0) - 0.01, allP.max(0) + 0.01
meta['box'] = [lo.tolist(), hi.tolist()]
q16 = lambda P: np.round((P - lo) / (hi - lo) * 65535).astype(np.uint16)
q8 = lambda N: np.round(np.clip(N / (np.linalg.norm(N, axis=1, keepdims=True) + 1e-9), -1, 1) * 127).astype(np.int8)
for k, g in G.items():
    tm = g['mid'][g['idx'][:, 0]]
    order = np.argsort(tm, kind='stable'); g['idx'] = g['idx'][order]; tm = tm[order]
    nF = vnormals(g['posF'], g['idx']) if k != 'skin' else vnormals(g['posF'], g['idx'])
    nM = g['nrm'] if k != 'skin' else vnormals(g['pos'], g['idx'])
    mg = {'tris': int(len(g['idx'])), 'verts': int(len(g['pos']))}
    mg['idx'] = put(g['idx'].astype(np.uint32)); mg['posM'] = put(q16(g['pos'])); mg['posF'] = put(q16(g['posF']))
    mg['nrmM'] = put(q8(nM)); mg['nrmF'] = put(q8(nF)); mg['fib'] = put(q8(g['fib'] + 1e-9))
    mg['acr'] = put(np.clip(np.round(g['acr'] * 8000), -32767, 32767).astype(np.int16))
    mg['mid'] = put(g['mid'].astype(np.uint16)); mg['ao'] = put(np.round(g['ao'] * 255).astype(np.uint8))
    meta['groups'][k] = mg
    print(k, 'tris', mg['tris'], 'verts', mg['verts'])
z = gzip.compress(bytes(blob), 6); b = base64.b64encode(z).decode()
n = max(1, -(-len(b) // 15_000_000)); L = -(-len(b) // n); L += (4 - L % 4) % 4
import os, glob
for f in glob.glob('site/data*.txt') + glob.glob('site/body*.txt'): os.remove(f)
for i in range(n): open(f'site/data{i}.txt', 'w').write(b[i * L:(i + 1) * L])
meta['chunks'] = n
json.dump(meta, open('site/body.json', 'w'), separators=(',', ':'))
print('raw MB', round(len(blob) / 1e6, 1), 'gz MB', round(len(z) / 1e6, 1), 'chunks', n, 'parts', len(names), round(time.time() - t0), 's')
