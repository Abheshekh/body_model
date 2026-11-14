import json
import os
import unittest

import classify as C

HERE = os.path.dirname(os.path.abspath(__file__))
CFG = json.load(open(os.path.join(HERE, 'config.json')))
PLAIN = json.load(open(os.path.join(HERE, 'plain_names.json')))['map']
R = CFG['rules']


def k(name):
    return C.classify(name, R)


class TestNormalise(unittest.TestCase):
    def test_nsn(self):
        self.assertEqual(C.normalise('pancreas, nsn'), 'pancreas')
        self.assertEqual(C.normalise('  Left Femur '), 'left femur')


class TestClassify(unittest.TestCase):
    def test_adductor_abductor_are_muscles(self):
        self.assertEqual(k('left adductor longus'), 'muscle')
        self.assertEqual(k('right abductor pollicis longus'), 'muscle')

    def test_heart_internals_excluded(self):
        self.assertIsNone(k('anterior papillary muscle of right ventricle'))

    def test_trapezium_is_bone(self):
        self.assertEqual(k('left trapezium'), 'bone')
        self.assertEqual(k('right trapezoid'), 'bone')
        self.assertEqual(k('left trapezius'), 'muscle')

    def test_organs(self):
        for n in R['organs']:
            self.assertEqual(k(n), 'organ', n)
        self.assertEqual(k('pancreas, nsn'), 'organ')
        self.assertEqual(k('wall of heart'), 'organ')
        self.assertEqual(k('skin'), 'skin')

    def test_tendons(self):
        self.assertEqual(k('left iliotibial tract'), 'tendon')
        self.assertEqual(k('linea alba'), 'tendon')
        self.assertEqual(k('left calcaneal tendon'), 'tendon')

    def test_axial_bones(self):
        for n in ('atlas', 'axis', 'ethmoid', 'vomer'):
            self.assertEqual(k(n), 'bone', n)

    def test_spike_missed_muscles(self):
        for n in ('left frontalis', 'left occipitalis', 'left temporoparietalis', 'procerus',
                  'left nasalis', 'left corrugator supercilii', 'left longus capitis',
                  'left longus colli', 'left puborectalis', 'left pyramidalis',
                  'left interspinales', 'left iliococcygeus', 'mentalis', 'left risorius',
                  'left depressor anguli oris', 'left rotatores', 'left obliquus capitis superior'):
            self.assertEqual(k(n), 'muscle', n)

    def test_tensor_fasciae_latae_is_muscle(self):
        self.assertEqual(k('left tensor fasciae latae'), 'muscle')

    def test_nasal_and_cartilage(self):
        self.assertEqual(k('inferior nasal concha'), 'bone')
        self.assertEqual(k('thyroid cartilage'), 'cartilage')
        self.assertEqual(k('set of nasal cartilages'), 'cartilage')

    def test_excluded(self):
        for n in ('left lung', 'spleen', 'appendix', 'urinary bladder', 'right femoral artery',
                  'great saphenous vein', 'left vagus nerve', 'tooth', 'mitral valve',
                  'left cerebral cortex', 'cerebellum, brain'):
            self.assertIsNone(k(n), n)


class TestSide(unittest.TestCase):
    def test_side(self):
        self.assertEqual(C.side_of('left femur'), 'left')
        self.assertEqual(C.side_of('long head of right biceps brachii'), 'right')
        self.assertEqual(C.side_of('sacrum'), 'center')


class TestLayer(unittest.TestCase):
    def test_layer(self):
        sup = CFG['superficial']
        self.assertEqual(C.layer_of('left biceps brachii', 'muscle', sup), 'superficial')
        self.assertEqual(C.layer_of('left supinator', 'muscle', sup), 'deep')
        self.assertIsNone(C.layer_of('left femur', 'bone', sup))


class TestPlainName(unittest.TestCase):
    def pn(self, name):
        return C.plain_name(name, C.side_of(name), PLAIN)

    def test_plain_names(self):
        self.assertEqual(self.pn('long head of left biceps brachii'), 'Biceps – long head, left')
        self.assertEqual(self.pn('left levator scapulae'), 'Levator scapulae, left')
        self.assertEqual(self.pn('left subscapularis'), 'Subscapularis, left')
        self.assertEqual(self.pn('left tibialis posterior'), 'Tibialis posterior, left')
        self.assertEqual(self.pn('left supinator'), 'Supinator, left')
        self.assertEqual(self.pn('wall of heart'), 'Heart')


if __name__ == '__main__':
    unittest.main()
