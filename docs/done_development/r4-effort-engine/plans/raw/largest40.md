# Largest 40 muscles (T2, PLAN 2b.2)

Method: decompress public/data/body/muscle.bin.gz, give each triangle the part id (`mid`) of its first vertex, sum triangles over every part with the same manifest `plain` (all heads, both sides), rank (ties by name). Same computation as src/engine/actions.test.ts. 443 muscle parts, 222 plain names, 401,564 muscle triangles.

Review: each action below was checked line by line against standard kinesiology (Neumann 2017; Kendall 2005) from memory: from standard kinesiology, not checked page by page. Signs follow the rig: flex + forward (knee + = heel back, ankle + = dorsiflexion), abd + away from the midline, rot/pron + = internal/pronation, dev + = radial, inv + = inversion, hadd + = horizontal adduction; ipsi/contra = side bend or turn toward the own/other side.

6 of the overall top 40 have no joint the rig can move (scalp, jaw, neck skin, breathing). They stay in `unmodelled`; their reason was reviewed instead. So that 40 modelled muscles are reviewed, the next 6 modelled muscles by size are reviewed too (table 2). The test checks both: every overall top-40 muscle is reviewed or unmodelled, and the 40 largest modelled muscles are all `reviewed: true`.

## 1. Overall top 40

