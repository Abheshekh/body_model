# Per-vertex ambient occlusion over the whole body (all groups occlude each other).
import json, numpy as np, trimesh, time
from trimesh.ray.ray_pyembree import RayMeshIntersector
m = json.load(open('site/body.json')); b = open('site/body.bin', 'rb').read(); out = bytearray(b)
G = m['groups']; P, N, F, off = {}, {}, [], 0
for k, g in G.items():
    P[k] = np.frombuffer(b, np.float32, g['pos'][1]//4, g['pos'][0]).reshape(-1, 3)
    N[k] = np.frombuffer(b, np.float32, g['nrm'][1]//4, g['nrm'][0]).reshape(-1, 3)
    F.append(np.frombuffer(b, np.uint32, g['idx'][1]//4, g['idx'][0]).reshape(-1, 3) + off); off += len(P[k])
allP = np.concatenate([P[k] for k in G]); mesh = trimesh.Trimesh(allP, np.concatenate(F), process=False)
rt = RayMeshIntersector(mesh)
rng = np.random.default_rng(1); S = 24
d = rng.normal(size=(S, 3)); d /= np.linalg.norm(d, axis=1, keepdims=True)
t = time.time()
for k in G:
    p, n = P[k], N[k]; n = n / (np.linalg.norm(n, axis=1, keepdims=True) + 1e-9)
    occ = np.zeros(len(p), np.float32)
    for s in range(S):
        dd = np.where((n @ d[s])[:, None] < 0, -d[s], d[s])        # flip into hemisphere
        org = p + n * 0.0015
        locs, ri, _ = rt.intersects_location(org, np.broadcast_to(dd, org.shape), multiple_hits=False)
        dist = np.full(len(p), np.inf); dist[ri] = np.linalg.norm(locs - org[ri], axis=1)
        w = np.clip((n * dd).sum(1), 0, 1)
        occ += w * np.clip(1 - dist / 0.06, 0, 1)                  # 6 cm reach
    ao = np.clip(1 - 2.0 * occ / S, 0.15, 1).astype(np.float32)
    G[k]['ao'] = [len(out), ao.nbytes]; out += ao.tobytes()
    print(k, round(time.time() - t, 1), 's', 'mean ao', ao.mean().round(3))
open('site/body.bin', 'wb').write(out); json.dump(m, open('site/body.json', 'w'))
