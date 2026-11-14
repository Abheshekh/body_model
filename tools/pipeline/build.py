"""BodyParts3D -> public/data/body.glb + parts.json + credits.json. See docs/done_development/m1-body-pipeline/plans/PLAN.md."""
import json
import os
import subprocess
import sys

import fast_simplification
import numpy as np
import trimesh

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import classify as C  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
CACHE = os.path.join(HERE, 'cache', 'BodyParts3D')
CFG = json.load(open(os.path.join(HERE, 'config.json')))
PLAIN = json.load(open(os.path.join(HERE, 'plain_names.json')))


def git(*args, check=True):
    r = subprocess.run(['git', *args], capture_output=True, text=True)
    if check and r.returncode != 0:
        sys.stderr.write(r.stderr)
        raise SystemExit(r.returncode or 1)
    return r.stdout


def fetch_and_select():
    """R1 + R2. Returns (commit, license_text, selected) with selected = [(id, normalised name, kind)]."""
    d = CFG['dataDir']
    texts = [f'{d}/parts_list_e.txt', f'{d}/LICENSE_content']
    if not os.path.isdir(os.path.join(CACHE, '.git')):
        os.makedirs(os.path.dirname(CACHE), exist_ok=True)
        git('clone', '--filter=blob:none', '--no-checkout', '--depth', '1', '--sparse', CFG['repo'], CACHE)
        git('-C', CACHE, 'sparse-checkout', 'set', '--no-cone', *texts)
        git('-C', CACHE, 'checkout')
    commit = git('-C', CACHE, 'rev-parse', 'HEAD').strip()
    names = {}
    for line in open(os.path.join(CACHE, texts[0]), encoding='utf-8', errors='ignore'):
        p = line.rstrip('\n').split('\t')
        if len(p) >= 2:
            names[p[0]] = p[1]
    stl_dir = f'{d}/stl'
    ids = [os.path.basename(p)[:-4] for p in git('-C', CACHE, 'ls-tree', '-r', '--name-only', 'HEAD', stl_dir).split('\n') if p.endswith('.stl')]
    selected = []
    for fid in sorted(ids):
        kind = C.classify(names.get(fid, '?'), CFG['rules'])
        if kind:
            selected.append((fid, C.normalise(names[fid]), kind))
    missing = [f'{stl_dir}/{fid}.stl' for fid, _, _ in selected if not os.path.exists(os.path.join(CACHE, stl_dir, fid + '.stl'))]
    for i in range(0, len(missing), 100):
        git('-C', CACHE, 'sparse-checkout', 'add', *missing[i:i + 100])
    license_text = open(os.path.join(CACHE, texts[1]), encoding='utf-8', errors='replace').read()
    return commit, license_text, selected


def counts(selected):
    out = {}
    for _, _, kind in selected:
        out[kind] = out.get(kind, 0) + 1
    return out


def simplify_all(meshes, scale):
    """R4. meshes = [(kind, v, f)]. Simplify with every target scaled by `scale`."""
    kinds = CFG['kinds']
    base = [min(max(len(f) * kinds[k][0], kinds[k][1]), kinds[k][2]) for k, _, f in meshes]
    s = CFG['triangleBudget'] / sum(base) * scale
    out = []
    for (k, v, f), b in zip(meshes, base):
        target = min(len(f), max(80, round(b * s)))
        if target < len(f):
            v, f = fast_simplification.simplify(v, f, target_reduction=1 - target / len(f))
        out.append((np.asarray(v, dtype=np.float32), np.asarray(f, dtype=np.uint32)))
    return out


def to_output_axes(a):
    """Source: mm, +x body's left, front = -y, z up. Output: Y up, +Z front."""
    return np.stack([a[:, 0], a[:, 2], -a[:, 1]], 1)


def vertex_normals(v, f):
    # ponytail: area-weighted, computed here because trimesh's version needs scipy (not a listed dependency)
    fn = np.cross(v[f[:, 1]] - v[f[:, 0]], v[f[:, 2]] - v[f[:, 0]])
    n = np.zeros_like(v)
    for i in range(3):
        np.add.at(n, f[:, i], fn)
    return (n / np.maximum(np.linalg.norm(n, axis=1, keepdims=True), 1e-12)).astype(np.float32)


