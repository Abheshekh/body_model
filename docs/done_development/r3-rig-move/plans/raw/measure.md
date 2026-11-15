# R3 T9 measurements

Shots: tools/shots/cdp-shot.mjs, 1440x900 (Move 390x844, exercise frames 390x844), headless Chrome with SwiftShader, depth=outer (superficial muscles, skin hidden), files in docs/reports/r3/.
Side camera (bodyViewer.setView('side')) for hip90, knee120, trunk45, squat, flex90; front camera for the rest.

## APK
`make apk` OK. output/body-model-debug.apk = 20971655 bytes.

## Pose shots (one line each, looked at every one)
- pose-elbow90-male: forearms flexed to 90, hands in front of the belly; no tears or inside-out parts seen; elbows clean.
- pose-elbow140-male: forearms folded up to the shoulders; thin dark strand hanging at each elbow (stretched fibre, minor); rest clean.
- pose-abd90-male: arms straight out; clean, small stretched muscle slivers at the armpits.
- pose-abd170-male: arms up; pectoral/deltoid/teres flaps stretched sideways at both shoulders (winged, torn look); arms and trunk fine. Matches the 29% teres major tear in rig-metrics.md.
- pose-flex90-male (side): arms forward 90; clean, scapula/serratus region slightly ragged.
- pose-hip90-male (side): leg raised 90 with knee straight; thigh and shin clean; dark spike behind the hip (stretched gluteal/gemellus fibres), no inside-out.
- pose-knee120-male (side): shank folded back; clean; no tears at the knee.
- pose-trunk45-male (side): bent forward, arms hang; clean; a few ragged shoulder fibres.
- pose-squat-male (side): deep squat, flat feet, torso leaning; dark spike at the glute/hip and ragged scapular area; no inside-out.
- pose-overhead-male: arms straight up; same winged shoulder flaps as abd170; arms leave the top of the frame (camera framing, not a defect).
- pose-elbow90-female: clean, same as male.
- pose-elbow140-female: clean; thin dark strand at each elbow (minor).
- pose-abd90-female: clean; hands show red specks at the fingers (fine muscle slivers).
- pose-abd170-female: winged shoulder flaps as in male; arms go out of frame at the top.
- pose-flex90-female (side): clean.
- pose-hip90-female (side): clean thigh and shin; dark spike behind the hip as in male.
- pose-knee120-female (side): clean.
- pose-trunk45-female (side): clean; ragged shoulder fibres.
- pose-squat-female (side): same as male: dark hip spike, ragged scapular area; no inside-out.
- pose-overhead-female: winged shoulder flaps as male; arms leave the frame at the top.
Skin: not shown in these shots (outer = muscles); no skin check was made here.

## Move and exercise shots
- move-390.png (#workouts/move, male, 390x844): skin body, 12-odd joint handles visible, undo/redo/view buttons and hint in the sheet; body fully visible above the sheet.
- ex-curl-male / ex-curl-female (curl, standing barbell, top = slider 100): forearms folded, bar at chest, biceps marked prime in red; clean.
- ex-squat-male / ex-squat-female (squat, back, bottom = slider 100): deep squat, bar behind the head/shoulders, quads and glutes marked; shoulder/scapula fibres ragged, bar partly out of frame on the right.
