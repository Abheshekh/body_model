"""Pure classification helpers. Rules come from config.json (passed in as a dict)."""
import re


def normalise(name):
    name = name.strip().lower()
    return re.sub(r',\s*nsn$', '', name).strip()


def _m(pattern, s):
    return re.search(pattern, s, re.I) is not None


def classify(name, rules):
    n = normalise(name)
    if n in rules['organs']:
        return 'organ'
    if n == 'skin':
        return 'skin'
    if _m(rules['tendonAlways'], n):
        return 'tendon'
    excluded = _m(rules['exclude'], n)
    if _m(rules['tendon'], n) and not excluded:
        return 'tendon'
    if excluded:
        return None
    if _m(rules['muscle'], n) and not _m(rules['notMuscle'], n):
        return 'muscle'
    if _m(rules['bone'], n):
        return 'cartilage' if _m(rules['cartilage'], n) else 'bone'
    return None


def side_of(name):
    m = re.search(r'\b(left|right)\b', name)
    return m.group(1) if m else 'center'


def layer_of(name, kind, superficial):
    if kind not in ('muscle', 'tendon'):
        return None
    return 'superficial' if any(s in name for s in superficial) else 'deep'


def plain_name(name, side, plain):
    rest = re.sub(r'\s+', ' ', re.sub(r'\b(left|right)\b', '', name)).strip()
    m = re.match(r'^(.*?(?:head|part|belly)) of (.+)$', rest)
    qualifier, core = (m.group(1), m.group(2)) if m else (None, rest)
    label = core[:1].upper() + core[1:]
    for key in sorted(plain, key=len, reverse=True):
        if re.search(r'\b' + re.escape(key) + r'\b', core):
            label = plain[key]
            break
    if qualifier:
        label += ' – ' + qualifier
    if side != 'center':
        label += ', ' + side
    return label
