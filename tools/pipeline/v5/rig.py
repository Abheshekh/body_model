"""R3 rig (R1, R2; SPEC §2): the fitted game-rig skeleton per sex with snapped joint pivots, the joint table, part->bone
for rigid parts and per-vertex skin weights. Writes rig.json; pack.py writes the weights pack. FORMAT.md is the contract."""
import functools
import json
import os
import re

import numpy as np

from v5 import body, pose

BONES = ('pelvis', 'spine_01', 'spine_02', 'spine_03', 'neck_01', 'head', 'clavicle_l', 'clavicle_r', 'upperarm_l',
         'upperarm_r', 'lowerarm_l', 'lowerarm_r', 'hand_l', 'hand_r', 'thigh_l', 'thigh_r', 'calf_l', 'calf_r',
         'foot_l', 'foot_r', 'ball_l', 'ball_r')
TRUNK = ('pelvis', 'spine_01', 'spine_02', 'spine_03', 'neck_01', 'head')
CHAINS = {'axial': TRUNK, **{f'{c}_{s}': b for s in 'lr' for c, b in (
    ('arm', ('spine_03', f'clavicle_{s}', f'upperarm_{s}', f'lowerarm_{s}', f'hand_{s}')),
    ('leg', ('pelvis', f'thigh_{s}', f'calf_{s}', f'foot_{s}', f'ball_{s}')))}}
LIMB = {'Arm': 'arm', 'Hand': 'arm', 'Leg': 'leg', 'Foot': 'leg'}  # §2b.10; every other region -> axial
SIDEWAYS = re.compile(r'pectoralis major|pectoralis minor|latissimus dorsi|deltoid|teres major|teres minor|serratus anterior|'
                      r'trapezius|rhomboid major|rhomboid minor|levator scapulae|supraspinatus|infraspinatus|subscapularis', re.I)
WEIGHTED = ('skin', 'muscle', 'tendon', 'vessel', 'nerve', 'lymph', 'joint')  # per-vertex weights (weights pack)
RIGID = ('bone', 'organ')  # one bone per part (rig.json partBone)
BLEND = 0.04  # m, half-width of the smoothstep blend across a joint
GRADIENT_W = 0.35  # §2b.0b: blend half-width as a fraction of a multi-segment muscle's length
RIGID_BLEND = 0.015  # m, R11 rigid fallback: half-width of the blend at joint caps
BONE_MAP = os.path.join(body.HERE, 'bone_map.json')
JOINTS = {'pelvis': (['pelvis'], ['x', 'y', 'z', 'pitch', 'roll', 'yaw']),
          'lumbar': (['spine_01'], ['flex', 'side', 'twist']),
          'thoracic': (['spine_02', 'spine_03'], ['flex', 'side', 'twist']),
          'neck': (['neck_01'], ['flex', 'side', 'turn']),
          'head': (['head'], ['flex', 'side', 'turn']),
          **{k: v for s in 'lr' for k, v in (
              (f'shoulder_{s}', ([f'upperarm_{s}'], ['flex', 'abd', 'rot'])),
              (f'scapula_{s}', ([f'clavicle_{s}'], ['elev'])),
              (f'elbow_{s}', ([f'lowerarm_{s}'], ['flex', 'pron'])),
              (f'wrist_{s}', ([f'hand_{s}'], ['flex', 'dev'])),
              (f'hip_{s}', ([f'thigh_{s}'], ['flex', 'abd', 'rot'])),
              (f'knee_{s}', ([f'calf_{s}'], ['flex'])),
              (f'ankle_{s}', ([f'foot_{s}'], ['flex', 'inv'])))}}
SOURCES = ['MakeHuman (MPFB2) game-engine rig and skin weights, CC0, fitted to the Z-Anatomy bones by tools/pipeline/v5/pose.py',
           'Joint pivots fitted to Z-Anatomy bone ends (CC BY-SA 4.0): spheres on the humeral head, distal humerus, '
           'femoral head and distal femur; lowest 5% of the radius and tibia (rig.py)']


# ---------- skeleton ----------
def sphere(X):
    """Least-squares sphere through points: (centre, radius)."""
    A = np.c_[2 * X, np.ones(len(X))]
    s = np.linalg.lstsq(A, (X ** 2).sum(1), rcond=None)[0]
    return s[:3], float(np.sqrt(s[3] + s[:3] @ s[:3]))


