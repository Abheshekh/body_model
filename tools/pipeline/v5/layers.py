"""Layer peeling and ambient occlusion (SPEC §1.3 steps 5-6), on the male shape."""
import json
import os
import re

import numpy as np
import trimesh

from v5 import body

SOFT = ('muscle', 'tendon')
OVERRIDES = os.path.join(body.HERE, 'layer_overrides.json')
REVIEW = os.path.join(body.CACHE, 'layer_review.json')
STEP = 1e-5  # metres stepped past a self hit before casting again


def _unit(n):
    return n / (np.linalg.norm(n, axis=1, keepdims=True) + 1e-9)


def _mesh(owned):
    """One trimesh of [(part, owner id)] plus the owner of every triangle."""
    P, T, own, off = [], [], [], 0
    for p, o in owned:
        P.append(p.pos)
        T.append(p.tri + off)
        own.append(np.full(len(p.tri), o))
        off += len(p.pos)
    mesh = trimesh.Trimesh(np.concatenate(P), np.concatenate(T), process=False)
    return mesh, np.concatenate(own)


def first_other_hit(mesh, owner, org, dirs, self_id, reach):
    """Distance along each ray to the first triangle not owned by self_id; inf when none within reach."""
    dist = np.full(len(org), np.inf)
    gone = np.zeros(len(org))
    o = np.array(org, np.float64)
    act = np.arange(len(org))
    for _ in range(32):  # ponytail: a ray still crossing its own part after 32 steps counts as uncovered
        if not len(act):
            break
        ti, ri, loc = mesh.ray.intersects_id(o[act], dirs[act], multiple_hits=False, return_locations=True)
        a = act[ri]
        d = gone[a] + np.linalg.norm(loc - o[a], axis=1)
        near = d <= reach
        other = near & (owner[ti] != self_id[a])
        dist[a[other]] = d[other]
        again = near & ~other
        a = a[again]
        gone[a] = d[again] + STEP
        o[a] = loc[again] + dirs[a] * STEP
        act = a
    return dist


def peel(soft, bones, cfg):
    """SPEC step 5. Returns ({part id: layer}, {part id: exposure at the round it was assigned})."""
    c = cfg['peel']
    layer, exposure = {}, {}
    rem = [p for p in soft]
    for r in range(1, c['maxLayer'] + 1):
        if not rem:
            break
        mesh, owner = _mesh([(p, p.id) for p in rem] + [(b, -1) for b in bones])
        P = np.concatenate([p.pos for p in rem]).astype(np.float64)
        N = _unit(np.concatenate([p.nrm for p in rem]).astype(np.float64))
        which = np.repeat(np.arange(len(rem)), [len(p.pos) for p in rem])
        ids = np.array([p.id for p in rem])[which]
        covered = np.isfinite(first_other_hit(mesh, owner, P + N * 0.001, N, ids, c['reach']))
        nv = np.bincount(which, minlength=len(rem))
        exp = 1 - np.bincount(which, covered, minlength=len(rem)) / np.maximum(nv, 1)
        for p, e in zip(rem, exp):
            exposure[p.id] = float(e)
        if r == c['maxLayer']:
            out = list(range(len(rem)))
        else:
            out = [i for i, e in enumerate(exp) if e >= c['uncovered']]
            if not out:  # fallback, as the sample: top third by exposure, at least one
                out = sorted(range(len(rem)), key=lambda i: -exp[i])[:max(1, len(rem) // 3)]
        for i in out:
            layer[rem[i].id] = r
        out = set(out)
        rem = [p for i, p in enumerate(rem) if i not in out]
    return layer, exposure


def norm(name):
    s = name.lower().strip()
    s = re.sub(r'\.[lr]$', '', s)
    s = re.sub(r' muscle$', '', s)
    return s.strip()


def apply_overrides(parts, overrides):
    """Sets part.layer for every part whose norm(name) matches an entry; returns the unmatched entries."""
    by = {}
    for p in parts:
        by.setdefault(norm(p.name), []).append(p)
    missing = []
    for o in overrides:
        hit = by.get(norm(o['part']), [])
        for p in hit:
            p.layer = o['layer']
        if not hit:
            missing.append(o['part'])
    return missing


def _ao(who, occluders, dirs, reach):
    """Sets p.ao for every part in who from hemisphere rays against the occluders (sample's weighting)."""
    mesh, _ = _mesh([(p, 0) for p in occluders])
    P = np.concatenate([p.pos for p in who]).astype(np.float64)
    N = _unit(np.concatenate([p.nrm for p in who]).astype(np.float64))
    o = P + N * 0.002
    occ = np.zeros(len(P))
    ws = np.zeros(len(P))
    for d in dirs:
        dd = np.where((N @ d)[:, None] < 0, -d, d)
        _, ri, loc = mesh.ray.intersects_id(o, dd, multiple_hits=False, return_locations=True)
        dist = np.full(len(P), np.inf)
        dist[ri] = np.linalg.norm(loc - o[ri], axis=1)
        w = np.clip((N * dd).sum(1), 0, 1)
        ws += w
        occ += w * np.clip(1 - dist / reach, 0, 1)
    ao = np.clip(1 - occ / (ws + 1e-6) * 1.3, 0.12, 1).astype(np.float32)
    off = 0
    for p in who:
        p.ao = ao[off:off + len(p.pos)]
        off += len(p.pos)


def ambient_occlusion(parts, cfg):
    """Per-vertex AO (F1b): non-muscle parts against all anatomy except skin; a muscle/tendon part of layer L only against
    non-muscle anatomy and muscle/tendon parts of layer >= L, so faces the peel uncovers are not dark. Skin gets 1.
    AO is the male shape, so generated female parts get AO but never occlude (they sit in the female shape)."""
    rays, reach = cfg['ao']['rays'], cfg['ao']['reach']
    anat = [p for p in parts if p.kind != 'skin' and len(p.pos)]
    for p in parts:
        if p.kind == 'skin' or not len(p.pos):
            p.ao = np.ones(len(p.pos), np.float32)
    dirs = _unit(np.random.default_rng(1).normal(size=(rays, 3)))
    occ = [p for p in anat if p.sex != 'female']
    hard = [p for p in anat if p.kind not in SOFT]
    if hard:
        _ao(hard, occ, dirs, reach)
    for L in sorted({p.layer for p in anat if p.kind in SOFT}):
        _ao([p for p in anat if p.kind in SOFT and p.layer == L],
            [p for p in occ if p.kind not in SOFT or p.layer >= L], dirs, reach)
    return parts


def run(ctx):
    cfg, parts = ctx['cfg'], ctx['parts']
    print('trimesh.ray.has_embree', trimesh.ray.has_embree)
    soft = [p for p in parts if p.kind in SOFT]
    layer, exposure = peel(soft, [p for p in parts if p.kind == 'bone'], cfg)
    for p in soft:
        p.layer = layer[p.id]
    with open(OVERRIDES) as f:
        for m in apply_overrides(parts, json.load(f)):
            print('layer override unmatched:', m)
    review = [{'part': p.name, 'layer': p.layer, 'exposure': exposure[p.id], 'round': layer[p.id]} for p in soft]
    with open(REVIEW, 'w') as f:
        json.dump(review, f, indent=1)
    ambient_occlusion(parts, cfg)
    return ctx
