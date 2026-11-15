import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import numpy as np

from v5 import pose


def grid(n=6):
    """A flat n x n quad sheet in the XY plane (vertices, quads)."""
    V = np.array([[x, y, 0.0] for y in range(n) for x in range(n)], np.float64) * 0.05
    Q = [[y * n + x, y * n + x + 1, (y + 1) * n + x + 1, (y + 1) * n + x] for y in range(n - 1) for x in range(n - 1)]
    return V, np.array(Q, np.int32)


class RotBetween(unittest.TestCase):
    def test_maps_a_to_b(self):
        rng = np.random.default_rng(1)
        for _ in range(20):
            a, b = rng.normal(size=3), rng.normal(size=3)
            R = pose.rot_between(a, b)
            np.testing.assert_allclose(R @ (a / np.linalg.norm(a)), b / np.linalg.norm(b), atol=1e-9)
            np.testing.assert_allclose(R @ R.T, np.eye(3), atol=1e-9)
            self.assertAlmostEqual(np.linalg.det(R), 1.0, places=9)

    def test_parallel_is_identity(self):
        np.testing.assert_allclose(pose.rot_between(np.array([0, 1.0, 0]), np.array([0, 3.0, 0])), np.eye(3))


class Lbs(unittest.TestCase):
    def test_one_bone_at_identity_leaves_vertices(self):
        V, _ = grid()
        WM = {'root': (np.arange(len(V)), np.ones(len(V)))}
        out = pose.lbs(V, WM, {'root': (np.eye(3), np.zeros(3))})
        np.testing.assert_allclose(out, V)

    def test_unweighted_vertices_stay(self):
        V, _ = grid()
        R = pose.rot_between(np.array([1.0, 0, 0]), np.array([0, 1.0, 0]))
        WM = {'root': (np.arange(3), np.ones(3))}
        out = pose.lbs(V, WM, {'root': (R, np.zeros(3))})
        np.testing.assert_allclose(out[3:], V[3:])
        np.testing.assert_allclose(out[:3], V[:3] @ R.T)


class WarpField(unittest.TestCase):
    def test_identical_meshes_give_zero(self):
        V, Q = grid()
        D = pose.warp_field(V, V.copy(), Q)
        self.assertEqual(D.shape, V.shape)
        self.assertEqual(float(np.abs(D).max()), 0.0)

    def test_constant_offset_survives_smoothing(self):
        V, Q = grid()
        D = pose.warp_field(V, V + [0.01, 0.0, 0.0], Q)
        np.testing.assert_allclose(D, np.tile([0.01, 0.0, 0.0], (len(V), 1)), atol=1e-6)


if __name__ == '__main__':
    unittest.main()