def build_parts(selected):
    meshes, kept = [], []
    for fid, name, kind in selected:
        m = trimesh.load(os.path.join(CACHE, CFG['dataDir'], 'stl', fid + '.stl'), process=True)
        if len(m.faces) < 20:
            continue
        meshes.append((kind, np.asarray(m.vertices, dtype=np.float32), np.asarray(m.faces, dtype=np.uint32)))
        kept.append((fid, name, kind))
    limit = CFG['triangleBudget'] * 1.05
    res = simplify_all(meshes, 1.0)
    total = sum(len(f) for _, f in res)
    if total > limit:
        res = simplify_all(meshes, CFG['triangleBudget'] / total)
        total = sum(len(f) for _, f in res)
        if total > limit:
            raise SystemExit(f'triangles {total} still above {limit}')
    scene, parts = trimesh.Scene(), []
    for (fid, name, kind), (v, f) in zip(kept, res):
        n = vertex_normals(v, f)
        v2 = (to_output_axes(v) * 0.001).astype(np.float32)
        n2 = to_output_axes(n).astype(np.float32)
        scene.add_geometry(trimesh.Trimesh(v2, f, vertex_normals=n2, process=False), node_name=fid, geom_name=fid)
        side = C.side_of(name)
        parts.append(dict(
            id=fid, name=name, plainName=C.plain_name(name, side, PLAIN['map']), kind=kind, side=side,
            layer=C.layer_of(name, kind, CFG['superficial']), muscleKey=None, triangles=int(len(f)),
            center=[round(float(x), 4) for x in (v2.min(0) + v2.max(0)) / 2],
            _min=v2.min(0), _max=v2.max(0)))
    return scene, parts, total


def check_axes(parts):
    lo = min(p['_min'][1] for p in parts)
    hi = max(p['_max'][1] for p in parts)
    by = {p['name']: p for p in parts}
    assert 1.5 <= hi - lo <= 1.8, f'height {hi - lo}'
    assert -0.05 <= lo <= 0.05, f'min y {lo}'
    assert by['left femur']['center'][0] > 0, 'left femur not on +x'
    assert by['body of sternum']['center'][1] > by['sacrum']['center'][1], 'sternum below sacrum'


def main(argv):
    commit, license_text, selected = fetch_and_select()
    print('selected', counts(selected))
    if '--select-only' in argv:
        return 0
    scene, parts, total = build_parts(selected)
    try:
        check_axes(parts)
    except (AssertionError, KeyError) as e:
        print('axis check failed:', repr(e), file=sys.stderr)
        return 1
    raw = os.path.join(HERE, 'cache', 'raw.glb')
    out = os.path.join(ROOT, 'public', 'data', 'body.glb')
    os.makedirs(os.path.dirname(out), exist_ok=True)
    scene.export(raw, file_type='glb')
    r = subprocess.run(['npx', 'gltf-transform', 'meshopt', raw, out], cwd=ROOT)
    if r.returncode:
        return r.returncode
    for p in parts:
        del p['_min'], p['_max']
    src = dict(CFG['sources'][0], commit=commit)
    data = os.path.join(ROOT, 'public', 'data')
    plain_src = {'name': 'plain names', 'from': 'tools/pipeline/plain_names.json'}
    json.dump(dict(sources=[src, plain_src], triangleBudget=CFG['triangleBudget'], triangles=total, parts=parts),
              open(os.path.join(data, 'parts.json'), 'w'), indent=1)
    json.dump(dict(sources=[src], items=[dict(
        asset='BodyParts3D', licence=src['licence'], licenceUrl=src['licenceUrl'], text=license_text,
        modified='Simplified and converted to glTF for this app.')]),
        open(os.path.join(data, 'credits.json'), 'w'), indent=1)
    print('parts', counts([(p['id'], p['name'], p['kind']) for p in parts]))
    print('triangles', total)
    print('body.glb', os.path.getsize(out), 'bytes')
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
