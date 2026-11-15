import copy
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import trimesh

from v5 import geom, layers
from v5.body import CFG, Part


def setUpModule():
    print('trimesh.ray.has_embree', trimesh.ray.has_embree)


def box(i, name, kind, lo, hi):
    m = trimesh.creation.box(bounds=[lo, hi])
    return Part(id=i, name=name, kind=kind, ancestry=[], pos=m.vertices, tri=m.faces,
                nrm=geom.vertex_normals(m.vertices, m.faces))


def stack():
    """Bone floor, inner plate on it, wider outer plate above."""
    return ([box(0, 'outer', 'muscle', [-0.15, -0.15, 0.02], [0.15, 0.15, 0.03]),
             box(1, 'inner', 'muscle', [-0.05, -0.05, 0.0], [0.05, 0.05, 0.01])],
            [box(2, 'bone', 'bone', [-0.25, -0.25, -0.03], [0.25, 0.25, -0.02])])


def cfg(**peel):
    c = copy.deepcopy(CFG)
    c['peel'].update(peel)
    return c


class PeelTest(unittest.TestCase):
    def test_stacked_plates(self):
        soft, bones = stack()
        layer, exp = layers.peel(soft, bones, CFG)
        self.assertEqual(layer, {0: 1, 1: 2})
        self.assertGreaterEqual(exp[0], 0.16)
        self.assertGreaterEqual(exp[1], 0.16)

    def test_lone_plate(self):
        layer, exp = layers.peel([box(0, 'plate', 'muscle', [0, 0, 0], [0.1, 0.1, 0.01])], [], CFG)
        self.assertEqual(layer, {0: 1})
        self.assertEqual(exp[0], 1.0)

    def test_self_hits_skipped(self):
        a = trimesh.creation.box(bounds=[[0, 0, 0], [0.1, 0.1, 0.01]])
        b = trimesh.creation.box(bounds=[[0, 0, 0.03], [0.1, 0.1, 0.04]])
        m = trimesh.util.concatenate([a, b])
        p = Part(id=0, name='two sheets', kind='muscle', ancestry=[], pos=m.vertices, tri=m.faces,
                 nrm=geom.vertex_normals(m.vertices, m.faces))
        _, exp = layers.peel([p], [], CFG)
        self.assertEqual(exp[0], 1.0)

    def test_fallback_top_by_exposure(self):
        soft, bones = stack()
        layer, _ = layers.peel(soft, bones, cfg(uncovered=0.99))
        self.assertEqual(layer, {0: 1, 1: 2})

    def test_fallback_top_third(self):
        plates = [box(i, f'p{i}', 'muscle', [i * 0.2, 0, 0], [i * 0.2 + 0.1, 0.1, 0.01]) for i in range(3)]
        floor = [box(9, 'bone', 'bone', [-0.1, -0.1, -0.03], [0.6, 0.2, -0.02])]
        layer, _ = layers.peel(plates, floor, cfg(uncovered=0.99))
        self.assertEqual(sorted(layer.values()), [1, 2, 3])

    def test_rest_get_max_layer(self):
        soft, bones = stack()
        layer, _ = layers.peel(soft, bones, cfg(maxLayer=1, uncovered=0.99))
        self.assertEqual(layer, {0: 1, 1: 1})


class OverrideTest(unittest.TestCase):
    def test_override_changes_layer(self):
        p = box(0, 'Deltoid muscle.l', 'muscle', [0, 0, 0], [1, 1, 1])
        p.layer = 3
        self.assertEqual(layers.apply_overrides([p], [{'part': 'Deltoid', 'layer': 1, 'reason': 'x'}]), [])
        self.assertEqual(p.layer, 1)

    def test_matching(self):
        ps = [box(0, 'Rectus abdominis muscle.l', 'muscle', [0, 0, 0], [1, 1, 1]),
              box(1, 'Rectus abdominis muscle.r', 'muscle', [0, 0, 0], [1, 1, 1]),
              box(2, 'Rectus femoris muscle.l', 'muscle', [0, 0, 0], [1, 1, 1])]
        for p in ps:
            p.layer = 4
        missing = layers.apply_overrides(ps, [{'part': 'rectus abdominis', 'layer': 1, 'reason': 'x'},
                                              {'part': 'No such muscle', 'layer': 2, 'reason': 'x'}])
        self.assertEqual([p.layer for p in ps], [1, 1, 4])
        self.assertEqual(missing, ['No such muscle'])

    def test_seeded_file(self):
        import json
        with open(layers.OVERRIDES) as f:
            ov = json.load(f)
        self.assertEqual({layers.norm(o['part']) for o in ov}, {'rectus abdominis', 'pyramidalis'})
        self.assertTrue(all(o['layer'] == 1 and o['reason'] for o in ov))


class AOTest(unittest.TestCase):
    def test_enclosed_darker(self):
        inside = box(0, 'inside', 'organ', [-0.005, -0.005, -0.005], [0.005, 0.005, 0.005])
        shell = box(1, 'shell', 'bone', [-0.03, -0.03, -0.03], [0.03, 0.03, 0.03])
        free = box(2, 'free', 'organ', [0.995, -0.005, -0.005], [1.005, 0.005, 0.005])
        skin = box(3, 'skin', 'skin', [-0.5, -0.5, -0.5], [2, 0.5, 0.5])
        layers.ambient_occlusion([inside, shell, free, skin], CFG)
        self.assertLess(inside.ao.max(), free.ao.min())
        self.assertEqual(free.ao.min(), 1.0)
        self.assertTrue((skin.ao == 1).all())

    def test_shallower_layer_does_not_occlude(self):
        def inner_ao(outer_layer):
            (outer, inner), bones = stack()
            outer.layer, inner.layer = outer_layer, 2
            layers.ambient_occlusion([outer, inner] + bones, CFG)
            return inner.ao.mean()
        self.assertGreater(inner_ao(1), inner_ao(2))


if __name__ == '__main__':
    unittest.main()
