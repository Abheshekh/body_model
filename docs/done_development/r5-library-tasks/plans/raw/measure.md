# Measurements (T13)
- APK: `rm -f output/body-model-debug.apk && make apk` (Node 24.15.0) -> output/body-model-debug.apk = 20,963,609 bytes (20.0 MiB), rebuilt after the fix round.
- Desktop fps, player (back-squat, playing, 10 s): 3 fps (30 frames), headless Chrome on SwiftShader (software GL, 390x844). Not representative of a GPU; no GPU run was made.
- Phone fps: unmeasured (`adb devices` lists no device).
- Phone layout (tools/library/layout.mjs, 390x844): `layout ok` after the fix round (player and builder open: lens zoom 0.85 because the viewer caps camera distance at 6 m). Body box measured by a colour heuristic.
- Ghost: was invisible (ShaderMaterial `opacity` was never a uniform, so alpha was 0); fixed in src/body/scene.ts createGhost; docs/reports/r5/player-compare-ghost.png shows it.
- Engine timing (tools/engine/cases.mjs --time): effort 0.20-0.21 ms, effortOverMove(9) 1.95-2.11 ms.
- Task cases: plans/raw/cases.md.
- Fix round: joints.json pelvis pitch min -120; check.mjs failing 0 of 50; 504 tests pass; reviewed true on 25 of 50 (glute-bridge still NOT OK).