def joint_centres(parts, attr='pos'):
    """§2b.6: limb pivots from the bone ends (attr 'posF' = the warped female anatomy): bone -> centre."""
    P = {p.name: np.asarray(getattr(p, attr), np.float64) for p in parts if p.kind == 'bone'}
    out = {}
    for s in 'lr':
        hu, fe = P[f'Humerus.{s}'], P[f'Femur.{s}']
        top = fe[fe[:, 1] >= fe[:, 1].max() - 0.06]
        ax = np.abs(top[:, 0])
        head = top[ax <= ax[np.argmax(top[:, 1])] + 0.015]  # femoral head = medial top; the greater trochanter is lateral
        out[f'upperarm_{s}'] = sphere(hu[hu[:, 1] >= hu[:, 1].max() - 0.04])[0]
        out[f'lowerarm_{s}'] = sphere(hu[hu[:, 1] <= hu[:, 1].min() + 0.03])[0]
        out[f'hand_{s}'] = pose._end(P[f'Radius.{s}'], False)
        out[f'thigh_{s}'] = sphere(head)[0]
        out[f'calf_{s}'] = sphere(fe[fe[:, 1] <= fe[:, 1].min() + 0.03])[0]
        out[f'foot_{s}'] = pose._end(P[f'Tibia.{s}'], False)
    return out


def skeleton(pz, parts):
    """{sex: (heads, tails)} as (22, 3) arrays in BONES order: the posed game rig from pose.npz, limb heads snapped to the
    anatomy pivots (a parent tail that met the old head moves with it; a bone with no driven child moves whole)."""
    names = [str(n) for n in pz['rigNames']]
    out = {}
    for sex, key, attr in (('M', 'rigM', 'pos'), ('F', 'rigF', 'posF')):
        R = np.asarray(pz[key], np.float64)
        H = {b: R[names.index(b), 0].copy() for b in BONES}
        T = {b: R[names.index(b), 1].copy() for b in BONES}
        for b, c in joint_centres(parts, attr).items():
            par = parent(b)
            if np.linalg.norm(T[par] - H[b]) < 0.01:
                T[par] = c.copy()
            if not any(parent(k) == b for k in BONES):  # hand: no driven child, keeps MakeHuman's direction and length
                T[b] = T[b] + c - H[b]
            H[b] = c
        out[sex] = (np.array([H[b] for b in BONES]), np.array([T[b] for b in BONES]))
    return out


@functools.lru_cache(None)
def game_rig():
    with open(os.path.join(pose.DATA, 'rigs/standard/rig.game_engine.json')) as f:
        return json.load(f)


def parent(b):
    """Nearest ancestor of b that is in BONES; None for the pelvis."""
    rig = game_rig()
    p = rig[b]['parent']
    while p and p not in BONES:
        p = rig[p]['parent']
    return p or None


def fold(b):
    """Game-rig bone -> itself if in BONES, else its nearest BONES ancestor (fingers -> hand, Root -> pelvis)."""
    while b and b not in BONES:
        b = game_rig()[b]['parent']
    return b or 'pelvis'


# ---------- posing (§2b.1-5, 2b.13): the numpy reference the app's src/rig/skeleton.ts matches ----------
# §2b.4 semantic signs. axis -> (Euler slot, sign on the left side and midline, sign on the right side), in the parent
# segment's anatomical frame (X = body left, Y = up, Z = front). Rz(+) swings a down-pointing segment toward +X, Rx(+)
# swings it back (-Z), Ry(+) turns the front (+Z) toward +X.
SIGN = {'flex': ('x', -1, -1), 'abd': ('z', 1, -1), 'dev': ('z', 1, -1), 'inv': ('z', -1, 1), 'rot': ('y', -1, 1),
        'pron': ('y', -1, 1), 'side': ('z', -1, -1), 'twist': ('y', 1, 1), 'turn': ('y', 1, 1), 'pitch': ('x', 1, 1),
        'roll': ('z', -1, -1), 'yaw': ('y', 1, 1), 'elev': ('z', 1, -1)}
FLEX_UP = ('lumbar', 'thoracic', 'neck', 'head', 'knee')  # flex = Rx(+): trunk forward, heel back; other flex = Rx(-)
ROOT_OFFSET = ('x', 'y', 'z')  # Pose.root metres, not angles


