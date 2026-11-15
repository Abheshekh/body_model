"""Pose MakeHuman male + female to Z-Anatomy's stance and build the male->female warp field (SPEC §1.3 steps 7-8).
Ported from tools/sample/mh_fit.py without contain() or the register/pull block: the skin keeps MakeHuman's shape."""
import json
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import numpy as np

from v5.body import CACHE

DATA = os.path.join(CACHE, 'mpfb', 'src', 'mpfb', 'data')
HEIGHT = 1.705  # §2b.6: first-pass unposed male height, metres (sample value; Z-Anatomy's own height)
POSED_HEIGHT = 1.71  # §2b.6: second pass rescales so the posed male is this tall


# ---------- anatomy landmarks ----------
def _end(p, top, frac=0.05):
    y = p[:, 1]
    q = np.quantile(y, 1 - frac if top else frac)
    return p[y >= q].mean(0) if top else p[y <= q].mean(0)


def landmarks(parts):
    """Joint landmarks from Z-Anatomy bone ends (humerus, radius, femur, tibia), spine and skull, as the sample."""
    P = {p.name: np.asarray(p.pos, np.float64) for p in parts if p.kind == 'bone'}
    lm = {}
    for s in ('l', 'r'):
        hu, ra, fe, ti = P[f'Humerus.{s}'], P[f'Radius.{s}'], P[f'Femur.{s}'], P[f'Tibia.{s}']
        lm[f'shoulder_{s}'], lm[f'elbow_{s}'], lm[f'wrist_{s}'] = _end(hu, True), _end(hu, False), _end(ra, False)
        lm[f'hip_{s}'], lm[f'knee_{s}'], lm[f'ankle_{s}'] = _end(fe, True, 0.08), _end(fe, False), _end(ti, False)
    lm['L4'], lm['C7'], lm['C1'] = P['Vertebra L4'].mean(0), P['Vertebra C7'].mean(0), P['Atlas (C1)'].mean(0)
    pr = np.concatenate([P['Parietal bone.l'], P['Parietal bone.r']])
    lm['vertex'] = pr[np.argmax(pr[:, 1])]
    return lm


# ---------- MakeHuman rig ----------
def load_rig():
    """(rig, vertex groups, skin weights) from the MPFB2 game-engine rig."""
    def load(rel):
        with open(os.path.join(DATA, rel)) as f:
            return json.load(f)
    rig = load('rigs/standard/rig.game_engine.json')
    W = load('rigs/standard/weights.game_engine.json')['weights']
    groups = {k: np.concatenate([np.arange(a, b + 1) for a, b in v])
              for k, v in load('mesh_metadata/basemesh_vertex_groups.json').items() if v}
    WM = {}
    for b, lst in W.items():
        if lst:
            a = np.array(lst)
            WM[b] = (a[:, 0].astype(int), a[:, 1])
    return rig, groups, WM


def joints(V, rig, groups):
    def pos(spec):
        if spec.get('strategy') == 'CUBE':
            return V[groups[spec['cube_name']]].mean(0)
        if spec.get('strategy') == 'MEAN':
            return V[spec['vertex_indices']].mean(0)
        if spec.get('strategy') == 'VERTEX':
            return V[spec['vertex_index']]
        return np.array(spec['default_position'])
    return {b: (pos(d['head']), pos(d['tail'])) for b, d in rig.items()}


def children(rig, b):
    out = [b]
    for c, d in rig.items():
        if d['parent'] == b:
            out += children(rig, c)
    return out


def rot_between(a, b):
    """Rotation matrix taking direction a onto direction b."""
    a = a / np.linalg.norm(a)
    b = b / np.linalg.norm(b)
    v, c = np.cross(a, b), a @ b
    if np.linalg.norm(v) < 1e-8:  # ponytail: antiparallel also returns identity; bone directions never flip 180°
        return np.eye(3)
    K = np.array([[0, -v[2], v[1]], [v[2], 0, -v[0]], [-v[1], v[0], 0]])
    return np.eye(3) + K + K @ K * (1 / (1 + c))


def lbs(V, WM, T):
    """Linear blend skinning: WM bone -> (vertex idx, weight), T bone -> (R, t). Unweighted vertices stay."""
    out, acc = np.zeros_like(V), np.zeros(len(V))
    for b, (idx, w) in WM.items():
        R, t = T[b]
        out[idx] += w[:, None] * (V[idx] @ R.T + t)
        acc[idx] += w
    free = acc < 1e-6
    out[~free] /= acc[~free, None]
    out[free] = V[free]
    return out


