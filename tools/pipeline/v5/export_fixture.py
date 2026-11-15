"""Writes src/rig/fixtures/fk_rigpy.json: rig.py fk + ground on the built rig.json, both sexes, for three acceptance
poses and three content poses that use the hands, toes and toeL pins. skeleton.test.ts checks src/rig/skeleton.ts
against it (1 mm). Content poses go through the app's own fromPrototype (node runs src/rig/pose.ts).

tools/pipeline/.venv/bin/python -I tools/pipeline/v5/export_fixture.py"""
import json
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import numpy as np

from v5 import rig
from v5.test_rig import DATA, ROOT, rig_json, skeleton_of

OUT = ROOT / 'src' / 'rig' / 'fixtures' / 'fk_rigpy.json'
ACCEPTANCE = ('abd170', 'squat', 'trunk45')
CONTENT = (('exercises', 'pull', 'pullup', 'a'), ('exercises', 'press', 'pushup', 'a'), ('tasks', 'stairs', 'one', 'a'))
CONVERT = '''import { readFileSync } from 'node:fs';
import { fromPrototype } from './src/rig/pose.ts';
console.log(JSON.stringify(%s.map(([file, id, variant, frame]) => {
  const d = JSON.parse(readFileSync(`public/data/${file}.json`, 'utf8'));
  return fromPrototype(d[file].find((x) => x.id === id).variants.find((x) => x.id === variant).proto[frame]);
})));'''


def poses():
    """[(label, Pose dict)]: the acceptance poses as stored, the content poses converted by the app."""
    with open(DATA / 'poses_acceptance.json') as f:
        acc = {p['id']: p['pose'] for p in json.load(f)['poses']}
    r = subprocess.run(['node', '--input-type=module', '-e', CONVERT % json.dumps(CONTENT)], cwd=ROOT, check=True,
                       capture_output=True, text=True)
    return [(k, acc[k]) for k in ACCEPTANCE] + [('/'.join(c[1:]), p) for c, p in zip(CONTENT, json.loads(r.stdout))]


def main():
    js, r6 = rig_json(), lambda a: np.round(a, 6).tolist()
    cases = []
    for label, p in poses():
        for sex, k in (('male', 'M'), ('female', 'F')):
            H, T = skeleton_of(js, k)
            _, Rs, ts = rig.fk(p, H, T)
            g = rig.ground(p, Rs, ts, H, T)
            ts = ts + g
            at = lambda X: np.einsum('nij,nj->ni', Rs, X) + ts
            cases.append({'pose': label, 'sex': sex, 'input': p, 'ground': r6(g), 'heads': r6(at(H)), 'tails': r6(at(T))})
    with open(OUT, 'w') as f:
        json.dump({'source': 'tools/pipeline/v5/export_fixture.py: rig.py fk + ground on public/data/body/rig.json',
                   'cases': cases}, f, separators=(',', ':'))
    print(f'{OUT.relative_to(ROOT)}: {len(cases)} cases')


if __name__ == '__main__':
    main()
