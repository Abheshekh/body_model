"""MakeHuman (CC0) male + female skin: base mesh + equal blend of three ethnic targets (SPEC step 7, first half)."""
import gzip
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import numpy as np

from v5.body import CACHE

DATA = os.path.join(CACHE, 'mpfb', 'src', 'mpfb', 'data')
BODY_GROUPS = ('body', 'helper-l-eye', 'helper-r-eye')


def _read_obj(path):
    V, VT, F, FT, FG, grp = [], [], [], [], [], None
    for line in open(path):
        t = line.split()
        if not t:
            continue
        if t[0] == 'v':
            V.append([float(x) for x in t[1:4]])
        elif t[0] == 'vt':
            VT.append([float(x) for x in t[1:3]])
        elif t[0] == 'g':
            grp = t[1]
        elif t[0] == 'f':
            ids = [x.split('/') for x in t[1:]]
            F.append([int(a[0]) - 1 for a in ids])
            FT.append([int(a[1]) - 1 if len(a) > 1 and a[1] else -1 for a in ids])
            FG.append(grp)
    return np.array(V, np.float32), VT, F, FT, FG


def _target(V, name):
    d = np.zeros_like(V)
    for line in gzip.open(os.path.join(DATA, 'targets', 'macrodetails', f'{name}.target.gz'), 'rt'):
        if line.startswith('#') or not line.strip():
            continue
        i, x, y, z = line.split()
        d[int(i)] = (float(x), float(y), float(z))
    return d


def build():
    V, VT, F, FT, FG = _read_obj(os.path.join(DATA, '3dobjs', 'base.obj'))
    out = {sex: V + sum(_target(V, f'{r}-{sex}-young') for r in ('african', 'asian', 'caucasian')) / 3
           for sex in ('male', 'female')}
    body = [i for i, g in enumerate(FG) if g in BODY_GROUPS]
    # ponytail: assumes all body faces are quads (checked below)
    assert all(len(F[i]) == 4 for i in body), 'non-quad body face'
    res = dict(male=out['male'].astype(np.float32), female=out['female'].astype(np.float32),
               faces=np.array([F[i] for i in body], np.int32),
               uv=np.array(VT, np.float32), fuv=np.array([FT[i] for i in body], np.int32))
    np.savez(os.path.join(CACHE, 'mh.npz'), **res)
    return res


if __name__ == '__main__':
    r = build()
    for sex in ('male', 'female'):
        p = r[sex][np.unique(r['faces'])]
        print(sex, 'height', round(float(p[:, 1].max() - p[:, 1].min()), 3))
    print('faces', r['faces'].shape)