def zero_dir(b):
    """§2b.3 anatomical-zero direction of bone b (head -> tail): straight down for the limb bones (upperarm, lowerarm,
    hand, thigh, calf). None for every other bone (§2b.0a: pelvis, spine, neck, head, clavicle, foot, ball): its fitted
    standing orientation is its zero."""
    return np.array([0, -1.0, 0]) if b.startswith(('upperarm', 'lowerarm', 'hand', 'thigh', 'calf')) else None


def bind_rotations(H, T):
    """(22, 3, 3) R_bind: minimal rotation from each bone's zero_dir to its bind direction (head -> tail); identity for
    the bones whose zero is their fitted orientation."""
    return np.array([np.eye(3) if zero_dir(b) is None else pose.rot_between(zero_dir(b), T[i] - H[i])
                     for i, b in enumerate(BONES)])


def euler(z=0.0, x=0.0, y=0.0):
    """§2b.1: intrinsic Z, then X, then Y, degrees: Rz @ Rx @ Ry."""
    (cz, sz), (cx, sx), (cy, sy) = ((np.cos(a), np.sin(a)) for a in np.radians([z, x, y]))
    return (np.array([[cz, -sz, 0], [sz, cz, 0], [0, 0, 1]]) @ np.array([[1, 0, 0], [0, cx, -sx], [0, sx, cx]])
            @ np.array([[cy, 0, sy], [0, 1, 0], [-sy, 0, cy]]))


def joint_rotation(key, axes):
    """One joint's local rotation from semantic angles (degrees, §2b.4) in its parent segment's anatomical frame.
    key: jointKey ('pelvis' for Pose.root, whose x/y/z offsets are skipped)."""
    a = {'x': 0.0, 'y': 0.0, 'z': 0.0}
    for ax, v in axes.items():
        if key == 'pelvis' and ax in ROOT_OFFSET:
            continue
        slot, left, right = SIGN[ax]
        a[slot] += (1 if ax == 'flex' and key.rsplit('_', 1)[0] in FLEX_UP else right if key.endswith('_r') else left) * v
    return euler(a['z'], a['x'], a['y'])


def arm_elevation(R):
    """§2b.13: degrees between a commanded upper-arm local rotation's segment (R @ down) and straight down."""
    return float(np.degrees(np.arccos(np.clip(R[1, 1], -1, 1))))


def local_rotations(p):
    """(22, 3, 3) local rotations for a Pose dict {root, joints}. Thoracic angles split 50/50 over spine_02/spine_03.
    §2b.13: the clavicle is derived (elev = max(0, elevation - 30) / 3; any scapula angles in the pose are ignored)
    and the shoulder is re-solved (R_clav^-1 @ R_desired) so the arm keeps its commanded direction."""
    L = np.tile(np.eye(3), (len(BONES), 1, 1))
    L[0] = joint_rotation('pelvis', p.get('root', {}))
    for key, axes in p.get('joints', {}).items():
        if key.startswith('scapula'):
            continue
        bones = JOINTS[key][0]
        R = joint_rotation(key, {a: v / len(bones) for a, v in axes.items()})
        for b in bones:
            L[BONES.index(b)] = R
    for s in 'lr':
        c, u = BONES.index(f'clavicle_{s}'), BONES.index(f'upperarm_{s}')
        L[c] = joint_rotation(f'scapula_{s}', {'elev': max(0.0, arm_elevation(L[u]) - 30) / 3})
        L[u] = L[c].T @ L[u]
    return L


def fk(p, H, T):
    """Forward kinematics (§2b.3) for a Pose dict on one sex's bind skeleton H, T ((22, 3) heads/tails, BONES order).
    R_world(b) = R_world(parent) @ L(b); all-zero angles = anatomical zero. Skin transform per bone: v' = Rs @ v + ts with
    Rs = R_world @ R_bind^-1 and ts = head_posed - Rs @ head_bind (= T(head_posed) R_world R_bind^-1 T(-head_bind)).
    The pelvis head moves by root x/y/z (metres from rest, §2b.5); each other head rides on its parent's skin transform.
    Returns (R_world, Rs, ts): (22, 3, 3), (22, 3, 3), (22, 3). No grounding (see ground)."""
    L, Rb = local_rotations(p), bind_rotations(H, T)
    Rw, Rs, ts = np.zeros_like(L), np.zeros_like(L), np.zeros((len(BONES), 3))
    r = p.get('root', {})
    for i, b in enumerate(BONES):
        par = parent(b)
        if par is None:
            Rw[i], head = L[i], H[i] + [r.get(k, 0.0) for k in ROOT_OFFSET]
        else:
            j = BONES.index(par)
            Rw[i], head = Rw[j] @ L[i], Rs[j] @ H[i] + ts[j]
        Rs[i] = Rw[i] @ Rb[i].T
        ts[i] = head - Rs[i] @ H[i]
    return Rw, Rs, ts


