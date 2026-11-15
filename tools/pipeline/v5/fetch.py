"""R1: get Z-Anatomy and MPFB2 by git partial clone into cache/. Idempotent."""
import json
import os
import shutil
import subprocess
import sys
import zipfile

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from v5.body import CACHE, CFG  # noqa: E402


def git(*args):
    r = subprocess.run(['git', *args], capture_output=True, text=True)
    if r.returncode != 0:
        sys.stderr.write(r.stderr)
        raise SystemExit(r.returncode or 1)
    return r.stdout.strip()


def clone(name, files):
    """Blobless sparse clone of exactly `files`; returns the commit hash."""
    d = os.path.join(CACHE, name + '_repo')
    if not os.path.isdir(os.path.join(d, '.git')):
        os.makedirs(CACHE, exist_ok=True)
        git('clone', '--filter=blob:none', '--no-checkout', '--depth', '1', '--sparse',
            CFG['sources'][name]['repo'], d)
        git('-C', d, 'sparse-checkout', 'set', '--no-cone', *['/' + f for f in files])
        git('-C', d, 'checkout')
    return d, git('-C', d, 'rev-parse', 'HEAD')


def fetch():
    src = CFG['sources']
    os.makedirs(CACHE, exist_ok=True)
    zd, zc = clone('za', src['za']['files'])
    blend = os.path.join(CACHE, 'za', src['za']['blend'])
    if not os.path.isfile(blend):
        with zipfile.ZipFile(os.path.join(zd, src['za']['zip'])) as z:
            os.makedirs(os.path.dirname(blend), exist_ok=True)
            with z.open('Z-Anatomy/' + src['za']['blend']) as a, open(blend, 'wb') as b:
                shutil.copyfileobj(a, b)
    md, mc = clone('mpfb', src['mpfb']['files'])
    link = os.path.join(CACHE, 'mpfb')
    if not os.path.lexists(link):
        os.symlink(md, link)  # ponytail: symlink so paths read cache/mpfb/src/mpfb/...
    out = {'za': zc, 'mpfb': mc}
    with open(os.path.join(CACHE, 'sources.json'), 'w') as f:
        json.dump(out, f, indent=1)
    return out


if __name__ == '__main__':
    print(fetch())
