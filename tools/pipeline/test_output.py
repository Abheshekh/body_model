import json
import os
import re
import struct
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
GLB = os.path.join(ROOT, 'public', 'data', 'body.glb')
CFG = json.load(open(os.path.join(HERE, 'config.json')))
DATA = json.load(open(os.path.join(ROOT, 'public', 'data', 'parts.json')))
PARTS = DATA['parts']
FORBIDDEN = re.compile(r'artery|\bvein|nerve|brain|cerebr|gyrus|ventricle|thalam|hippocamp|amygdal|putamen|\bpons\b|medulla|colliculus|fornix|tooth|hair|valve|papillary|lung')


def glb_json():
    b = open(GLB, 'rb').read()
    magic, _, _ = struct.unpack('<4sII', b[:12])
    assert magic == b'glTF'
    n, kind = struct.unpack('<I4s', b[12:20])
    assert kind == b'JSON'
    return json.loads(b[20:20 + n])


def count(kind):
    return sum(p['kind'] == kind for p in PARTS)


class TestOutput(unittest.TestCase):
    def test_glb_meshes_match_parts(self):
        names = [m['name'] for m in glb_json()['meshes']]
        self.assertEqual(len(names), len(set(names)))
        self.assertEqual(set(names), {p['id'] for p in PARTS})

    def test_meshopt_and_size(self):
        self.assertIn('EXT_meshopt_compression', glb_json()['extensionsUsed'])
        self.assertLessEqual(os.path.getsize(GLB), 10 * 1024 * 1024)

    def test_triangles(self):
        self.assertLessEqual(DATA['triangles'], 1.05 * CFG['triangleBudget'])
        self.assertEqual(DATA['triangles'], sum(p['triangles'] for p in PARTS))

    def test_counts(self):
        self.assertGreaterEqual(count('muscle'), 340)
        self.assertGreaterEqual(count('bone'), 190)
        self.assertEqual(count('skin'), 1)

    def test_organs(self):
        self.assertEqual({p['name'] for p in PARTS if p['kind'] == 'organ'}, set(CFG['rules']['organs']))

    def test_no_forbidden_parts(self):
        self.assertEqual([p['name'] for p in PARTS if FORBIDDEN.search(p['name'])], [])

    def test_axes(self):
        by = {p['name']: p for p in PARTS}
        self.assertGreater(by['left femur']['center'][0], 0)
        self.assertLess(by['sacrum']['center'][1], by['body of sternum']['center'][1])


if __name__ == '__main__':
    unittest.main()