PIN_BONES = {'ground': ('foot_l', 'foot_r', 'ball_l', 'ball_r'), 'flat': ('foot_l', 'foot_r', 'ball_l', 'ball_r'),
             'toes': ('ball_l', 'ball_r'), 'toeL': ('ball_l',), 'toeR': ('ball_r',),
             'hands': ('hand_l', 'hand_r', 'foot_l', 'foot_r', 'ball_l', 'ball_r')}


def ground(p, Rs, ts, H, T):
    """§2b.5: (3,) shift for the pose's pin. hands with pinAt: the left wrist (hand_l head) goes to pinAt (the
    prototype's hang). Otherwise a y shift that puts the lowest posed head/tail point of the pinned bones at
    y = pinAt[1] (else 0): ground/flat = feet (foot + ball), toes = balls, toeL/toeR = that ball, hands = hands or feet,
    whichever is lower. Zero for none."""
    pin, at = p.get('pin', 'none'), p.get('pinAt')
    if pin == 'hands' and at:
        i = BONES.index('hand_l')
        return np.asarray(at, np.float64) - (Rs[i] @ H[i] + ts[i])
    if pin not in PIN_BONES:
        return np.zeros(3)
    k = [BONES.index(b) for b in PIN_BONES[pin]]
    pts = np.concatenate([np.einsum('nij,nj->ni', Rs[k], X[k]) + ts[k] for X in (H, T)])
    return np.array([0.0, (at or [0, 0, 0])[1] - pts[:, 1].min(), 0.0])


def skin_rotation(bi, bw, Rs):
    """(n, 3, 3) blended LBS rotation per vertex: sum of w * Rs[bone]."""
    return sum((bw[:, k] / 255.0)[:, None, None] * Rs[bi[:, k]] for k in range(4))


def lbs(V, bi, bw, Rs, ts):
    """Linear blend skinning with the weights pack's (bi, bw) uint8 (n, 4); bw sums to 255."""
    return sum((bw[:, k] / 255.0)[:, None] * (np.einsum('nij,nj->ni', Rs[bi[:, k]], V) + ts[bi[:, k]]) for k in range(4))


# ---------- weights ----------
def smoothstep(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)


def seg_dist(V, H, T):
    """(n, k) distance from each point to each segment H[j]->T[j]."""
    d = T - H
    t = np.clip(((V[:, None] - H) * d).sum(2) / (d * d).sum(1), 0, 1)
    return np.linalg.norm(V[:, None] - (H + t[..., None] * d), axis=2)


def chain_weights(V, H, T, blend=BLEND):
    """(n, k) weights along a chain of segments: each vertex goes to its nearest segment, blended (smoothstep) into the
    neighbour within ±blend of the joint, measured along the mean direction of the two segments (along the distal
    segment where the chain folds back by more than 120°, e.g. pelvis -> thigh, where the mean points across the limb)."""
    V = np.asarray(V, np.float64)
    i = seg_dist(V, H, T).argmin(1)
    W = np.zeros((len(V), len(H)))
    W[np.arange(len(V)), i] = 1
    u = (T - H) / np.linalg.norm(T - H, axis=1, keepdims=True)
    for j in range(1, len(H)):
        ax = u[j] if u[j - 1] @ u[j] < -0.5 else (u[j - 1] + u[j]) / np.linalg.norm(u[j - 1] + u[j])
        f = smoothstep(-blend, blend, (V - H[j]) @ ax)  # share of bone j at the joint between j-1 and j
        a, b = i == j, i == j - 1
        W[a, j - 1] += 1 - f[a]
        W[a, j] -= 1 - f[a]
        W[b, j] += f[b]
        W[b, j - 1] -= f[b]
    W = np.clip(W, 0, None)
    return W / W.sum(1, keepdims=True)


