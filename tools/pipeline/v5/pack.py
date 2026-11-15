"""Packs (SPEC §1.3 step 11): one quantised, gzipped pack per kind + manifest.json + credits.json. FORMAT.md is the contract."""
import gzip
import json
import os

import numpy as np

from v5 import body
from v5.geom import vertex_normals
from v5.names import HIDDEN
from v5.rig import WEIGHTED

FLOATS = ('pos', 'posF', 'nrm', 'fib', 'acr', 'ao')
META = ('id', 'name', 'plain', 'side', 'kind', 'region', 'system', 'colour', 'layer', 'sex', 'ext', 'simplified')
# name -> (dtype, components per vertex); idx is per triangle
RIGID_ENTRY = os.path.join(body.CACHE, 'weights_rigid.json')  # the rigid set's entry (as manifest rig.weights)
LAYOUT = {'idx': (np.uint32, 3), 'posM': (np.uint16, 3), 'posF': (np.uint16, 3), 'nrmM': (np.int8, 3),
          'nrmF': (np.int8, 3), 'fib': (np.int8, 3), 'acr': (np.int16, 1), 'mid': (np.uint16, 1), 'ao': (np.uint8, 1)}


def q8(N):
    """Unit vectors -> int8 (x127), as the sample."""
    return np.round(np.clip(N / (np.linalg.norm(N, axis=1, keepdims=True) + 1e-9), -1, 1) * 127).astype(np.int8)


def _check(p):
    for k in FLOATS:
        a = getattr(p, k)
        if a is None or not np.isfinite(a).all():
            raise ValueError(p.name)


def _blob(ps, lo, hi):
    """Concatenates a kind's parts (sorted by id, so triangles are sorted by part) into the byte layout."""
    q16 = lambda P: np.round((P - lo) / (hi - lo) * 65535).astype(np.uint16)
    off = np.cumsum([0] + [len(p.pos) for p in ps])
    idx = np.concatenate([p.tri.astype(np.int64) + o for p, o in zip(ps, off)]).reshape(-1, 3)
    cat = lambda k: np.concatenate([getattr(p, k) for p in ps])
    arrays = {
        'idx': idx.astype(np.uint32), 'posM': q16(cat('pos')), 'posF': q16(cat('posF')),
        'nrmM': q8(cat('nrm')), 'nrmF': q8(np.concatenate([vertex_normals(p.posF, p.tri) for p in ps])),
        'fib': q8(cat('fib')), 'acr': np.clip(np.round(cat('acr') * 8000), -32767, 32767).astype(np.int16),
        'mid': np.concatenate([np.full(len(p.pos), p.id) for p in ps]).astype(np.uint16),
        'ao': np.round(cat('ao') * 255).astype(np.uint8)}
    blob, where = bytearray(), {}
    for k, a in arrays.items():
        while len(blob) % 4:
            blob.append(0)
        where[k] = [len(blob), a.nbytes]
        blob.extend(a.tobytes())
    return bytes(blob), where, int(len(idx)), int(off[-1])


def write_weights(parts, packs, weights, out, file='weights.bin.gz'):
    """R3: weights.bin.gz (or file) = for each weighted pack in manifest order, bi (uint8 x 4) then bw (uint8 x 4) per
    vertex, in the pack's vertex order (parts sorted by id). Returns the manifest rig.weights entry."""
    blob, arrays = bytearray(), {}
    for pk in packs:
        if pk['name'] not in WEIGHTED:
            continue
        ps = sorted((p for p in parts if p.kind == pk['name']), key=lambda p: p.id)
        bi, bw = (np.concatenate([weights[p.id][k] for p in ps]) for k in (0, 1))
        if len(bi) != pk['verts'] or len(bw) != pk['verts']:
            raise ValueError(f'weights for {pk["name"]}: {len(bi)} vertices, pack has {pk["verts"]}')
        arrays[pk['name']] = {}
        for k, a in (('bi', bi), ('bw', bw)):
            while len(blob) % 4:
                blob.append(0)
            arrays[pk['name']][k] = [len(blob), a.nbytes]
            blob.extend(np.ascontiguousarray(a, np.uint8).tobytes())
    gz = gzip.compress(bytes(blob), 9, mtime=0)
    with open(os.path.join(out, file), 'wb') as f:
        f.write(gz)
    return {'file': file, 'bytes': len(blob), 'gzBytes': len(gz), 'arrays': arrays}


def unpack_weights(out, w):
    """Decodes a weights file described by entry w (manifest rig.weights, or the rigid set's RIGID_ENTRY in the cache):
    {pack: (bi, bw)} as uint8 (n, 4)."""
    with open(os.path.join(out, w['file']), 'rb') as f:
        raw = gzip.decompress(f.read())
    return {k: tuple(np.frombuffer(raw, np.uint8, a[x][1], a[x][0]).reshape(-1, 4) for x in ('bi', 'bw'))
            for k, a in w['arrays'].items()}


