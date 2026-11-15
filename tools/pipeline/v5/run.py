"""R12: runs the v5 pipeline in order with per-step timing, reusing cached za_raw, mh and pose (--force redoes all).

npm run pipeline:v5 [-- --force]
"""
import json
import os
import subprocess
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import numpy as np  # noqa: E402
import trimesh  # noqa: E402

from v5 import body, geom, layers, mh_build, names, pack, pose, sex  # noqa: E402


def cached(name, force):
    return not force and os.path.exists(os.path.join(body.CACHE, name))


def export(ctx):
    if not cached('za_raw.npz', ctx['force']):
        subprocess.run([sys.executable, '-I', os.path.join(body.HERE, 'za_export.py')], check=True)
    ctx['parts'] = body.load_parts(os.path.join(body.CACHE, 'za_raw'))


def makehuman(ctx):
    ctx['mh'] = dict(np.load(os.path.join(body.CACHE, 'mh.npz'))) if cached('mh.npz', ctx['force']) else mh_build.build()


def posing(ctx):
    if cached('pose.npz', ctx['force']):
        ctx['pose'] = dict(np.load(os.path.join(body.CACHE, 'pose.npz')))
    else:
        pose.run(ctx)


def peel(ctx):
    """layers.run without AO, so the two get separate timings."""
    print('trimesh.ray.has_embree', trimesh.ray.has_embree)
    soft = [p for p in ctx['parts'] if p.kind in layers.SOFT]
    layer, exposure = layers.peel(soft, [p for p in ctx['parts'] if p.kind == 'bone'], ctx['cfg'])
    for p in soft:
        p.layer = layer[p.id]
    with open(layers.OVERRIDES) as f:
        ctx['unmatched'] = layers.apply_overrides(ctx['parts'], json.load(f))
    for m in ctx['unmatched']:
        print('layer override unmatched:', m)
    review = [{'part': p.name, 'layer': p.layer, 'exposure': exposure[p.id], 'round': layer[p.id]} for p in soft]
    with open(layers.REVIEW, 'w') as f:
        json.dump(review, f, indent=1)


STEPS = [('export', export), ('makehuman', makehuman), ('geom', geom.run), ('names', names.run), ('pose', posing),
         ('sex', sex.run), ('layers', peel), ('ao', lambda c: layers.ambient_occlusion(c['parts'], c['cfg'])),
         ('pack', pack.run)]


def main(force):
    ctx = {'cfg': body.CFG, 'parts': [], 'mh': {}, 'pose': {}, 'timings': {}, 'force': force}
    for name, fn in STEPS:
        t = time.time()
        print(f'--- {name}', flush=True)
        fn(ctx)
        ctx['timings'][name] = time.time() - t
        print(f'--- {name} {ctx["timings"][name]:.1f}s', flush=True)
    man = ctx['manifest']
    print('\n| step | seconds |\n|---|---|')
    for k, v in ctx['timings'].items():
        print(f'| {k} | {v:.1f} |')
    print(f'| total | {sum(ctx["timings"].values()):.1f} |')
    print('\n| pack | load | parts | verts | tris | bytes | gzBytes |\n|---|---|---|---|---|---|---|')
    for p in man['packs']:
        n = sum(1 for x in man['parts'] if x['pack'] == p['name'])
        print(f'| {p["name"]} | {p["load"]} | {n} | {p["verts"]} | {p["tris"]} | {p["bytes"]} | {p["gzBytes"]} |')
    first = sum(p['gzBytes'] for p in man['packs'] if p['load'] == 'first')
    print(f'\nfirst-load gz {first} (budget {ctx["cfg"]["budget"]["firstLoadGz"]}); parts {len(man["parts"])}; '
          f'heights {man["heights"]}; unmatched overrides {ctx["unmatched"]}')
    return ctx


if __name__ == '__main__':
    main('--force' in sys.argv[1:])