def quantize(W, cols):
    """(n, k) float weights over bone indices cols -> (bi, bw) uint8 (n, 4): top 4, renormalised, bw sums to 255."""
    W = np.c_[W, np.zeros((len(W), max(0, 4 - W.shape[1])))]
    cols = np.r_[np.asarray(cols), np.zeros(max(0, 4 - len(cols)), int)]
    o = np.argsort(-W, axis=1, kind='stable')[:, :4]
    w = np.take_along_axis(W, o, 1)
    w /= w.sum(1, keepdims=True)
    q = np.floor(w * 255 + 0.5).astype(int)
    q[:, 0] += 255 - q.sum(1)
    bi = np.where(q > 0, cols[o], 0)
    return bi.astype(np.uint8), q.astype(np.uint8)


def skin_weights(n):
    """MakeHuman's game-engine weights folded onto BONES (fingers into the hand), as (bi, bw)."""
    _, _, WM = pose.load_rig()
    W = np.zeros((n, len(BONES)))
    for b, (idx, w) in WM.items():
        W[idx, BONES.index(fold(b))] += w
    return quantize(W, np.arange(len(BONES)))


def gradient_weights(V, H, T, w=GRADIENT_W):
    """§2b.0b: (n, k) full-length gradient for a part whose vertices span two or more chain segments beyond the 4 cm
    blend (some vertex fully on each of two bones); None otherwise. t in [0, 1] runs along the part's own long axis
    (PCA) from the end nearer the chain root (H[0]); each joint crossed (between the first and last fully-held bone)
    hands weight to its distal bone by smoothstep(tj - w, tj + w, t), tj = the joint head projected on that axis."""
    pure = np.nonzero((chain_weights(V, H, T) >= 1 - 1e-9).any(0))[0]
    if len(pure) < 2:
        return None
    c = V.mean(0)
    a = np.linalg.svd(V - c, full_matrices=False)[2][0]
    s = (V - c) @ a
    if np.linalg.norm(c + s.min() * a - H[0]) > np.linalg.norm(c + s.max() * a - H[0]):
        a, s = -a, -s
    lo, L = s.min(), np.ptp(s)
    t, tj = (s - lo) / L, ((H - c) @ a - lo) / L
    W, rest = np.zeros((len(V), len(H))), np.ones(len(V))
    for j in range(pure[0] + 1, pure[-1] + 1):
        f = smoothstep(tj[j] - w, tj[j] + w, t)
        W[:, j - 1], rest = rest * (1 - f), rest * f
    W[:, pure[-1]] = rest
    return W


def vertex_weights(p, H, T):
    """§2b.10 chain weights for one part (male rest positions): (bi, bw). Muscles spanning two or more segments get the
    §2b.0b full-length gradient instead of the 4 cm and sideways rules."""
    V = np.asarray(p.pos, np.float64)
    k = lambda names: [BONES.index(b) for b in names]
    seg = lambda names: chain_weights(V, H[k(names)], T[k(names)])
    grad = lambda names: gradient_weights(V, H[k(names)], T[k(names)]) if p.kind == 'muscle' else None
    if SIDEWAYS.search(p.plain) and p.side != 'center':
        s = p.side[0]
        names = CHAINS[f'arm_{s}']
        W = grad(names)
        if W is None:
            med, lat = names[:2], names[2:]
            f = smoothstep(-BLEND, BLEND, np.abs(V[:, 0]) - abs(H[BONES.index(f'upperarm_{s}'), 0]))[:, None]
            W = np.c_[(1 - f) * seg(med), f * seg(lat)]
    elif p.region not in LIMB or p.side != 'center':
        names = chain_of(p)
        W = grad(names)
        if W is None:
            W = seg(names)
    else:
        W, names = midline_weights(V, H, T, p.region)
    return quantize(W, k(names))


def chain_of(p):
    """§2b.10 chain for a part: sideways (thorax-to-arm) muscles -> arm of their side; else by region."""
    if SIDEWAYS.search(p.plain) and p.side != 'center':
        return CHAINS[f'arm_{p.side[0]}']
    return CHAINS['axial'] if p.region not in LIMB else CHAINS[f'{LIMB[p.region]}_{p.side[0]}']


