# out/ -> site/: drop label meshes, fix inward normals, per-vertex fibre field, bake vertex AO.
import json, re, numpy as np, time
import trimesh
from trimesh.ray.ray_pyembree import RayMeshIntersector

m = json.load(open('out/body.json')); raw = open('out/body.bin', 'rb').read()
bad = {i for i, n in enumerate(m['names']) if n['name'].endswith('.g')}
G = {}
for k, g in m['groups'].items():
    A = {key: np.frombuffer(raw, np.uint32 if key == 'idx' else np.float32, g[key][1] // 4, g[key][0]).copy() for key in ('pos', 'nrm', 'fib', 'mid', 'idx')}
    pos, nrm, mid, tri = A['pos'].reshape(-1, 3), A['nrm'].reshape(-1, 3), A['mid'].astype(int), A['idx'].reshape(-1, 3)
    tri = tri[~np.isin(mid[tri[:, 0]], list(bad))]
    fib = np.zeros_like(pos); acr = np.zeros(len(pos), np.float32)
    for i in np.unique(mid[tri[:, 0]]):
        sel = mid == i; p = pos[sel]; c = p.mean(0)
        # outward normals: flip part if normals point mostly inward
        if ((nrm[sel] * (p - c)).sum(1)).mean() < 0:
            nrm[sel] *= -1
            t = np.isin(tri[:, 0], np.flatnonzero(sel)); tri[t] = tri[t][:, ::-1]
        # fibre field: fibres run between the two ends; the narrower end (tendon) dominates, so fans radiate
        w, v = np.linalg.eigh((p - c).T @ (p - c)); ax = v[:, -1]
        t_ = (p - c) @ ax; lo, hi = np.quantile(t_, [0.06, 0.94])
        E0, E1 = p[t_ <= lo], p[t_ >= hi]
        e0, e1 = E0.mean(0), E1.mean(0)
        s0, s1 = np.linalg.norm(E0 - e0, axis=1).mean() + 1e-3, np.linalg.norm(E1 - e1, axis=1).mean() + 1e-3
        d0 = p - e0; d0 /= np.linalg.norm(d0, axis=1, keepdims=True) + 1e-9
        d1 = e1 - p; d1 /= np.linalg.norm(d1, axis=1, keepdims=True) + 1e-9
        d = d0 / s0 + d1 / s1
        d /= np.linalg.norm(d, axis=1, keepdims=True) + 1e-9
        fib[sel] = d
        # across-fibre coordinate (metres): constant along a fibre.
        u2, u3 = v[:, -2], v[:, -3]; flat = w[0] / (w[1] + 1e-12) < 0.12
        en = e1 if s1 < s0 else e0                     # narrow (tendon) end
        if flat:   # fan / sheet: angle around the tendon end, in the sheet plane
            r = p - en; th = np.arctan2(r @ u2, np.abs(r @ ax) + 1e-4); R = np.sqrt(w[1] / len(p)) * 2
        else:      # spindle: angle around the long axis; fibres converge as radius shrinks
            r = p - c; th = np.arctan2(r @ u3, r @ u2); R = np.sqrt((w[0] + w[1]) / len(p))
        acr[sel] = th * R + (i % 7) * 0.013
    G[k] = dict(acr=acr,pos=pos.astype(np.float32), nrm=nrm.astype(np.float32), fib=fib.astype(np.float32), mid=mid.astype(np.float32), idx=tri.astype(np.uint32))

# remove the aponeurotic front of the obliques / transversus that covers rectus abdominis (sheath removed, as in atlases)
gm = G['muscle']; nm = m['names']
ra = [i for i, n in enumerate(nm) if n['name'].startswith('Rectus abdominis') or n['name'].startswith('Pyramidalis')]
cov = [i for i, n in enumerate(nm) if re.match(r'(External|Internal) abdominal oblique|Transversus abdominis', n['name'])]
rsel = np.isin(gm['mid'][gm['idx'][:, 0]].astype(int), ra)
rit = RayMeshIntersector(trimesh.Trimesh(gm['pos'], gm['idx'][rsel], process=False))
cv = np.flatnonzero(np.isin(gm['mid'].astype(int), cov))
nn = gm['nrm'][cv] / (np.linalg.norm(gm['nrm'][cv], axis=1, keepdims=True) + 1e-9)
apo = np.zeros(len(gm['pos']), bool)
for sgn in (-1, 1):   # sheet: either face may point at the muscle
    o = gm['pos'][cv] + sgn * nn * 0.001
    loc, ri, _ = rit.intersects_location(o, sgn * nn, multiple_hits=False)
    near = np.linalg.norm(loc - o[ri], axis=1) < 0.035
    apo[cv[ri[near]]] = True
drop = apo[gm['idx']].sum(1) >= 2
gm['idx'] = gm['idx'][~drop]
print('sheath tris removed', int(drop.sum()))

# AO over the whole body
off, F = 0, []
for k in G: F.append(G[k]['idx'] + off); off += len(G[k]['pos'])
rt = RayMeshIntersector(trimesh.Trimesh(np.concatenate([G[k]['pos'] for k in G]), np.concatenate(F), process=False))
rng = np.random.default_rng(1); S = 32
dirs = rng.normal(size=(S, 3)); dirs /= np.linalg.norm(dirs, axis=1, keepdims=True)
t0 = time.time()
for k in G:
    p, n = G[k]['pos'], G[k]['nrm']; n = n / (np.linalg.norm(n, axis=1, keepdims=True) + 1e-9)
    occ = np.zeros(len(p), np.float32); wsum = np.zeros(len(p), np.float32)
    for s in range(S):
        dd = np.where((n @ dirs[s])[:, None] < 0, -dirs[s], dirs[s]); org = p + n * 0.002
        loc, ri, _ = rt.intersects_location(org, np.ascontiguousarray(np.broadcast_to(dd, org.shape)), multiple_hits=False)
        dist = np.full(len(p), np.inf); dist[ri] = np.linalg.norm(loc - org[ri], axis=1)
        w = np.clip((n * dd).sum(1), 0, 1); wsum += w
        occ += w * np.clip(1 - dist / 0.05, 0, 1)
    G[k]['ao'] = np.clip(1 - occ / (wsum + 1e-6) * 1.3, 0.12, 1).astype(np.float32)
    print(k, round(time.time() - t0, 1), 's ao mean', G[k]['ao'].mean().round(3))


# ---- depth layers by peeling: outermost soft-tissue parts first ----
soft = [k for k in ('muscle', 'tendon') if k in G]
SP = np.concatenate([G[k]['pos'] for k in soft]); SN = np.concatenate([G[k]['nrm'] for k in soft])
SM = np.concatenate([G[k]['mid'] for k in soft]).astype(int)
off = 0; ST = []
for k in soft: ST.append(G[k]['idx'] + off); off += len(G[k]['pos'])
ST = np.concatenate(ST); TM = SM[ST[:, 0]]
SN = SN / (np.linalg.norm(SN, axis=1, keepdims=True) + 1e-9)
layer = {}; remaining = set(np.unique(TM).tolist()); r = 0
while remaining and r < 6:
    r += 1
    tsel = np.isin(TM, list(remaining)); sub = ST[tsel]; submid = TM[tsel]
    BP = np.concatenate([SP, G['bone']['pos']]); BT = np.concatenate([sub, G['bone']['idx'] + len(SP)])
    btm = np.concatenate([submid, np.full(len(G['bone']['idx']), -1)])
    it = RayMeshIntersector(trimesh.Trimesh(BP, BT, process=False))
    vsel = np.flatnonzero(np.isin(SM, list(remaining)))
    org = SP[vsel] + SN[vsel] * 0.002
    loc, ri, ti = it.intersects_location(org, SN[vsel], multiple_hits=False)
    covered = np.zeros(len(vsel), bool)
    d = np.linalg.norm(loc - org[ri], axis=1)
    covered[ri] = (d < 0.5) & (btm[ti] != SM[vsel][ri])   # escaped = nothing outside this vertex
    exp = {}
    for mid_ in remaining:
        msk = SM[vsel] == mid_
        exp[mid_] = 1 - covered[msk].mean() if msk.any() else 1
    outer = [x for x in remaining if exp[x] >= 0.16] if r < 6 else list(remaining)
    if not outer:
        outer = sorted(remaining, key=lambda x: -exp[x])[: max(1, len(remaining) // 3)]
    for x in outer: layer[x] = r
    remaining -= set(outer)
    print('layer', r, len(outer), 'left', len(remaining))

REG = [('Head', 'Head'), ('Neck', 'Neck'), ('hand', 'Hand'), ('upper limb', 'Arm'), ('foot', 'Foot'), ('lower limb', 'Leg'),
       ('Back', 'Back'), ('Thorax', 'Chest'), ('Abdomen', 'Abdomen'), ('Perineum', 'Pelvis'), ('Pelvi', 'Pelvis')]
for i, n in enumerate(m['names']):
    cols = ' | '.join(n.get('cols', []))
    reg = next((v for kk, v in REG if kk.lower() in cols.lower()), None)
    if reg is None or reg == 'Other':
        nm = n['name'].lower()
        reg = ('Chest' if re.search(r'pector|serratus anterior|intercost|subclavius|diaphragm|transversus thoracis|costarum', nm) else
               'Pelvis' if re.search(r'coccyg|anal|levator ani|pubo|iliopectineal', nm) else
               'Back' if re.search(r'teres|interspinales', nm) else 'Other')
    n['region'] = reg
    n['side'] = 'left' if n['name'].endswith('.l') else 'right' if n['name'].endswith('.r') else ''
    n['base'] = n['name'][:-2] if n['side'] else n['name']
    n['layer'] = layer.get(i, 0 if n['kind'] == 'bone' else 9)
    if n['name'].endswith('.g'): n['kind'] = 'label'
    if re.match(r'(Rectus abdominis|Pyramidalis)', n['name']): n['layer'] = 1   # reviewed: superficial once sheath removed
    n.pop('cols', None)
import collections
print(collections.Counter((n['kind'], n['layer']) for n in m['names']))
print(collections.Counter(n['region'] for n in m['names']))
blob = bytearray(); meta = {'names': m['names'], 'groups': {}}
for k, g in G.items():
    tm = g['mid'][g['idx'][:, 0]].astype(int); starts = np.r_[0, np.flatnonzero(np.diff(tm)) + 1]
    mg = {'tris': len(g['idx']), 'parts': [[int(tm[s]), int(s), int(e - s)] for s, e in zip(starts, np.r_[starts[1:], len(tm)])]}
    for key in ('pos', 'nrm', 'fib', 'mid', 'ao', 'acr', 'idx'):
        mg[key] = [len(blob), g[key].nbytes]; blob += g[key].tobytes()
    meta['groups'][k] = mg; print(k, 'tris', mg['tris'])
open('site/body.bin', 'wb').write(blob); json.dump(meta, open('site/body.json', 'w'))
print('MB', round(len(blob) / 1e6, 1))
