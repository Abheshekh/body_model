import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import numpy as np
import trimesh

from v5 import names, sex
from v5.body import Part


def part(i, name, kind, ancestry=(), y=1.0):
    m = trimesh.creation.icosphere(1, 0.02)
    return Part(id=i, name=name, kind=kind, ancestry=list(ancestry), pos=m.vertices + [0, y, 0], tri=m.faces)


def grid_skin(n=12):
    """Tiny quad grid standing in for the MakeHuman skin (x -0.3..0.3, y 0..1.8, z 0.1)."""
    xs, ys = np.meshgrid(np.linspace(-0.3, 0.3, n), np.linspace(0, 1.8, n))
    V = np.stack([xs.ravel(), ys.ravel(), np.full(n * n, 0.1)], 1).astype(np.float32)
    F = [[r * n + c, r * n + c + 1, (r + 1) * n + c + 1, (r + 1) * n + c] for r in range(n - 1) for c in range(n - 1)]
    return V, np.array(F, np.int32)


class WarpTest(unittest.TestCase):
    def test_constant_D_moves_by_c(self):
        skin = np.random.default_rng(0).random((200, 3)).astype(np.float32)
        c = np.array([0.01, -0.02, 0.03], np.float32)
        P = np.random.default_rng(1).random((50, 3))
        out = sex.warp_points(P, skin, np.tile(c, (200, 1)))
        np.testing.assert_allclose(out - P, np.tile(c, (50, 1)), atol=1e-6)

    def test_fewer_skin_points_than_k(self):
        out = sex.warp_points(np.zeros((3, 3)), np.zeros((1, 3)), np.ones((1, 3)))
        np.testing.assert_allclose(out, np.ones((3, 3)))


class SexRegexTest(unittest.TestCase):
    def test_male_only(self):
        self.assertTrue(sex.MALE_ONLY.search('prostate'))
        self.assertFalse(sex.MALE_ONLY.search('rectum'))

    def test_external(self):
        self.assertTrue(sex.EXTERNAL.search('Penis'))
        self.assertFalse(sex.EXTERNAL.search('Prostate'))


class NamesTest(unittest.TestCase):
    def test_heart_rule(self):
        heart = ['Cardiovascular system', 'Heart']
        lv = part(0, 'left ventricle of heart', 'vessel', heart, 1.3)
        lca = part(1, 'left coronary artery', 'vessel', heart, 1.3)
        names.annotate([lv, lca])
        self.assertEqual((lv.kind, lv.system), ('organ', 'Heart'))
        self.assertEqual((lca.kind, lca.system), ('vessel', 'Arteries'))

    def test_heart_rule_needs_heart_ancestry(self):
        p = part(0, 'Valve of something', 'vessel', ['Veins'])
        names.annotate([p])
        self.assertEqual(p.kind, 'vessel')

    def test_plain_and_side(self):
        p = part(0, 'Biceps brachii muscle.l', 'muscle', ['upper limb muscles'])
        names.annotate([p])
        self.assertNotIn('.l', p.plain)
        self.assertEqual((p.plain, p.side, p.region), ('Biceps brachii muscle', 'left', 'Arm'))
        self.assertEqual(names.side('Ovary.r (simplified)'), 'right')
        self.assertEqual(names.side('Liver'), 'center')

    def test_plain_drops_wrapping_parentheses(self):
        self.assertEqual(names.plain('(Deep branch of transverse cervical artery).l'), 'Deep branch of transverse cervical artery')
        self.assertEqual(names.plain('(Retropyloric nodes)'), 'Retropyloric nodes')
        self.assertEqual(names.plain('Facial nerve (VII).r'), 'Facial nerve (VII)')

    def test_organ_region_from_height(self):
        p = part(0, 'Thyroid gland', 'organ', [], 1.45)
        names.annotate([p])
        self.assertEqual(p.region, 'Neck')


class ApplyTest(unittest.TestCase):
    def setUp(self):
        V, F = grid_skin()
        D = np.zeros_like(V)
        D[:, 0] = 0.01
        self.pose = dict(male=V, female=V + D, faces=F, Dfull=D, Dlow=D, landmarks={})
        self.parts = [part(0, 'Urinary bladder', 'organ', y=0.9), part(1, 'Prostate', 'organ', y=0.85),
                      part(2, 'Penis', 'organ', y=0.8)]

    def test_apply(self):
        out = sex.apply(self.parts, self.pose)
        self.assertTrue(all(p.posF is not None and p.posF.shape == p.pos.shape for p in out))
        np.testing.assert_allclose(out[0].posF - out[0].pos, np.tile([0.01, 0, 0], (len(out[0].pos), 1)), atol=1e-6)
        self.assertEqual([p.sex for p in out[:3]], ['both', 'male', 'male'])
        self.assertEqual([p.ext for p in out[:3]], [False, False, True])
        fem = out[3:]
        self.assertEqual({p.name for p in fem}, {'Uterus (simplified)', 'Ovary.l (simplified)', 'Ovary.r (simplified)',
                                                 'Uterine tube.l (simplified)', 'Uterine tube.r (simplified)', 'Vagina (simplified)'})
        self.assertTrue(all(p.sex == 'female' and p.simplified and p.kind == 'organ' for p in fem))
        self.assertEqual([p.id for p in out], list(range(len(out))))
        self.assertTrue(all(p.system == 'Reproductive' for p in fem))

    def test_no_bladder_raises(self):
        with self.assertRaises(ValueError):
            sex.apply(self.parts[1:], self.pose)

    def test_skin_part(self):
        s = sex.skin_part(self.pose, self.parts)
        self.assertEqual((s.id, s.name, s.kind, s.plain, s.region, s.system, s.sex), (3, 'skin', 'skin', 'Skin', 'Whole body', 'Skin', 'both'))
        self.assertEqual(len(s.tri), 2 * len(self.pose['faces']))
        np.testing.assert_allclose(s.posF, self.pose['female'])
        self.assertTrue((s.ao == 1).all())
        self.assertTrue(np.allclose(np.linalg.norm(s.nrm, axis=1), 1, atol=1e-4))


if __name__ == '__main__':
    unittest.main()