def midline_weights(V, H, T, region, blend=BLEND):
    """A midline part in a limb region (e.g. pubic symphysis): per vertex by side of the midline. (W, chain names)."""
    k = lambda names: [BONES.index(b) for b in names]
    cl, cr = CHAINS[f'{LIMB[region]}_l'], CHAINS[f'{LIMB[region]}_r']
    left = (V[:, 0] >= 0)[:, None]
    return np.c_[chain_weights(V, H[k(cl)], T[k(cl)], blend) * left,
                 chain_weights(V, H[k(cr)], T[k(cr)], blend) * ~left], cl + cr


def rigid_weights(p, H, T):
    """R11 fallback for one part: each vertex to its single nearest bone of its chain (§2b.10), blended only at the
    joint caps (smoothstep ±RIGID_BLEND). No gradient or sideways rule. (bi, bw)."""
    V = np.asarray(p.pos, np.float64)
    if p.region in LIMB and p.side == 'center':
        W, names = midline_weights(V, H, T, p.region, RIGID_BLEND)
    else:
        names = chain_of(p)
        k = [BONES.index(b) for b in names]
        W = chain_weights(V, H[k], T[k], RIGID_BLEND)
    return quantize(W, [BONES.index(b) for b in names])


def nearest(c, H, T, names=BONES):
    k = [BONES.index(b) for b in names]
    return k[int(seg_dist(c[None], H[k], T[k]).argmin())]


def map_bone(p, rules):
    """Bone index from bone_map.json for a bone part, or None if no pattern matches."""
    for pat, b in rules:
        if re.search(pat, p.plain, re.I):
            if b in BONES:
                return BONES.index(b)
            s = p.side[0] if p.side != 'center' else ('l' if p.pos[:, 0].mean() >= 0 else 'r')
            return BONES.index(f'{b}_{s}')
    return None


def build(parts, pz):
    """(rig.json dict, {part id: (bi, bw)} for WEIGHTED parts, the same for the R11 rigid fallback, unmatched bone part
    names). Skin keeps MakeHuman's weights in both sets."""
    sk = skeleton(pz, parts)
    H, T = sk['M']
    with open(BONE_MAP) as f:
        rules = json.load(f)['map']
    part_bone, weights, rigid, unmatched = {}, {}, {}, []
    for p in sorted(parts, key=lambda p: p.id):
        c = np.asarray(p.pos, np.float64).mean(0)
        if p.kind == 'bone':
            k = map_bone(p, rules)
            if k is None:
                k = nearest(c, H, T)
                unmatched.append(p.name)
                print(f'bone_map unmatched: {p.name} -> {BONES[k]} (nearest)')
            part_bone[str(p.id)] = k
        elif p.kind == 'organ':
            part_bone[str(p.id)] = nearest(c, H, T, TRUNK)
        elif p.kind == 'skin':
            weights[p.id] = rigid[p.id] = skin_weights(len(p.pos))
        elif p.kind in WEIGHTED:
            weights[p.id] = vertex_weights(p, H, T)
            rigid[p.id] = rigid_weights(p, H, T)
        else:
            raise ValueError(f'no skinning rule for kind {p.kind} ({p.name})')
    r5 = lambda a: np.round(a, 5).tolist()
    bones = [{'name': b, 'parent': parent(b), 'headM': r5(sk['M'][0][i]), 'tailM': r5(sk['M'][1][i]),
              'headF': r5(sk['F'][0][i]), 'tailF': r5(sk['F'][1][i])} for i, b in enumerate(BONES)]
    joints = {k: {'bones': b, 'axes': a, **({'derived': True} if k.startswith('scapula') else {})}
              for k, (b, a) in JOINTS.items()}
    js = {'version': 1, 'sources': SOURCES, 'bones': bones, 'joints': joints, 'partBone': part_bone}
    return js, weights, rigid, unmatched


def run(ctx):
    js, weights, rigid, unmatched = build(ctx['parts'], ctx['pose'])
    os.makedirs(body.OUT, exist_ok=True)
    with open(os.path.join(body.OUT, 'rig.json'), 'w') as f:
        json.dump(js, f, separators=(',', ':'))
    ctx['rig'] = {'json': js, 'weights': weights, 'rigid': rigid, 'unmatched': unmatched}
    return ctx