def pose_mesh(V, lm, rig, groups, WM):
    """Rotates spine, neck, head, then upper arm/forearm and thigh/calf onto the landmarks; returns the skinned mesh."""
    J = joints(V, rig, groups)
    T = {b: (np.eye(3), np.zeros(3)) for b in rig}

    def apply(T0, R, pivot):
        R0, t0 = T0
        return R @ R0, R @ (t0 - pivot) + pivot

    def tf(T0, p):
        return T0[0] @ p + T0[1]

    def turn(b, p0, R):
        for c in children(rig, b):
            T[c] = apply(T[c], R, p0)

    for b, nxt, a0, a1 in (('spine_01', 'neck_01', 'L4', 'C7'), ('neck_01', 'head', 'C7', 'C1')):
        p0, p1 = tf(T[b], J[b][0]), tf(T[nxt], J[nxt][0])
        turn(b, p0, rot_between(p1 - p0, lm[a1] - lm[a0]))
    h0, h1 = tf(T['head'], J['head'][0]), tf(T['head'], J['head'][1])
    turn('head', h0, rot_between(h1 - h0, lm['vertex'] - lm['C1']))
    for s in ('l', 'r'):
        for b1, b2, j0, j1, j2 in (('upperarm', 'lowerarm', 'shoulder', 'elbow', 'wrist'),
                                   ('thigh', 'calf', 'hip', 'knee', 'ankle')):
            u, l = f'{b1}_{s}', f'{b2}_{s}'
            p0, p1 = tf(T[u], J[u][0]), tf(T[u], J[u][1])
            turn(u, p0, rot_between(p1 - p0, lm[f'{j1}_{s}'] - lm[f'{j0}_{s}']))
            q0, q1 = tf(T[l], J[l][0]), tf(T[l], J[l][1])
            turn(l, q0, rot_between(q1 - q0, lm[f'{j2}_{s}'] - lm[f'{j1}_{s}']))
    return lbs(V, WM, T)


def place_and_pose(mh, lm):
    """§2b.5/6: two passes so the posed male is 1.71 m; the female shares the final scale.
    Each sex gets hips on the anatomy hips (x, z) and, after posing, its lowest vertex on y = 0."""
    rig, groups, WM = load_rig()
    faces = mh['faces']
    used = np.unique(faces)
    hip = (lm['hip_l'] + lm['hip_r']) / 2

    def place(sex, scale):
        Vs = np.asarray(mh[sex], np.float64) * scale
        J = joints(Vs, rig, groups)
        h = (J['thigh_l'][0] + J['thigh_r'][0]) / 2
        P = pose_mesh(Vs + [hip[0] - h[0], -Vs[used, 1].min(), hip[2] - h[2]], lm, rig, groups, WM)
        P[:, 1] -= P[used, 1].min()
        return P

    scale = HEIGHT / np.ptp(np.asarray(mh['male'], np.float64)[used, 1])  # also converts MakeHuman's decimetres to metres
    scale *= POSED_HEIGHT / np.ptp(place('male', scale)[used, 1])
    return {'faces': faces, **{sex: place(sex, scale).astype(np.float32) for sex in ('male', 'female')}}


# ---------- warp field ----------
def _adjacency(faces, n):
    nbr = [[] for _ in range(n)]
    for q in faces:
        for i in range(len(q)):
            a, b = q[i], q[(i + 1) % len(q)]
            nbr[a].append(b)
            nbr[b].append(a)
    nbr = [np.unique(x) if x else np.array([i]) for i, x in enumerate(nbr)]
    deg = np.array([len(x) for x in nbr])
    return np.repeat(np.arange(n), deg), np.concatenate(nbr), deg


def _smooth(X, adj, it):
    rows, flat, deg = adj
    for _ in range(it):
        S = np.zeros_like(X)
        np.add.at(S, rows, X[flat])
        X = 0.5 * X + 0.5 * S / deg[:, None]
    return X


def warp_field(male, female, faces):
    """Dlow: D = female - male lightly smoothed, heavily smoothed over the breast so the anatomy gets no breast bump."""
    male = np.asarray(male, np.float64)
    Dfull = np.asarray(female, np.float64) - male
    adj = _adjacency(faces, len(male))
    Dsm, Dbig = _smooth(Dfull, adj, 8), _smooth(Dfull, adj, 60)
    chest = (male[:, 1] > 1.05) & (male[:, 1] < 1.45) & (male[:, 2] > -0.01)
    breast = chest & (np.linalg.norm(Dfull - Dbig, axis=1) > 0.006)
    bw = _smooth(breast[:, None].astype(float), adj, 6)
    return (Dsm * (1 - bw) + Dbig * bw).astype(np.float32)


def run(ctx):
    lm = landmarks(ctx['parts'])
    p = place_and_pose(ctx['mh'], lm)
    p['Dfull'] = p['female'] - p['male']
    p['Dlow'] = warp_field(p['male'], p['female'], p['faces'])
    p['landmarks'] = json.dumps({k: v.tolist() for k, v in lm.items()})
    np.savez(os.path.join(CACHE, 'pose.npz'), **p)
    ctx['pose'] = p
    return ctx


def heights(p):
    used = np.unique(p['faces'])
    return {s: float(np.ptp(p[s][used, 1])) for s in ('male', 'female')}


if __name__ == '__main__':
    from v5.body import load_parts
    ctx = run({'parts': load_parts(os.path.join(CACHE, 'za_raw')), 'mh': dict(np.load(os.path.join(CACHE, 'mh.npz')))})
    for k, v in heights(ctx['pose']).items():
        print(k, 'height', round(v, 4), 'min y', round(float(ctx['pose'][k][np.unique(ctx['pose']['faces']), 1].min()), 4))
    used = np.unique(ctx['pose']['faces'])
    vtx = json.loads(ctx['pose']['landmarks'])['vertex'][1]
    print('skull-to-skin gap at top (male skin max y - vertex)', round(float(ctx['pose']['male'][used, 1].max()) - vtx, 4))
    for k, v in json.loads(ctx['pose']['landmarks']).items():
        print(k, np.round(v, 4).tolist())
