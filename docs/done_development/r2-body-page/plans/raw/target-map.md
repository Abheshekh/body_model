# T8 target map: programs.json target names → R1 manifest plain names

Source: `public/data/programs.json` (63 unique target names) against `public/data/body/manifest.json`.
Left/right names collapse to one plain name (§2b.14); ids = manifest parts with that plain name (both sides).

| programs.json name | manifest plain name(s) | ids |
|---|---|---|
| abductor hallucis | Abductor hallucis | 2 |
| adductor magnus | Adductor magnus | 2 |
| ascending part of left trapezius | Ascending part of trapezius muscle | 2 |
| ascending part of right trapezius | Ascending part of trapezius muscle | 2 |
| clavicular part of left pectoralis major | Clavicular head of pectoralis major muscle | 2 |
| clavicular part of right pectoralis major | Clavicular head of pectoralis major muscle | 2 |
| coccygeus | Coccygeus muscle | 2 |
| descending part of left trapezius | Descending part of trapezius muscle | 2 |
| descending part of right trapezius | Descending part of trapezius muscle | 2 |
| external anal sphincter | External anal sphincter | 2 |
| external oblique | External abdominal oblique muscle | 2 |
| flexor digitorum brevis | Flexor digitorum brevis | 2 |
| flexor digitorum longus | Flexor digitorum longus | 2 |
| flexor hallucis longus | Flexor hallucis longus | 2 |
| gluteus maximus | Gluteus maximus muscle | 2 |
| gluteus medius | Gluteus medius muscle | 2 |
| gluteus minimus | Gluteus minimus muscle | 2 |
| iliacus | Iliacus muscle | 2 |
| iliococcygeus | Iliococcygeus muscle | 2 |
| iliocostalis lumborum | Iliocostalis lumborum muscle | 2 |
| infraspinatus muscle | Infraspinatus muscle | 2 |
| internal oblique | Internal abdominal oblique muscle | 2 |
| lateral head of left gastrocnemius | Lateral head of gastrocnemius | 2 |
| lateral head of right gastrocnemius | Lateral head of gastrocnemius | 2 |
| levator scapulae | Levator scapulae | 2 |
| long head of left biceps femoris | Long head of biceps femoris | 2 |
| long head of right biceps femoris | Long head of biceps femoris | 2 |
| longissimus thoracis | Longissimus thoracis muscle | 2 |
| longus capitis | Longus capitis muscle | 2 |
| medial head of left gastrocnemius | Medial head of gastrocnemius | 2 |
| medial head of right gastrocnemius | Medial head of gastrocnemius | 2 |
| multifidus | Multifidus colli muscle, Multifidus lumborum muscle, Multifidus thoracis muscle | 6 |
| pectoralis minor | Pectoralis minor muscle | 2 |
| psoas major | Psoas major | 2 |
| pubococcygeus | Pubococcygeus muscle | 2 |
| puborectalis | Pubo-analis muscle | 2 |
| quadratus lumborum | Quadratus lumborum muscle | 2 |
| rectus abdominis | Rectus abdominis muscle | 2 |
| rectus capitis anterior | Rectus anterior capitis muscle | 2 |
| rectus femoris | Rectus femoris muscle | 2 |
| rhomboid major | Rhomboid major muscle | 2 |
| rhomboid minor | Rhomboid minor muscle | 2 |
| semimembranosus | Semimembranosus muscle | 2 |
| semispinalis thoracis | Semispinalis thoracis muscle | 2 |
| semitendinosus | Semitendinosus muscle | 2 |
| serratus anterior | Serratus anterior muscle | 2 |
| short head of left biceps femoris | Short head of biceps femoris | 2 |
| short head of right biceps femoris | Short head of biceps femoris | 2 |
| soleus | Soleus muscle | 2 |
| spinal part of left deltoid | Scapular spinal part of deltoid muscle | 2 |
| spinal part of right deltoid | Scapular spinal part of deltoid muscle | 2 |
| spinalis thoracis | Spinalis thoracis muscle | 2 |
| sternocostal part of left pectoralis major | Sternocostal head of pectoralis major muscle | 2 |
| sternocostal part of right pectoralis major | Sternocostal head of pectoralis major muscle | 2 |
| tensor fasciae latae | — dropped (not in manifest) — | 0 |
| teres minor | Teres minor muscle | 2 |
| transverse part of left trapezius | Transverse part of trapezius muscle | 2 |
| transverse part of right trapezius | Transverse part of trapezius muscle | 2 |
| transversus abdominis | Transversus abdominis muscle | 2 |
| vastus lateralis | Vastus lateralis muscle | 2 |
| vastus medialis | Vastus medialis muscle | 2 |
| vertical intermediate part of left longus colli | Longus colli muscle | 2 |
| vertical intermediate part of right longus colli | Longus colli muscle | 2 |

Notes:
- `puborectalis` → `Pubo-analis muscle`: closest Z-Anatomy part of the levator ani (§2b.14).
- `multifidus` → every plain name containing "multifidus" (§2b.14).
- `vertical intermediate part of left/right longus colli` → `Longus colli muscle`: Z-Anatomy has only the whole muscle (parent). Accepted (Changelog 18:40).
- `tensor fasciae latae`: **no manifest part** (absent from the R1 Z-Anatomy data; M1 parts.json had it). Used only by `posture-correction/side-lying-hip-abduction` (provisional; with gluteus medius, gluteus minimus). Decision (Changelog 18:40): dropped from the targets; posture-correction `notes` carry "Tensor fasciae latae is not in this anatomy model." (items have no notes field).
- Data finding: in Z-Anatomy `Ascending part of trapezius muscle` sits at the neck (y 1.416–1.575) and `Descending part` lower (y 1.120–1.414), the reverse of the anatomical names; wall slide therefore highlights the upper fibres. Mapping kept by name.
