# MakeHuman (CC0) male + female skin from base mesh + ethnic targets (equal blend).
import gzip, json, numpy as np
D = '/tmp/src/mpfb/src/mpfb/data/'
V, VT, F, FT, grp = [], [], [], [], None; FG = []
for line in open(D + '3dobjs/base.obj'):
    t = line.split()
    if not t: continue
    if t[0] == 'v': V.append([float(x) for x in t[1:4]])
    elif t[0] == 'vt': VT.append([float(x) for x in t[1:3]])
    elif t[0] == 'g': grp = t[1]
    elif t[0] == 'f':
        ids = [x.split('/') for x in t[1:]]
        F.append([int(a[0]) - 1 for a in ids]); FT.append([int(a[1]) - 1 if len(a) > 1 and a[1] else -1 for a in ids]); FG.append(grp)
V = np.array(V, np.float32)
def target(name):
    d = np.zeros_like(V)
    for line in gzip.open(D + f'targets/macrodetails/{name}.target.gz', 'rt'):
        if line.startswith('#') or not line.strip(): continue
        i, x, y, z = line.split(); d[int(i)] = (float(x), float(y), float(z))
    return d
out = {}
for sex in ('male', 'female'):
    out[sex] = V + sum(target(f'{r}-{sex}-young') for r in ('african', 'asian', 'caucasian')) / 3
body = [i for i, g in enumerate(FG) if g in ('body', 'helper-l-eye', 'helper-r-eye')]
quads = np.array([F[i] for i in body]); print('faces', len(body), 'all quads', all(len(F[i]) == 4 for i in body))
np.savez('mh/mh.npz', male=out['male'], female=out['female'], faces=quads, uv=np.array(VT, np.float32), fuv=np.array([FT[i] for i in body]))
for sex, P in out.items():
    used = np.unique(quads); p = P[used]
    print(sex, 'height', round(float(p[:, 1].max() - p[:, 1].min()), 3), 'min', p.min(0).round(2), 'max', p.max(0).round(2))
    # arm angle: hand tip vs shoulder
    x = p[:, 0]; tip = p[np.argmax(x)]
    print('  widest point (hand)', tip.round(2))
