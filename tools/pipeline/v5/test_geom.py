import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import numpy as np
import trimesh

from v5 import geom
from v5.body import Part


def part(i, name, kind, mesh):
    return Part(id=i, name=name, kind=kind, ancestry=[], pos=mesh.vertices, tri=mesh.faces,
                nrm=geom.vertex_normals(mesh.vertices, mesh.faces))


def tapered_cylinder(r0, r1, length=0.3, rings=31, sides=24):
    """Closed tube along +x, radius r0 at x=0 and r1 at x=length."""
    a = np.linspace(0, 2 * np.pi, sides, endpoint=False)
    V = [[x, r * np.cos(t), r * np.sin(t)]
         for x, r in zip(np.linspace(0, length, rings), np.linspace(r0, r1, rings)) for t in a]
    V += [[0, 0, 0], [length, 0, 0]]
    F = []
    for i in range(rings - 1):
        for j in range(sides):
            a0, a1 = i * sides + j, i * sides + (j + 1) % sides
            F += [[a0, a1, a1 + sides], [a0, a1 + sides, a0 + sides]]
    c0, c1 = len(V) - 2, len(V) - 1
    for j in range(sides):
        F += [[c0, (j + 1) % sides, j], [c1, (rings - 1) * sides + j, (rings - 1) * sides + (j + 1) % sides]]
    return np.array(V, np.float32), np.array(F, np.int32)


def face_out(pos, tri):
    fn = np.cross(pos[tri[:, 1]] - pos[tri[:, 0]], pos[tri[:, 2]] - pos[tri[:, 0]])
    return (fn * (pos[tri].mean(1) - pos.mean(0))).sum(1)


class TestOutward(unittest.TestCase):
    def test_inward_cube_is_flipped(self):
        box = trimesh.creation.box()
        inward = box.faces[:, ::-1]
        self.assertTrue((face_out(box.vertices, inward) < 0).all())
        tri = geom.outward(np.asarray(box.vertices, np.float32), inward)
        self.assertTrue((face_out(box.vertices, tri) > 0).all())

    def test_outward_cube_unchanged(self):
        box = trimesh.creation.box()
        tri = geom.outward(np.asarray(box.vertices, np.float32), box.faces)
        np.testing.assert_array_equal(tri, box.faces)

    def test_normals_unit_and_outward(self):
        s = trimesh.creation.icosphere(2)
        n = geom.vertex_normals(s.vertices, s.faces)
        np.testing.assert_allclose(np.linalg.norm(n, axis=1), 1, atol=1e-5)
        self.assertTrue(((n * s.vertices).sum(1) > 0.9).all())


class TestFibre(unittest.TestCase):
    def test_fibres_along_axis_toward_narrow_end(self):
        pos, tri = tapered_cylinder(0.05, 0.01)
        fib, acr = geom.fibre_field(pos, tri)
        self.assertEqual(fib.shape, pos.shape)
        self.assertEqual(acr.shape, (len(pos),))
        self.assertGreater(np.median(fib[:, 0]), 0.8)  # +x is the narrow end
        self.assertTrue(np.isfinite(fib).all() and np.isfinite(acr).all())

    def test_reversed_taper_flips_direction(self):
        pos, tri = tapered_cylinder(0.01, 0.05)
        fib, _ = geom.fibre_field(pos, tri)
        self.assertLess(np.median(fib[:, 0]), -0.8)

    def test_across_fibre_varies_around_axis(self):
        pos, tri = tapered_cylinder(0.05, 0.01)
        _, acr = geom.fibre_field(pos, tri)
        self.assertGreater(acr.std(), 1e-3)


class TestSheath(unittest.TestCase):
    def sheet(self, z):
        V = np.array([[x, y, z] for y in np.linspace(-0.1, 0.1, 5) for x in np.linspace(-0.05, 0.05, 5)], np.float32)
        F = [[r * 5 + c, r * 5 + c + 1, (r + 1) * 5 + c + 1] for r in range(4) for c in range(4)]
        F += [[r * 5 + c, (r + 1) * 5 + c + 1, (r + 1) * 5 + c] for r in range(4) for c in range(4)]
        return trimesh.Trimesh(V, F, process=False)

    def test_sheet_in_front_removed_far_sheet_kept(self):
        box = trimesh.creation.box((0.1, 0.25, 0.02))  # front face at z = 0.01
        near, far = self.sheet(0.03), self.sheet(0.06)
        self.assertGreater(geom.vertex_normals(near.vertices, near.faces)[:, 2].min(), 0.99)
        parts = [part(0, 'Rectus abdominis muscle.l', 'muscle', box),
                 part(1, 'External abdominal oblique.l', 'muscle', near),
                 part(2, 'Internal abdominal oblique.l', 'muscle', far),
                 part(3, 'Biceps brachii muscle.l', 'muscle', self.sheet(0.03))]
        out = geom.remove_sheath(parts, 0.035)
        self.assertEqual(len(out), 4)
        self.assertEqual(len(out[1].tri), 0)
        self.assertEqual(len(out[1].pos), 0)
        self.assertEqual(len(out[2].tri), len(far.faces))
        self.assertEqual(len(out[3].tri), len(far.faces))  # not an oblique: untouched
        self.assertEqual(len(out[0].tri), len(box.faces))


class TestDecimate(unittest.TestCase):
    def test_sphere_half(self):
        s = trimesh.creation.uv_sphere(count=[23, 23])  # 2,112 triangles
        self.assertAlmostEqual(len(s.faces), 2000, delta=150)
        parts = [part(0, 'v', 'vessel', s), part(1, 'n', 'nerve', s)]
        out = geom.decimate_parts(parts, {'vessel': 0.5})
        self.assertEqual(len(out), 2)
        self.assertLessEqual(len(out[0].tri), 1100)
        self.assertGreater(len(out[0].tri), 800)
        self.assertEqual(len(out[0].nrm), len(out[0].pos))
        self.assertEqual(out[0].tri.max(), len(out[0].pos) - 1)
        self.assertEqual(len(out[1].tri), len(s.faces))  # kind missing from keep = 1.0
        m = trimesh.Trimesh(out[0].pos, out[0].tri, process=False)
        self.assertGreater(m.volume, 0.9 * s.volume)  # closed-ish, still a sphere


if __name__ == '__main__':
    unittest.main()
