#!/usr/bin/env python3
"""Spike: turn BodyParts3D STL parts into one simplified binary for a three.js viewer.

Usage:
  git clone --filter=blob:none https://github.com/Kevin-Mattheus-Moerman/BodyParts3D
  pip install numpy trimesh fast-simplification
  python build_body.py BodyParts3D/assets/BodyParts3D_data out/

Writes out/body.bin (float32 positions, float32 normals, uint32 indices) and out/parts.json.
Axes out: metres, Y up, +Z front, +X the body's left. Data licence: CC BY-SA 2.1 Japan (BodyParts3D, DBCLS).
"""
import json, os, re, sys
import numpy as np, trimesh, fast_simplification

BONE = re.compile(r'vertebra|\brib\b|femur|tibia|fibula|humerus|radius|ulna|scapula|clavicle|sternum|manubrium|xiphoid|hip bone|sacrum|coccyx|patella|phalanx|metacarpal|metatarsal|calcaneus|talus|navicular|cuboid|cuneiform|scaphoid|lunate|triquetr|pisiform|trapezium|trapezoid|capitate|hamate|bone|mandible|maxilla|hyoid|costal cartilage|intervertebral disk', re.I)
NOT = re.compile(r'artery|vein|nerve|vena|sinus|duct|ganglion|plexus|gyrus|lobe|ventricle|nucleus|tract|aorta|bronch|trache|lymph|gland|ligament|tooth|incisor|molar|canine|premolar|atrium|valve|cortex|sulcus|lobule|segment of|capsule|bursa|retinaculum', re.I)
MUS = re.compile(r'muscle|biceps|triceps|deltoid|gluteus|pectoralis|latissimus|trapezius\b|vastus|rectus|gastrocnemius|soleus|brachi|oblique|serratus|rhomboid|teres|spinatus|subscapularis|adductor|abductor|flexor|extensor|pronator|supinator|sartorius|gracilis|semitendinosus|semimembranosus|iliacus|psoas|piriformis|gemellus|obturator|quadratus|pectineus|tensor|popliteus|plantaris|tibialis|fibularis|peroneus|sternocleidomastoid|scalen|splenius|levator|longissimus|iliocostalis|spinalis|multifidus|semispinalis|diaphragm|masseter|temporalis|platysma|digastric|coracobrachialis|anconeus|palmaris|interosse|lumbrical|opponens|transversus|erector|orbicularis|zygomatic|buccinator|mylohyoid|intercostal|rotatores|subclavius|sternohyoid|omohyoid|thyrohyoid|sternothyroid|geniohyoid|stylohyoid|pterygoid|occipitofrontalis|tendon|aponeurosis|fascia lata|iliotibial', re.I)
ORG = re.compile(r'^(liver|heart|pancreas|stomach|right kidney|left kidney|duodenum|jejunum|ileum|rectum|skin)$', re.I)
# kind: (keep fraction, min faces, max faces)
BUDGET = {'muscle': (0.07, 700, 7000), 'tendon': (0.07, 500, 5000), 'bone': (0.035, 300, 3500),
          'cartilage': (0.03, 200, 2000), 'organ': (0.03, 2000, 6000), 'skin': (1, 60000, 60000)}

def classify(name):
    if ORG.search(name): return 'skin' if name == 'skin' else 'organ'
    if NOT.search(name): return None
    if MUS.search(name) and not re.search(r'trapezium|trapezoid', name):
        return 'tendon' if re.search(r'tendon|aponeurosis|fascia|iliotibial|membrane', name) else 'muscle'
    if BONE.search(name): return 'cartilage' if re.search(r'cartilage|disk', name) else 'bone'
    return None

def main(src, out):
    os.makedirs(out, exist_ok=True)
    names = {}
    for line in open(os.path.join(src, 'parts_list_e.txt'), encoding='utf-8', errors='ignore'):
        p = line.rstrip('\n').split('\t')
        if len(p) >= 2: names[p[0]] = p[1]
    parts, V, N, I, vo, io = [], [], [], [], 0, 0
    for fn in sorted(os.listdir(os.path.join(src, 'stl'))):
        fid = fn[:-4]; name = names.get(fid, '?'); kind = classify(name)
        if not kind: continue
        m = trimesh.load(os.path.join(src, 'stl', fn), process=True)
        nf = len(m.faces)
        if nf < 20: continue
        frac, lo, hi = BUDGET[kind]
        want = min(max(int(nf * frac), lo), hi)
        v = np.asarray(m.vertices, dtype=np.float32); f = np.asarray(m.faces, dtype=np.uint32)
        if want < nf: v, f = fast_simplification.simplify(v, f, target_reduction=1 - want / nf)
        n = np.asarray(trimesh.Trimesh(v, f, process=False).vertex_normals, dtype=np.float32)
        parts.append(dict(id=fid, name=name, kind=kind, vo=vo, vc=len(v), io=io, ic=int(f.size)))
        V.append(np.asarray(v, dtype=np.float32)); N.append(n); I.append(np.asarray(f, dtype=np.uint32).ravel())
        vo += len(v); io += int(f.size)
    V = np.concatenate(V); N = np.concatenate(N); I = np.concatenate(I)
    # source: millimetres, x right->left, y front->back (front is -y), z up
    V2 = np.stack([V[:, 0], V[:, 2], -V[:, 1]], 1) * 0.001
    N2 = np.stack([N[:, 0], N[:, 2], -N[:, 1]], 1)
    with open(os.path.join(out, 'body.bin'), 'wb') as fh:
        fh.write(V2.astype('<f4').tobytes() + N2.astype('<f4').tobytes() + I.astype('<u4').tobytes())
    json.dump(dict(nv=int(vo), ni=int(io), parts=parts), open(os.path.join(out, 'parts.json'), 'w'))
    kinds = {}
    for p in parts: kinds[p['kind']] = kinds.get(p['kind'], 0) + 1
    print('parts', kinds, 'triangles', io // 3)
    assert kinds.get('muscle', 0) > 250 and kinds.get('bone', 0) > 150, 'classification looks wrong'

if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