| Rank | Triangles | Muscle (plain) | Status | Actions [joint axis dir weight] or reason | Rules |
|---|---|---|---|---|---|
| 1 | 20702 | External intercostal muscles | reviewed | thoracic twist contra 0.2 | - |
| 2 | 20084 | Internal intercostal muscles | reviewed | thoracic twist ipsi 0.2 | - |
| 3 | 19124 | Innermost intercostal muscles | unmodelled | breathing muscle: the static posture model does not model ventilation; no documented trunk-motion role | - |
| 4 | 13040 | Transversus abdominis muscle | reviewed | - (rule only) | bracing |
| 5 | 12620 | Serratus anterior muscle | reviewed | - (rule only) | scapula |
| 6 | 10788 | Latissimus dorsi muscle | reviewed | shoulder flex - 1; shoulder abd - 1; shoulder rot + 0.5 | - |
| 7 | 10300 | Rectus abdominis muscle | reviewed | lumbar flex + 1; thoracic flex + 1 | bracing |
| 8 | 7008 | External abdominal oblique muscle | reviewed | lumbar twist contra 1; lumbar side ipsi 0.8; lumbar flex + 0.6; thoracic twist contra 1; thoracic side ipsi 0.6; thoracic flex + 0.5 | bracing |
| 9 | 6396 | Humero-ulnar head of flexor digitorum superficialis | reviewed | wrist flex + 0.6 | grip |
| 10 | 5984 | Temporoparietalis muscle | unmodelled | face (facial expression or scalp): no joint in the rig, no torque in a static posture model | - |
| 11 | 5292 | Internal abdominal oblique muscle | reviewed | lumbar twist ipsi 1; lumbar side ipsi 0.8; lumbar flex + 0.6; thoracic twist ipsi 0.8; thoracic side ipsi 0.5; thoracic flex + 0.4 | bracing |
| 12 | 5128 | Temporalis muscle | unmodelled | jaw or hyoid: no jaw joint in the rig | - |
| 13 | 5016 | Iliocostalis lumborum muscle | reviewed | lumbar flex - 1; lumbar side ipsi 0.6; thoracic flex - 0.5 | - |
| 14 | 4824 | Longissimus thoracis muscle | reviewed | lumbar flex - 1; thoracic flex - 1; lumbar side ipsi 0.4; thoracic side ipsi 0.4 | - |
| 15 | 4676 | Vastus lateralis muscle | reviewed | knee flex - 1 | - |
| 16 | 4476 | Serratus posterior inferior muscle | unmodelled | breathing muscle: the static posture model does not model ventilation; its role is disputed (possibly proprioceptive), no joint action used | - |
| 17 | 4136 | Rectus femoris muscle | reviewed | knee flex - 1; hip flex + 0.6 | - |
| 18 | 4096 | Adductor magnus | reviewed | hip abd - 1; hip flex - 0.6 | - |
| 19 | 3718 | Semimembranosus muscle | reviewed | knee flex + 1; hip flex - 0.8; hip rot + 0.2 | - |
| 20 | 3656 | Brachioradialis muscle | reviewed | elbow flex + 0.8 | - |
| 21 | 3628 | Long head of biceps femoris | reviewed | knee flex + 1; hip flex - 0.8; hip rot - 0.2 | - |
| 22 | 3548 | Flexor digitorum profundus | reviewed | wrist flex + 0.5 | grip |
| 23 | 3416 | Flexor digitorum longus | reviewed | ankle inv + 0.4; ankle flex - 0.2 | - |
| 24 | 3384 | Soleus muscle | reviewed | ankle flex - 1 | - |
| 25 | 3380 | Descending part of trapezius muscle | reviewed | neck side ipsi 0.4; neck flex - 0.3; neck turn contra 0.3 | scapula |
| 26 | 3272 | Platysma | unmodelled | platysma: a thin skin muscle of the neck (facial expression); no meaningful joint torque | - |
| 27 | 3256 | Rotatores | reviewed | thoracic twist contra 0.3; thoracic flex - 0.2 | - |
| 28 | 3228 | Vastus medialis muscle | reviewed | knee flex - 1 | - |
| 29 | 3224 | Medial head of gastrocnemius | reviewed | ankle flex - 1; knee flex + 0.4 | - |
| 30 | 3204 | Extensor digitorum | reviewed | wrist flex - 0.6 | grip |
| 31 | 3144 | Longus colli muscle | reviewed | neck flex + 0.8; neck side ipsi 0.2 | - |
| 32 | 3122 | Gluteus minimus muscle | reviewed | hip abd + 0.8; hip rot + 0.6 | - |
| 33 | 3080 | Vastus intermedius muscle | reviewed | knee flex - 1 | - |
| 34 | 2956 | Levatores longi costarum | reviewed | thoracic side ipsi 0.1; thoracic twist contra 0.1; thoracic flex - 0.1 | - |
| 35 | 2936 | Flexor hallucis longus | reviewed | ankle inv + 0.3; ankle flex - 0.2 | - |
| 36 | 2936 | Frontalis muscle | unmodelled | face (facial expression or scalp): no joint in the rig, no torque in a static posture model | - |
| 37 | 2884 | Iliocostalis thoracis muscle | reviewed | thoracic flex - 1; thoracic side ipsi 0.6; lumbar flex - 0.3 | - |
| 38 | 2764 | Spinalis thoracis muscle | reviewed | thoracic flex - 0.6 | - |
| 39 | 2760 | Fibularis longus muscle | reviewed | ankle inv - 1; ankle flex - 0.3 | - |
| 40 | 2760 | Tibialis posterior muscle | reviewed | ankle inv + 1; ankle flex - 0.3 | - |

## 2. Next modelled muscles by size (also reviewed)

| Rank | Triangles | Muscle (plain) | Actions [joint axis dir weight] | Rules |
|---|---|---|---|---|
| 42 | 2736 | Psoas major | hip flex + 1; lumbar side ipsi 0.2; lumbar flex + 0.2 | - |
| 43 | 2628 | Splenius capitis muscle | neck flex - 0.8; head flex - 0.6; neck turn ipsi 0.8; neck side ipsi 0.5 | - |
| 44 | 2588 | Gluteus medius muscle | hip abd + 1; hip rot + 0.4 | - |
| 45 | 2484 | Semispinalis thoracis muscle | thoracic flex - 0.5; thoracic twist contra 0.4 | - |
| 46 | 2480 | Sartorius muscle | hip flex + 0.5; hip rot - 0.4; hip abd + 0.3; knee flex + 0.3 | - |
| 47 | 2476 | Sternocleidomastoid muscle | neck flex + 1; neck turn contra 1; neck side ipsi 0.8 | - |
