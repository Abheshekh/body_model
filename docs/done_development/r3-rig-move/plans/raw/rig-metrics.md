# R3 rig metrics: smooth vs rigid weights

Written by tools/pipeline/v5/test_rig.py (Acceptance) on the built data. Per pose and sex: the muscle part with the highest share of edges stretched > 2x rest (tear, limit 2%) and of triangles flipped against the skin-rotated rest normal (flip, limit 1%), for the smooth weights (weights.bin.gz) and the R11 rigid fallback (weights_rigid.bin.gz). Bones are rigid in both, so the articulation gap is the same for both sets (limit < 1 cm).

| pose | sex | smooth worst tear | smooth worst flip | rigid worst tear | rigid worst flip | max articulation gap change (both sets) |
|---|---|---|---|---|---|---|
| elbow90 | M | Abductor digiti minimi of foot.l 0.000% | Extensor carpi radialis brevis.l 0.638% | Teres major muscle.l 1.852% | Superficial head of pronator teres.l 2.516% | Femur.r-Hip bone.r 0.09 cm |
| elbow140 | M | Abductor digiti minimi of foot.l 0.000% | Superficial head of pronator teres.l 1.572% | Long head of triceps brachii.l 3.584% | Superficial head of pronator teres.l 4.088% | Humerus.r-Ulna.r 0.13 cm |
| abd90 | M | Teres major muscle.l 0.694% | Clavicular head of pectoralis major muscle.l 0.472% | Pectoralis minor muscle.r 17.086% | Acromial part of deltoid muscle.l 8.243% | Humerus.r-Ulna.r 0.13 cm |
| abd170 | M | Teres major muscle.l 29.167% | Serratus anterior muscle.l 6.292% | Pectoralis minor muscle.r 27.079% | Supraspinatus muscle.l 14.888% | Humerus.r-Ulna.r 0.13 cm |
| flex90 | M | Teres major muscle.l 1.157% | Teres major muscle.l 2.083% | Pectoralis minor muscle.r 18.633% | Pectoralis minor muscle.l 16.731% | Humerus.r-Ulna.r 0.13 cm |
| hip90 | M | Adductor brevis.l 0.251% | Pectineus muscle.l 11.475% | Superior gemellus muscle.l 18.667% | Pectineus muscle.l 13.525% | Femur.l-Hip bone.l 0.17 cm |
| knee120 | M | Sartorius muscle.l 0.108% | Lateral head of gastrocnemius.l 3.589% | Vastus intermedius muscle.l 3.290% | Popliteus muscle.l 9.574% | Humerus.r-Ulna.r 0.13 cm |
| trunk45 | M | Abductor digiti minimi of foot.l 0.000% | Superficial head of pronator teres.l 0.157% | Teres major muscle.l 1.852% | Internal abdominal oblique muscle.l 5.971% | Humerus.r-Ulna.r 0.13 cm |
| squat | M | Inferior gemellus muscle.l 1.093% | Pectineus muscle.l 13.320% | Superior gemellus muscle.l 20.667% | Iliopectineal arch.r 13.636% | Humerus.r-Ulna.r 0.13 cm |
| overhead | M | Teres major muscle.l 29.630% | Coracobrachialis muscle.l 5.862% | Pectoralis minor muscle.r 30.045% | Subscapularis muscle.l 9.214% | Humerus.r-Ulna.r 0.13 cm |
| elbow90 | F | Abductor digiti minimi of foot.l 0.000% | Superficial head of pronator teres.l 0.786% | Long head of triceps brachii.l 1.555% | Superficial head of pronator teres.l 5.189% | Humerus.r-Radius.r 0.45 cm |
| elbow140 | F | Extensor carpi radialis brevis.l 0.085% | Superficial head of pronator teres.l 4.403% | Long head of triceps brachii.l 3.448% | Superficial head of pronator teres.l 5.189% | Humerus.r-Radius.r 0.15 cm |
| abd90 | F | Teres major muscle.l 1.620% | Serratus anterior muscle.r 0.555% | Pectoralis minor muscle.r 13.540% | Supraspinatus muscle.l 9.831% | Humerus.r-Ulna.r 0.11 cm |
| abd170 | F | Teres major muscle.r 23.611% | Serratus anterior muscle.r 6.672% | Pectoralis minor muscle.r 24.565% | Supraspinatus muscle.l 14.607% | Humerus.r-Ulna.r 0.11 cm |
| flex90 | F | Teres major muscle.l 2.546% | Coracobrachialis muscle.l 2.414% | Pectoralis minor muscle.l 15.538% | Pectoralis minor muscle.l 16.248% | Humerus.r-Ulna.r 0.11 cm |
| hip90 | F | Superior gemellus muscle.l 2.000% | Pectineus muscle.l 1.844% | Superior gemellus muscle.l 19.333% | Pectineus muscle.l 9.631% | Humerus.r-Ulna.r 0.11 cm |
| knee120 | F | Plantaris muscle.l 0.227% | Lateral head of gastrocnemius.l 1.387% | Rectus femoris muscle.l 3.159% | Medial head of gastrocnemius.l 3.908% | Humerus.r-Ulna.r 0.11 cm |
| trunk45 | F | Abductor digiti minimi of foot.l 0.000% | Anconeus muscle.l 0.278% | Interspinales lumborum muscles.l 1.905% | Internal abdominal oblique muscle.r 4.951% | Humerus.r-Ulna.r 0.11 cm |
| squat | F | Superior gemellus muscle.l 3.333% | Pectineus muscle.l 6.967% | Superior gemellus muscle.l 20.000% | Pectineus muscle.l 11.885% | Humerus.r-Ulna.r 0.11 cm |
| overhead | F | Teres major muscle.r 22.917% | Teres minor muscle.l 5.263% | Pectoralis minor muscle.r 28.111% | Clavicular head of pectoralis major muscle.l 9.434% | Humerus.r-Ulna.r 0.11 cm |
