"""Shared data model and paths for the v5 pipeline."""
import json
import os
from dataclasses import dataclass, field, fields

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..'))
CACHE = os.path.join(ROOT, 'tools', 'pipeline', 'cache')
OUT = os.path.join(ROOT, 'public', 'data', 'body')
with open(os.path.join(HERE, 'pipeline.json')) as _f:
    CFG = json.load(_f)

_ARRAYS = ('pos', 'tri', 'nrm', 'fib', 'acr', 'ao', 'posF')


def _empty(n):
    return dict(
        nrm=np.zeros((n, 3), np.float32), fib=np.zeros((n, 3), np.float32),
        acr=np.zeros(n, np.float32), ao=np.zeros(n, np.float32))


@dataclass
class Part:
    id: int
    name: str
    kind: str
    ancestry: list
    pos: np.ndarray
    tri: np.ndarray
    nrm: np.ndarray = None
    fib: np.ndarray = None
    acr: np.ndarray = None
    ao: np.ndarray = None
    posF: np.ndarray = None
    plain: str = ''
    side: str = 'center'
    region: str = ''
    system: str = ''
    colour: str = '#cccccc'
    layer: int = None
    sex: str = 'both'
    ext: bool = False
    simplified: bool = False

    def __post_init__(self):
        self.pos = np.asarray(self.pos, np.float32)
        self.tri = np.asarray(self.tri, np.int32)
        for k, v in _empty(len(self.pos)).items():
            if getattr(self, k) is None:
                setattr(self, k, v)


_META = [f.name for f in fields(Part) if f.name not in _ARRAYS]


def save_parts(path, parts):
    """Writes path.npz (concatenated arrays + offsets) and path.json (metadata)."""
    data = {}
    for k in _ARRAYS:
        if k == 'posF':
            has = np.array([p.posF is not None for p in parts], bool)
            data['hasF'] = has
            arrs = [p.posF for p in parts if p.posF is not None]
        else:
            arrs = [getattr(p, k) for p in parts]
        shape = (0, 3) if k in ('pos', 'nrm', 'fib', 'posF') else (0, 3) if k == 'tri' else (0,)
        data[k] = np.concatenate(arrs) if arrs else np.zeros(shape, np.float32)
    data['nv'] = np.array([len(p.pos) for p in parts], np.int64)
    data['nt'] = np.array([len(p.tri) for p in parts], np.int64)
    np.savez(path + '.npz', **data)
    with open(path + '.json', 'w') as f:
        json.dump([{k: getattr(p, k) for k in _META} for p in parts], f)


def load_parts(path):
    z = dict(np.load(path + '.npz'))  # read once; NpzFile re-reads the whole array per index
    with open(path + '.json') as f:
        meta = json.load(f)
    ov = np.concatenate([[0], np.cumsum(z['nv'])])
    ot = np.concatenate([[0], np.cumsum(z['nt'])])
    ovf = 0
    parts = []
    for i, m in enumerate(meta):
        a, b = ov[i], ov[i + 1]
        posF = None
        if z['hasF'][i]:
            posF = z['posF'][ovf:ovf + b - a]
            ovf += b - a
        parts.append(Part(
            pos=z['pos'][a:b], tri=z['tri'][ot[i]:ot[i + 1]], nrm=z['nrm'][a:b],
            fib=z['fib'][a:b], acr=z['acr'][a:b], ao=z['ao'][a:b], posF=posF, **m))
    return parts
