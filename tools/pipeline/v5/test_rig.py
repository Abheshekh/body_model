import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import numpy as np

from v5 import pack, rig
from v5.body import Part
from v5.test_pack import part, pose

# synthetic two-segment limb: upper 0 -> -0.3 m, lower -0.3 -> -0.6 m along -y
H = np.array([[0, 0, 0], [0, -0.3, 0]], np.float64)
T = np.array([[0, -0.3, 0], [0, -0.6, 0]], np.float64)


class ChainWeights(unittest.TestCase):
    def test_far_from_joint_has_one_bone(self):
        bi, bw = rig.quantize(rig.chain_weights([[0.02, -0.1, 0], [0.02, -0.5, 0.01]], H, T), [7, 9])
        np.testing.assert_array_equal(bw, [[255, 0, 0, 0], [255, 0, 0, 0]])
        np.testing.assert_array_equal(bi[:, 0], [7, 9])

    def test_at_joint_blends_half(self):
        bi, bw = rig.quantize(rig.chain_weights([[0.03, -0.3, 0]], H, T), [7, 9])
        self.assertEqual(sorted(bi[0, :2].tolist()), [7, 9])
        self.assertLessEqual(abs(int(bw[0, 0]) - int(bw[0, 1])), 1)

    def test_blend_is_monotonic_inside_band(self):
        y = np.linspace(-0.25, -0.35, 11)
        W = rig.chain_weights(np.c_[np.full(11, 0.02), y, np.zeros(11)], H, T)
        self.assertTrue((np.diff(W[:, 1]) >= -1e-12).all())
        self.assertEqual(W[0, 1], 0.0)
        self.assertEqual(W[-1, 1], 1.0)

    def test_folded_chain_blends_along_the_distal_segment(self):
        # pelvis-like segment up, thigh-like segment down: a vertex in front of the thigh, 10 cm below the joint
        Hf, Tf = np.array([[0, 0, 0], [0, 0, 0]], float), np.array([[0, 0.1, -0.03], [0, -0.4, 0]], float)
        W = rig.chain_weights([[0, -0.1, 0.06]], Hf, Tf)
        np.testing.assert_allclose(W, [[0, 1]])

    def test_gradient_for_multi_segment_part(self):
        V = np.c_[np.full(61, 0.02), np.linspace(0, -0.6, 61), np.zeros(61)]  # spans both segments end to end
        W = rig.gradient_weights(V, H, T)
        self.assertAlmostEqual(W[30, 1], 0.5, places=6)  # the joint sits mid-muscle
        self.assertTrue((np.diff(W[:, 1]) >= -1e-12).all())
        self.assertGreater(W[10, 1], 0)  # blend covers most of the muscle (w = 0.35), not 4 cm
        np.testing.assert_allclose(W.sum(1), 1)
        self.assertIsNone(rig.gradient_weights(V[:20], H, T))  # one segment only: keeps the 4 cm rule

    def test_weights_sum_to_255(self):
        V = np.random.default_rng(3).uniform([-0.1, -0.7, -0.1], [0.1, 0.1, 0.1], (500, 3))
        _, bw = rig.quantize(rig.chain_weights(V, H, T), [0, 1])
        self.assertTrue((bw.astype(int).sum(1) == 255).all())

    def test_quantize_keeps_top_four(self):
        W = np.array([[0.05, 0.3, 0.1, 0.2, 0.35]])
        bi, bw = rig.quantize(W, [10, 11, 12, 13, 14])
        self.assertEqual(bi[0].tolist(), [14, 11, 13, 12])
        self.assertEqual(int(bw.astype(int).sum()), 255)


class BoneMap(unittest.TestCase):
    def setUp(self):
        with open(rig.BONE_MAP) as f:
            self.rules = json.load(f)['map']

    def bone(self, plain, side='center', x=0.0):
        p = Part(id=0, name=plain, kind='bone', ancestry=[], pos=np.array([[x, 1.0, 0]]), tri=np.zeros((0, 3)),
                 plain=plain, side=side)
        k = rig.map_bone(p, self.rules)
        return None if k is None else rig.BONES[k]

    def test_examples(self):
        self.assertEqual(self.bone('Humerus', 'left'), 'upperarm_l')
        self.assertEqual(self.bone('Femur', 'right'), 'thigh_r')
        self.assertEqual(self.bone('Vertebra T1'), 'spine_03')
        self.assertEqual(self.bone('Vertebra T10'), 'spine_02')
        self.assertEqual(self.bone('Vertebra L3'), 'spine_01')
        self.assertEqual(self.bone('Atlas (C1)'), 'neck_01')
        self.assertEqual(self.bone('Costal cartilage of first rib', 'left'), 'spine_03')
        self.assertEqual(self.bone('Proximal phalanx of first finger of foot', 'left'), 'ball_l')
        self.assertEqual(self.bone('Distal phalanx of first finger of hand', 'right'), 'hand_r')
        self.assertEqual(self.bone('Talus', 'left'), 'foot_l')
        self.assertEqual(self.bone('Mandible'), 'head')
        self.assertEqual(self.bone('Hip bone', 'right'), 'pelvis')
        self.assertIsNone(self.bone('Thyroid cartilage'))  # -> nearest segment, logged