def write(parts, pose, out, weights=None):
    """Writes <kind>.bin.gz for every non-empty kind and manifest.json into out; returns the manifest.
    weights ({part id: (bi, bw)}, R3) adds weights.bin.gz and the manifest rig section (rig.json is written by rig.py)."""
    for p in parts:
        _check(p)
    if max(p.id for p in parts) > 65535:
        raise ValueError('part id does not fit uint16')
    allP = np.concatenate([np.concatenate([p.pos, p.posF]) for p in parts])
    lo, hi = allP.min(0) - 0.01, allP.max(0) + 0.01
    used = np.unique(pose['faces'])
    os.makedirs(out, exist_ok=True)
    packs, pack_of = [], {}
    for load in ('first', 'demand'):
        for kind in body.CFG['packs'][load]:
            ps = sorted((p for p in parts if p.kind == kind), key=lambda p: p.id)
            if not ps:
                continue
            raw, where, tris, verts = _blob(ps, lo, hi)
            gz = gzip.compress(raw, 9, mtime=0)
            with open(os.path.join(out, f'{kind}.bin.gz'), 'wb') as f:
                f.write(gz)
            packs.append({'name': kind, 'kinds': [kind], 'load': load, 'file': f'{kind}.bin.gz', 'bytes': len(raw),
                          'gzBytes': len(gz), 'verts': verts, 'tris': tris, 'arrays': where})
            for p in ps:
                pack_of[p.id] = kind
    man = {'version': 1, 'box': [lo.tolist(), hi.tolist()], 'sexes': ['male', 'female'],
           'heights': {s: round(float(np.ptp(pose[s][used, 1])), 4) for s in ('male', 'female')},
           'packs': packs,
           'parts': [{**{k: getattr(p, k) for k in META}, 'defaultHidden': bool(HIDDEN.search(p.name)), 'pack': pack_of[p.id]}
                     for p in sorted(parts, key=lambda p: p.id) if p.id in pack_of],
           'credits': 'credits.json'}
    if weights is not None:
        man['rig'] = {'file': 'rig.json', 'weights': write_weights(parts, packs, weights, out)}
    with open(os.path.join(out, 'manifest.json'), 'w') as f:
        json.dump(man, f, separators=(',', ':'))
    return man


def unpack(out, man, name):
    """Decodes one pack back to floats: {idx, posM, posF (metres), nrmM, nrmF, fib (unit-ish), acr, mid, ao (0-1)}."""
    pk = next(p for p in man['packs'] if p['name'] == name)
    with open(os.path.join(out, pk['file']), 'rb') as f:
        raw = gzip.decompress(f.read())
    lo, hi = np.array(man['box'])
    d = {}
    for k, (o, n) in pk['arrays'].items():
        dt, c = LAYOUT[k]
        a = np.frombuffer(raw, dt, n // np.dtype(dt).itemsize, o)
        d[k] = a.reshape(-1, 3) if c == 3 else a
    for k in ('posM', 'posF'):
        d[k] = lo + d[k] / 65535 * (hi - lo)
    for k in ('nrmM', 'nrmF', 'fib'):
        d[k] = d[k] / 127
    d['acr'] = d['acr'] / 8000
    d['ao'] = d['ao'] / 255
    return d


def credits(out):
    """credits.json: every source with licence and the fetched commit hash."""
    with open(os.path.join(body.CACHE, 'sources.json')) as f:
        src = json.load(f)
    za = body.CFG['sources']['za']['repo']
    mh = body.CFG['sources']['mpfb']['repo']
    c = [{'name': 'Z-Anatomy', 'url': za, 'licence': 'CC BY-SA 4.0',
          'licenceUrl': 'https://creativecommons.org/licenses/by-sa/4.0/',
          'provides': 'anatomy meshes: muscles, tendons, bones, organs, vessels, nerves, lymph, joints', 'commit': src['za']},
         {'name': 'BodyParts3D', 'url': 'https://lifesciencedb.jp/bp3d/', 'licence': 'CC BY-SA 2.1 JP',
          'licenceUrl': 'https://creativecommons.org/licenses/by-sa/2.1/jp/',
          'provides': 'original anatomy meshes that Z-Anatomy is built from (via Z-Anatomy)', 'commit': src['za']},
         {'name': 'MakeHuman (MPFB2)', 'url': mh, 'licence': 'CC0', 'licenceUrl': 'https://creativecommons.org/publicdomain/zero/1.0/',
          'provides': 'male and female skin: base mesh, ethnic targets, game-engine rig and weights', 'commit': src['mpfb']}]
    with open(os.path.join(out, 'credits.json'), 'w') as f:
        json.dump(c, f, indent=1)
    return c


def run(ctx):
    ctx['manifest'] = write(ctx['parts'], ctx['pose'], body.OUT, ctx['rig']['weights'])
    # R11 rigid fallback: measurement only (acceptance_rig.py), so it stays in the pipeline cache, out of the app
    w = write_weights(ctx['parts'], ctx['manifest']['packs'], ctx['rig']['rigid'], body.CACHE, 'weights_rigid.bin.gz')
    with open(RIGID_ENTRY, 'w') as f:
        json.dump(w, f)
    credits(body.OUT)
    return ctx
