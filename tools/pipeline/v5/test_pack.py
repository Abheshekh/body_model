import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import numpy as np
import trimesh

from v5 import geom, pack
from v5.body import Part


def part(i, kind, c):
    m = trimesh.creation.icosphere(1, 0.05)
    P = m.vertices + c
    n = geom.vertex_normals(P, m.faces)
    return Part(id=i, name=f'p{i}', kind=kind, ancestry=[], pos=P, tri=m.faces, nrm=n, posF=P * 0.95,
                fib=n[:, [1, 2, 0]], acr=np.linspace(-1, 1, len(P)), ao=np.linspace(0, 1, len(P)),
                layer=1 if kind == 'muscle' else None)


def pose():
    V = np.array([[0, 0, 0], [0, 1.71, 0], [0.1, 0, 0], [0.1, 1.6, 0]], np.float32)
    return {'faces': np.array([[0, 1, 3, 2]]), 'male': V, 'female': V * [1, 1.58 / 1.71, 1]}


class TestPack(unittest.TestCase):
    def test_round_trip(self):
        parts = [part(3, 'bone', [0.2, 0.9, 0]), part(1, 'muscle', [0, 1, 0.1]), part(2, 'muscle', [-0.1, 0.5, 0])]
        with tempfile.TemporaryDirectory() as out:
            man = pack.write(parts, pose(), out)
            self.assertEqual([p['name'] for p in man['packs']], ['muscle', 'bone'])
            self.assertEqual([p['id'] for p in man['parts']], [1, 2, 3])
            self.assertAlmostEqual(man['heights']['male'], 1.71, 3)
            lo, hi = np.array(man['box'])
            step = (hi - lo).max() / 65535
            for name, ps in (('muscle', parts[1:]), ('bone', parts[:1])):
                d = pack.unpack(out, man, name)
                self.assertEqual(len(d['idx']), sum(len(p.tri) for p in ps))
                self.assertTrue((np.diff(d['mid'][d['idx'][:, 0]].astype(int)) >= 0).all())  # sorted by part
                for p in ps:
                    v = d['mid'] == p.id
                    self.assertTrue(np.abs(d['posM'][v] - p.pos).max() <= step)
                    self.assertTrue(np.abs(d['posF'][v] - p.posF).max() <= step)
                    self.assertTrue(np.abs(d['nrmM'][v] - p.nrm).max() < 0.01)
                    self.assertTrue(np.abs(d['nrmF'][v] - geom.vertex_normals(p.posF, p.tri)).max() < 0.01)
                    self.assertTrue(np.abs(d['fib'][v] - p.fib).max() < 0.01)
                    self.assertTrue(np.abs(d['acr'][v] - p.acr).max() <= 1 / 8000)
                    self.assertTrue(np.abs(d['ao'][v] - p.ao).max() <= 1 / 255)
                    first = np.flatnonzero(v)[0]
                    np.testing.assert_array_equal(d['idx'][d['mid'][d['idx'][:, 0]] == p.id] - first, p.tri)

    def test_zero_fibre_stays_zero(self):
        p = part(0, 'bone', [0, 1, 0])
        p.fib[:] = 0  # non-muscle/tendon parts carry no fibre
        with tempfile.TemporaryDirectory() as out:
            d = pack.unpack(out, pack.write([p], pose(), out), 'bone')
            self.assertEqual(np.count_nonzero(d['fib']), 0)

    def test_nan_raises(self):
        p = part(0, 'muscle', [0, 1, 0])
        p.ao[3] = np.nan
        with tempfile.TemporaryDirectory() as out, self.assertRaisesRegex(ValueError, 'p0'):
            pack.write([p], pose(), out)


if __name__ == '__main__':
    unittest.main()