class Fold(unittest.TestCase):
    def test_fingers_fold_into_hand(self):
        self.assertEqual(rig.fold('index_03_l'), 'hand_l')
        self.assertEqual(rig.fold('thumb_01_r'), 'hand_r')
        self.assertEqual(rig.fold('calf_l'), 'calf_l')
        self.assertIsNone(rig.parent('pelvis'))
        self.assertEqual(rig.parent('upperarm_r'), 'clavicle_r')


class RigidWeights(unittest.TestCase):
    """R11 fallback rule on the built male skeleton: one nearest chain bone per vertex, 1.5 cm blend at joint caps."""

    @classmethod
    def setUpClass(cls):
        cls.H, cls.T = skeleton_of(rig_json(), 'M')

    def weights(self, pts, plain='Biceps brachii', region='Arm', side='left'):
        p = Part(id=0, name=plain, kind='muscle', ancestry=[], pos=np.asarray(pts, float), tri=np.zeros((0, 3)),
                 plain=plain, side=side, region=region)
        bi, bw = rig.rigid_weights(p, self.H, self.T)
        return [{rig.BONES[b]: int(x) for b, x in zip(i, w) if x} for i, w in zip(bi, bw)]

    def point(self, bone, t, off=(0.0, 0.0, 0.03)):
        i = rig.BONES.index(bone)
        return self.H[i] + t * (self.T[i] - self.H[i]) + off

    def test_one_bone_away_from_joints(self):
        self.assertEqual(self.weights([self.point('upperarm_l', 0.5)]), [{'upperarm_l': 255}])
        self.assertEqual(self.weights([self.point('thigh_r', 0.5)], 'Vastus lateralis', 'Leg', 'right'),
                         [{'thigh_r': 255}])

    def test_blend_only_at_the_cap(self):
        u, f = (self.T[i] - self.H[i] for i in (rig.BONES.index('upperarm_l'), rig.BONES.index('lowerarm_l')))
        ax = u / np.linalg.norm(u) + f / np.linalg.norm(f)
        ax /= np.linalg.norm(ax)  # chain_weights' blend axis at the elbow
        side = np.cross(ax, [1.0, 0, 0])
        elbow = self.H[rig.BONES.index('lowerarm_l')] + 0.02 * side / np.linalg.norm(side)
        at = self.weights([elbow])[0]
        self.assertEqual(set(at), {'upperarm_l', 'lowerarm_l'})
        self.assertLessEqual(abs(at['upperarm_l'] - at['lowerarm_l']), 1)
        above = self.weights([elbow - 0.025 * ax])[0]  # 2.5 cm: outside the 1.5 cm cap, inside the smooth 4 cm
        self.assertEqual(above, {'upperarm_l': 255})

    def test_sideways_muscle_takes_the_nearest_arm_bone(self):
        w = self.weights([self.point('upperarm_l', 0.4)], 'Deltoid', 'Chest', 'left')
        self.assertEqual(w, [{'upperarm_l': 255}])


class WeightsPack(unittest.TestCase):
    def test_round_trip_and_count_check(self):
        parts = [part(1, 'muscle', [0, 1, 0.1]), part(2, 'muscle', [-0.1, 0.5, 0]), part(3, 'bone', [0.2, 0.9, 0])]
        rng = np.random.default_rng(0)
        w = {p.id: rig.quantize(rng.random((len(p.pos), 3)), [p.id, 4, 5]) for p in parts[:2]}
        with tempfile.TemporaryDirectory() as out:
            man = pack.write(parts, pose(), out, w)
            self.assertEqual(man['rig']['file'], 'rig.json')
            self.assertNotIn('weights', [p['name'] for p in man['packs']])
            self.assertEqual(list(man['rig']), ['file', 'weights'])  # W-3: no rigid set in the app data
            d = pack.unpack_weights(out, man['rig']['weights'])
            self.assertEqual(list(d), ['muscle'])
            for i in (0, 1):
                np.testing.assert_array_equal(d['muscle'][i], np.concatenate([w[1][i], w[2][i]]))
            w[2] = (w[2][0][:-1], w[2][1][:-1])
            with self.assertRaisesRegex(ValueError, 'weights for muscle'):
                pack.write(parts, pose(), out, w)


