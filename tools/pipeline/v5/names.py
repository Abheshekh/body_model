"""Names (SPEC §1.3 step 10): plain, side, region, system, colour; heart chambers move from vessel to organ (R8)."""
import re

HEART = re.compile(r'atrium|ventricle of heart|ventricle$|valve|papillary|chordae|wall of heart|heart', re.I)
HIDDEN = re.compile(r'omentum|mesocolon|pleura', re.I)  # SPEC §1A default hidden: they cover the organs
SIDE = re.compile(r'\.([lr])(?= \(simplified\)|$)')
WRAPPED = re.compile(r'^\(([^()]*)\)$')
REG = [('Head', 'Head'), ('Neck', 'Neck'), ('hand', 'Hand'), ('upper limb', 'Arm'), ('foot', 'Foot'), ('lower limb', 'Leg'),
       ('Back', 'Back'), ('Thorax', 'Chest'), ('Abdomen', 'Abdomen'), ('Perineum', 'Pelvis'), ('Pelvi', 'Pelvis')]
SYS = [('Heart', 'Heart'), ('Arter', 'Arteries'), ('Vein', 'Veins'), ('Digestive', 'Digestive'), ('Respiratory', 'Respiratory'),
       ('Urinary', 'Urinary'), ('Genital', 'Reproductive'), ('Endocrine', 'Endocrine'), ('Central nervous', 'Brain and spinal cord'),
       ('Peripheral nervous', 'Nerves'), ('Sense organ', 'Sense organs'), ('Lymph', 'Lymphatic'), ('Ligament', 'Ligaments'),
       ('Cartilag', 'Cartilage'), ('Intervertebral', 'Cartilage')]
KIND_SYS = {'organ': 'Organs', 'vessel': 'Heart and vessels', 'nerve': 'Nervous system', 'lymph': 'Lymphatic',
            'joint': 'Joints', 'muscle': 'Muscles', 'tendon': 'Muscles', 'bone': 'Skeleton', 'skin': 'Skin'}


def in_heart(p):
    return any('Heart' in a for a in p.ancestry)


def heart_to_organ(p):
    """R8: heart chambers, valves, papillary muscles (Heart ancestry) become organs; coronary vessels stay."""
    if p.kind == 'vessel' and in_heart(p) and HEART.search(p.name):
        p.kind = 'organ'


def side(name):
    m = SIDE.search(name)
    return {'l': 'left', 'r': 'right'}[m.group(1)] if m else 'center'


def plain(name):
    """Side suffix removed; parentheses wrapping the whole name dropped; a trailing qualifier such as '(VII)' kept."""
    return WRAPPED.sub(r'\1', SIDE.sub('', name).strip()).strip()


def region(p):
    cols = ' | '.join(p.ancestry).lower()
    reg = next((v for k, v in REG if k.lower() in cols), None)
    nm = p.name.lower()
    if reg is None:
        reg = ('Chest' if re.search(r'pector|serratus anterior|intercost|subclavius|diaphragm|transversus thoracis|costarum|heart|lung|mammary', nm) else
               'Pelvis' if re.search(r'coccyg|anal|levator ani|pubo|iliopectineal|uter|ovar|vagin|bladder|prostat|penis|testi', nm) else
               'Back' if re.search(r'teres|interspinales', nm) else 'Abdomen' if p.kind == 'organ' else 'Other')
    if p.kind in ('organ', 'vessel', 'nerve', 'lymph') and len(p.pos) and reg in ('Abdomen', 'Other', 'Chest', 'Pelvis'):
        cy = float(p.pos[:, 1].mean())
        reg = 'Head' if cy > 1.5 else 'Neck' if cy > 1.38 else 'Chest' if cy > 1.08 else 'Abdomen' if cy > 0.86 else 'Pelvis'
    return reg


def system(p):
    if p.kind == 'vessel' and in_heart(p):  # §2b.12: Heart is for organs only
        return 'Veins' if 'vein' in p.name.lower() else 'Arteries'
    if re.search('uter|ovar|vagin|mammary', p.name.lower()):
        return 'Reproductive'
    cols = ' | '.join(p.ancestry).lower()
    return next((v for k, v in SYS if k.lower() in cols and (v != 'Heart' or p.kind == 'organ')),
                KIND_SYS.get(p.kind, 'Other'))


def colour(name, kind):
    nm = name.lower()
    k = kind
    if k == 'muscle': return '#7a1c22'
    if k == 'tendon': return '#e6d8c4'
    if k == 'bone': return '#e2d6c1'
    if k == 'skin': return '#b8876a'
    if k == 'vessel': return '#3a5aa8' if 'vein' in nm or 'sinus' in nm else '#a8262c' if not re.search('atrium|ventric|papillary|leaflet|valve|cusp|chorda', nm) else '#8c2f2c'
    if k == 'nerve':
        if re.search('eye|lens|cornea|retina|scler|iris', nm): return '#e8e4dc'
        if re.search('brain|cortex|lobe|gyrus|cerebel|thalam|midbrain|pons|medulla|hemisphere|nucleus|ventric|spinal cord|cerebr|hippoc|amygd|putamen|caudate|corpus|fornix|insula|cingul', nm): return '#dbb4a7'
        return '#e8cf6e'
    if k == 'lymph': return '#86b46f'
    if k == 'joint': return '#c8d6dc'
    if re.search('liver|segment of liver', nm): return '#6b2721'
    if re.search('lung|lobe of', nm): return '#c9958f'
    if re.search('kidney|renal', nm): return '#7c2e2e'
    if 'spleen' in nm: return '#5b2235'
    if 'pancrea' in nm: return '#d6ae7a'
    if re.search('gallbladder|bile', nm): return '#4f7a3a'
    if re.search('stomach|duoden|jejun|ile|colon|cecum|caecum|append|rectum|oesoph|esoph|taenia', nm): return '#c98676'
    if re.search('bladder|ureter|urethra', nm): return '#d8a487'
    if re.search('thyroid|thymus|adrenal|supraren|gland', nm): return '#b9735a'
    if re.search('mammary', nm): return '#e7c79a'
    if re.search('uter|ovar|vagin|tube', nm): return '#c97a86'
    if re.search('penis|testi|epididym|prostat|seminal|scrot|glans', nm): return '#b9707a'
    if re.search('tooth|incisor|canine|molar|premolar', nm): return '#efe8da'
    if re.search('tongue|gingiva|palat|uvula', nm): return '#c06a6a'
    return '#b87d73'


def annotate(parts):
    for p in parts:
        heart_to_organ(p)
        p.plain, p.side = plain(p.name), side(p.name)
        p.region, p.system, p.colour = region(p), system(p), colour(p.name, p.kind)
    return parts


def run(ctx):
    ctx['parts'] = annotate(ctx['parts'])
    return ctx
