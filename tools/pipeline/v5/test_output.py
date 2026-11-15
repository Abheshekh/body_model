"""R13: checks on the built packs in public/data/body/ (run `npm run pipeline:v5` first)."""
import json
import re
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import numpy as np

from v5 import pack
from v5.layers import norm
from v5.sex import MALE_ONLY

HERE = Path(__file__).resolve().parent
OUT = HERE.parents[2] / 'public' / 'data' / 'body'
LABEL = re.compile(r"\.(j|t|g|i|s|o\w*|e\w*)$")  # za_export.LABEL (copied: that module imports bpy)
M = json.loads((OUT / 'manifest.json').read_text())
EXP = json.loads((HERE / 'expected_counts.json').read_text())


def within(a, b):
    return abs(a - b) <= 0.05 * b


class TestOutput(unittest.TestCase):
    def test_counts_per_kind_and_total(self):
        got = {}
        for p in M['parts']:
            got[p['kind']] = got.get(p['kind'], 0) + 1
        self.assertEqual(set(got) - {'skin'}, set(EXP['kinds']) - {'skin'})
        for k, n in EXP['kinds'].items():
            self.assertTrue(within(got.get(k, 0), n), f'{k}: {got.get(k, 0)} vs {n}')
        self.assertTrue(within(len(M['parts']), EXP['sample_total']), len(M['parts']))

    def test_no_label_object(self):
        self.assertEqual([p['name'] for p in M['parts'] if LABEL.search(p['name'])], [])

    def test_every_muscle_has_layer(self):
        for p in M['parts']:
            if p['kind'] in ('muscle', 'tendon'):
                self.assertIn(p['layer'], range(1, 7), p['name'])
            else:
                self.assertIsNone(p['layer'], p['name'])

    def test_sex_parts_are_exclusive(self):
        for p in M['parts']:
            if MALE_ONLY.search(p['name']):
                self.assertEqual(p['sex'], 'male', p['name'])
            if p['sex'] == 'female':
                self.assertTrue(p['simplified'], p['name'])
                self.assertFalse(MALE_ONLY.search(p['name']), p['name'])
        sexes = {p['sex'] for p in M['parts']}
        self.assertEqual(sexes, {'both', 'male', 'female'})

    def test_height(self):
        h = M['heights']
        self.assertTrue(1.70 <= h['male'] <= 1.72, h)
        self.assertTrue(1.54 <= h['female'] <= 1.62, h)

    def test_no_nan(self):
        """§2b.13: decoded positions lie inside the box; every normal has length 0.9-1.1 after /127."""
        lo, hi = np.array(M['box'])
        for pk in M['packs']:
            d = pack.unpack(str(OUT), M, pk['name'])
            for k, a in d.items():
                self.assertTrue(np.isfinite(a).all(), f'{pk["name"]}.{k}')
            for k in ('posM', 'posF'):
                self.assertTrue(((d[k] >= lo) & (d[k] <= hi)).all(), f'{pk["name"]}.{k} outside the box')
            for k in ('nrmM', 'nrmF'):
                L = np.linalg.norm(d[k], axis=1)
                self.assertTrue(((L >= 0.9) & (L <= 1.1)).all(), f'{pk["name"]}.{k}: {int(((L < 0.9) | (L > 1.1)).sum())} bad')

    def test_budget_first_load(self):
        gz = sum(p['gzBytes'] for p in M['packs'] if p['load'] == 'first')
        self.assertLessEqual(gz, 10_000_000)

    def test_manifest_ids_resolve(self):
        ids = [p['id'] for p in M['parts']]
        self.assertEqual(len(ids), len(set(ids)))
        packs = {p['name'] for p in M['packs']}
        used = {}
        for pk in M['packs']:
            used[pk['name']] = set(np.unique(pack.unpack(str(OUT), M, pk['name'])['mid']).tolist())
        for p in M['parts']:
            self.assertIn(p['pack'], packs)
            self.assertIn(p['id'], used[p['pack']], p['name'])
        for name, s in used.items():
            self.assertLessEqual(s, set(ids), name)

    def test_default_hidden(self):
        hidden = [p['name'] for p in M['parts'] if p['defaultHidden']]
        self.assertGreaterEqual(len(hidden), 2, hidden)
        self.assertTrue(all(re.search('omentum|mesocolon|pleura', n, re.I) for n in hidden), hidden)

    def test_overrides_all_match(self):
        names = {norm(p['name']) for p in M['parts']}
        for o in json.loads((HERE / 'layer_overrides.json').read_text()):
            self.assertIn(norm(o['part']), names, o['part'])


if __name__ == '__main__':
    unittest.main()
