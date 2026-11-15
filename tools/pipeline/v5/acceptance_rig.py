"""R10 acceptance on the built data (TEST_PLAN A5), kept out of `npm run test:pipeline` (not matched by test_*.py):

tools/pipeline/.venv/bin/python -I -m unittest discover -s tools/pipeline/v5 -t tools/pipeline -p 'acceptance_rig.py' -v

RIG_METRICS=1 also writes plans/raw/rig-metrics.md (smooth vs the R11 rigid set from the pipeline cache)."""
import json
import os
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import numpy as np

from v5 import pack, rig
from v5.body import CACHE
from v5.test_rig import DATA, ROOT, rig_json, skeleton_of

METRICS = ROOT / 'docs' / 'done_development' / 'r3-rig-move' / 'plans' / 'raw' / 'rig-metrics.md'
LIMB_PAIRS = [(f'{a}.{s}', f'{b}.{s}') for s in 'lr' for a, b in (
    ('Humerus', 'Radius'), ('Humerus', 'Ulna'), ('Femur', 'Tibia'), ('Tibia', 'Talus'), ('Femur', 'Hip bone'))]


class Acceptance(unittest.TestCase):
    """R10 / §2b.6-8 on the built data, both sexes: per-part tear and flip on the muscles, articulation gaps."""
    TEAR, FLIP, GAP = 0.02, 0.01, 0.01

    @classmethod
    def setUpClass(cls):
        from scipy.spatial import cKDTree
        out = str(DATA / 'body')
        with open(DATA / 'body' / 'manifest.json') as f:
            man = json.load(f)
        with open(DATA / 'poses_acceptance.json') as f:
            cls.poses = json.load(f)['poses']
        with open(DATA / 'joints.json') as f:
            cls.limits = json.load(f)['joints']
        with open(pack.RIGID_ENTRY) as f:
            rigid_entry = json.load(f)
        js = rig_json()
        names = {p['id']: p['name'] for p in man['parts']}
        mu, bo = pack.unpack(out, man, 'muscle'), pack.unpack(out, man, 'bone')
        sets = {'weights': pack.unpack_weights(out, man['rig']['weights'])['muscle'],
                'weightsRigid': pack.unpack_weights(CACHE, rigid_entry)['muscle']}
        idx = mu['idx'].astype(np.int64)
        E = np.unique(np.sort(np.concatenate([idx[:, [0, 1]], idx[:, [1, 2]], idx[:, [2, 0]]]), 1), axis=0)
        emid, tmid = mu['mid'][E[:, 0]], mu['mid'][idx[:, 0]]
        bone_id = {n: i for i, n in names.items()}
        cls.rows, cls.results, cls.rigid = [], {}, {}
        for sex in ('M', 'F'):
            H, T = skeleton_of(js, sex)
            V0, B0 = mu['pos' + sex], bo['pos' + sex]
            n0 = np.cross(V0[idx[:, 1]] - V0[idx[:, 0]], V0[idx[:, 2]] - V0[idx[:, 0]])
            okt = np.linalg.norm(n0, axis=1) > 1e-12
            l0 = np.linalg.norm(V0[E[:, 0]] - V0[E[:, 1]], axis=1)
            oke = l0 > 1e-6
            bones = {n: B0[bo['mid'] == bone_id[n]] for pair in LIMB_PAIRS for n in pair}
            gap0 = {pr: cKDTree(bones[pr[0]]).query(bones[pr[1]])[0].min() for pr in LIMB_PAIRS}
            for ps in cls.poses:
                p = ps['pose']
                _, Rs, ts = rig.fk(p, H, T)
                ts = ts + rig.ground(p, Rs, ts, H, T)
                measured = {}
                for key, (bi, bw) in sets.items():
                    V1 = rig.lbs(V0, bi, bw, Rs, ts)
                    tear = np.linalg.norm(V1[E[:, 0]] - V1[E[:, 1]], axis=1) > 2 * l0
                    Rv = rig.skin_rotation(bi, bw, Rs)
                    Rt = (Rv[idx[:, 0]] + Rv[idx[:, 1]] + Rv[idx[:, 2]]) / 3
                    r0 = np.einsum('nij,nj->ni', Rt, n0)
                    n1 = np.cross(V1[idx[:, 1]] - V1[idx[:, 0]], V1[idx[:, 2]] - V1[idx[:, 0]])
                    cos = (r0 * n1).sum(1) / (np.linalg.norm(r0, axis=1) * np.linalg.norm(n1, axis=1) + 1e-30)
                    flip = cos < -0.5
                    measured[key] = (cls.worst(tear[oke], emid[oke], names), cls.worst(flip[okt], tmid[okt], names))
                (tp, fp), (rtp, rfp) = measured['weights'], measured['weightsRigid']
                gaps = {}
                for a, b in LIMB_PAIRS:
                    m = {n: Rs[js['partBone'][str(bone_id[n])]] for n in (a, b)}
                    t = {n: ts[js['partBone'][str(bone_id[n])]] for n in (a, b)}
                    X = {n: bones[n] @ m[n].T + t[n] for n in (a, b)}
                    gaps[(a, b)] = abs(cKDTree(X[a]).query(X[b])[0].min() - gap0[(a, b)])
                gp = max(gaps.items(), key=lambda kv: kv[1])
                cls.results[(ps['id'], sex)] = (tp, fp, gp)
                cls.rigid[(ps['id'], sex)] = (rtp, rfp, gp)
                pct = lambda x: f'{x[0]} {100 * x[1]:.3f}%'
                cls.rows.append(f"| {ps['id']} | {sex} | {pct(tp)} | {pct(fp)} | {pct(rtp)} | {pct(rfp)} | "
                                f"{gp[0][0]}-{gp[0][1]} {100 * gp[1]:.2f} cm |")
        table = ('| pose | sex | smooth worst tear | smooth worst flip | rigid worst tear | rigid worst flip | '
                 'max articulation gap change (both sets) |\n|---|---|---|---|---|---|---|\n' + '\n'.join(cls.rows))
        print('\n' + table, flush=True)
        if os.environ.get('RIG_METRICS') != '1':
            return
        METRICS.parent.mkdir(parents=True, exist_ok=True)
        METRICS.write_text(
            '# R3 rig metrics: smooth vs rigid weights\n\nWritten by tools/pipeline/v5/acceptance_rig.py (RIG_METRICS=1) '
            'on the built data. Per pose and sex: the muscle part with the highest share of edges stretched > 2x rest '
            '(tear, limit 2%) and of triangles flipped against the skin-rotated rest normal (flip, limit 1%), for '
            'the smooth weights (weights.bin.gz) and the R11 rigid fallback (tools/pipeline/cache/weights_rigid.bin.gz). '
            'Bones are rigid in both, so the articulation gap is the same for both sets (limit < 1 cm).\n\n' + table + '\n')

    @staticmethod
    def worst(bad, mid, names):
        """(part name, fraction) of the part with the highest fraction of bad elements."""
        ids, inv = np.unique(mid, return_inverse=True)
        frac = np.bincount(inv, bad.astype(float)) / np.bincount(inv)
        k = int(frac.argmax())
        return names[int(ids[k])], float(frac[k])

    def test_ten_poses_within_joint_limits(self):
        self.assertEqual([p['id'] for p in self.poses], ['elbow90', 'elbow140', 'abd90', 'abd170', 'flex90', 'hip90',
                                                         'knee120', 'trunk45', 'squat', 'overhead'])
        for ps in self.poses:
            for j, axes in ps['pose']['joints'].items():
                for a, v in axes.items():
                    lim = self.limits[j][a]
                    self.assertTrue(lim['min'] <= v <= lim['max'], (ps['id'], j, a, v))

    def test_tear_per_part(self):
        bad = {k: v[0] for k, v in self.results.items() if v[0][1] > self.TEAR}
        self.assertFalse(bad, f'muscle parts with > 2% of edges stretched > 2x rest: {bad}')

    def test_flip_per_part(self):
        bad = {k: v[1] for k, v in self.results.items() if v[1][1] > self.FLIP}
        self.assertFalse(bad, f'muscle parts with > 1% of triangles flipped: {bad}')

    def test_articulation_gaps(self):
        bad = {k: v[2] for k, v in self.results.items() if v[2][1] >= self.GAP}
        self.assertFalse(bad, f'articulation gap changed by >= 1 cm: {bad}')


if __name__ == '__main__':
    unittest.main()