ROOT = Path(__file__).resolve().parents[3]
DATA = ROOT / 'public' / 'data'


def rig_json():
    with open(DATA / 'body' / 'rig.json') as f:
        return json.load(f)


def skeleton_of(js, sex):
    return tuple(np.array([b[k + sex] for b in js['bones']], np.float64) for k in ('head', 'tail'))


class Posing(unittest.TestCase):
    """§2b.1-5, 2b.13 on the built male skeleton: semantic signs per side (the same rules src/rig/skeleton.ts tests)."""

    @classmethod
    def setUpClass(cls):
        cls.H, cls.T = skeleton_of(rig_json(), 'M')

    def world(self, joints, root=None):
        return rig.fk({'root': root or {}, 'joints': joints}, self.H, self.T)[0]

    def dir(self, Rw, b, v=None):
        """Posed local vector v, or (None) the bone's segment: its zero direction, else (fitted zero) its bind direction."""
        i = rig.BONES.index(b)
        seg = rig.zero_dir(b) if rig.zero_dir(b) is not None else (self.T[i] - self.H[i]) / np.linalg.norm(self.T[i] - self.H[i])
        return Rw[i] @ (seg if v is None else np.asarray(v, float))

    def test_zero_pose_is_anatomical_zero(self):
        Rw, Rs, ts = rig.fk({'root': {}, 'joints': {}}, self.H, self.T)
        np.testing.assert_allclose(Rw, np.tile(np.eye(3), (22, 1, 1)), atol=1e-12)
        Rb = rig.bind_rotations(self.H, self.T)
        for i, b in enumerate(rig.BONES):  # skin transform takes the bind segment onto its zero direction
            if rig.zero_dir(b) is None:  # pelvis, foot, ball: zero = fitted orientation
                np.testing.assert_allclose(Rs[i], np.eye(3), atol=1e-12)
                continue
            d = Rs[i] @ (self.T[i] - self.H[i])
            np.testing.assert_allclose(d / np.linalg.norm(d), rig.zero_dir(b), atol=1e-9)
            np.testing.assert_allclose(Rb[i] @ rig.zero_dir(b), (self.T[i] - self.H[i]) / np.linalg.norm(self.T[i] - self.H[i]), atol=1e-9)

    def test_euler_order_is_z_then_x_then_y(self):
        np.testing.assert_allclose(rig.euler(30, 40, 50), rig.euler(z=30) @ rig.euler(x=40) @ rig.euler(y=50), atol=1e-12)

    def test_semantic_signs(self):
        F, L, U = [0, 0, 1], [1, 0, 0], [0, -1, 0]  # front, body left, sole normal (down)
        checks = [  # (joints, bone, local vector or None = segment, component, expected sign)
            ({'shoulder_l': {'flex': 30}}, 'upperarm_l', None, 2, 1), ({'shoulder_r': {'flex': 30}}, 'upperarm_r', None, 2, 1),
            ({'shoulder_l': {'abd': 30}}, 'upperarm_l', None, 0, 1), ({'shoulder_r': {'abd': 30}}, 'upperarm_r', None, 0, -1),
            ({'shoulder_l': {'rot': 30}}, 'upperarm_l', F, 0, -1), ({'shoulder_r': {'rot': 30}}, 'upperarm_r', F, 0, 1),
            ({'hip_l': {'flex': 30}}, 'thigh_l', None, 2, 1), ({'hip_r': {'abd': 30}}, 'thigh_r', None, 0, -1),
            ({'hip_l': {'rot': 30}}, 'thigh_l', F, 0, -1), ({'hip_r': {'rot': 30}}, 'thigh_r', F, 0, 1),
            ({'elbow_l': {'flex': 30}}, 'lowerarm_l', None, 2, 1), ({'elbow_r': {'pron': 30}}, 'lowerarm_r', F, 0, 1),
            ({'knee_r': {'flex': 30}}, 'calf_r', None, 2, -1), ({'ankle_l': {'flex': 15}}, 'foot_l', F, 1, 1),
            ({'ankle_l': {'inv': 15}}, 'foot_l', U, 0, -1), ({'ankle_r': {'inv': 15}}, 'foot_r', U, 0, 1),
            ({'wrist_l': {'flex': 30}}, 'hand_l', None, 2, 1), ({'wrist_l': {'dev': 15}}, 'hand_l', None, 0, 1),
            ({'wrist_r': {'dev': 15}}, 'hand_r', None, 0, -1),
            ({'lumbar': {'flex': 20}}, 'spine_01', None, 2, 1), ({'lumbar': {'side': 20}}, 'spine_01', None, 0, 1),
            ({'thoracic': {'twist': 20}}, 'spine_03', F, 0, 1), ({'neck': {'turn': 20}}, 'neck_01', F, 0, 1),
            ({'head': {'flex': 20}}, 'head', None, 2, 1)]
        for joints, b, v, c, sign in checks:
            with self.subTest(joints=joints):
                self.assertEqual(np.sign(self.dir(self.world(joints), b, v)[c]), sign)
        Rw = self.world({}, {'pitch': 10, 'roll': 10, 'yaw': 10})
        self.assertGreater(self.dir(Rw, 'pelvis', [0, 1, 0])[2], 0)  # top forward
        self.assertGreater((Rw[0] @ [-1, 0, 0])[1], 0)  # right hip up
        self.assertGreater((Rw[0] @ F)[0], 0)  # turns left

    def test_thoracic_splits_half_over_two_bones(self):
        Rw = self.world({'thoracic': {'flex': 30}})
        np.testing.assert_allclose(Rw[rig.BONES.index('spine_02')], rig.euler(x=15), atol=1e-12)
        np.testing.assert_allclose(Rw[rig.BONES.index('spine_03')], rig.euler(x=30), atol=1e-12)

    def test_scapula_follows_elevation_and_arm_keeps_direction(self):
        for s, sh in (('l', {'abd': 120}), ('r', {'flex': 150, 'abd': 20, 'rot': 10}), ('l', {'abd': 20})):
            Rw = self.world({f'shoulder_{s}': sh, f'scapula_{s}': {'elev': 40}})  # scapula input ignored (derived)
            want = rig.joint_rotation(f'shoulder_{s}', sh)
            e = rig.arm_elevation(want)
            np.testing.assert_allclose(Rw[rig.BONES.index(f'upperarm_{s}')], want, atol=1e-12)
            clav, rest = self.dir(Rw, f'clavicle_{s}'), self.dir(np.tile(np.eye(3), (22, 1, 1)), f'clavicle_{s}')
            up = np.degrees(np.arctan2(clav[1], abs(clav[0])) - np.arctan2(rest[1], abs(rest[0])))  # about frame Z
            self.assertAlmostEqual(up, max(0, e - 30) / 3, places=9)

    def test_root_is_a_delta_and_ground_pins(self):
        p = {'root': {'y': 0.1, 'x': 0.02}, 'joints': {}}
        _, Rs, ts = rig.fk(p, self.H, self.T)
        np.testing.assert_allclose(Rs[0] @ self.H[0] + ts[0], self.H[0] + [0.02, 0.1, 0], atol=1e-12)
        k = [rig.BONES.index(b) for b in ('foot_l', 'foot_r', 'ball_l', 'ball_r')]
        for pin, at, want in (('ground', None, 0.0), ('flat', [0, 0.3, 0], 0.3)):
            g = rig.ground({**p, 'pin': pin, **({'pinAt': at} if at else {})}, Rs, ts, self.H, self.T)
            low = min((Rs[i] @ X[i] + ts[i])[1] for i in k for X in (self.H, self.T))
            self.assertAlmostEqual(low + g[1], want, places=12)
            self.assertEqual((g[0], g[2]), (0.0, 0.0))
        np.testing.assert_array_equal(rig.ground(p, Rs, ts, self.H, self.T), [0, 0, 0])

    def test_hands_pin_hangs_the_left_wrist_at_pin_at(self):
        p = {'root': {}, 'joints': {'shoulder_l': {'abd': 165}, 'shoulder_r': {'abd': 165}}, 'pin': 'hands',
             'pinAt': [0.35, 2.15, 0]}
        _, Rs, ts = rig.fk(p, self.H, self.T)
        ts = ts + rig.ground(p, Rs, ts, self.H, self.T)
        i = rig.BONES.index('hand_l')
        np.testing.assert_allclose(Rs[i] @ self.H[i] + ts[i], [0.35, 2.15, 0], atol=1e-12)


if __name__ == '__main__':
    unittest.main()
