# Build versions (T4, 2026-11-14)

| Item | Value | How read |
|---|---|---|
| JDK | OpenJDK 21.0.10 (JetBrains Runtime, build 21.0.10+-117844308-b1163.108), from `/Applications/Android Studio.app/Contents/jbr/Contents/Home` | `$JAVA_HOME/bin/java -version`; the Makefile picked it (shell JAVA_HOME is 17, `/usr/libexec/java_home -v 21` finds none) |
| Gradle | 8.14.3 (Kotlin 2.0.21) | `./gradlew --version` |
| AGP | 8.13.0 | android/build.gradle |
| compileSdk / targetSdk / minSdk | 36 / 36 / 24 | android/variables.gradle |
| Build-tools | 35.0.0 | used by the build (`android/app/build/intermediates`) |
| Capacitor (cli, core, android) | 8.6.2 | node_modules/@capacitor/*/package.json |
| Node used for the build | v24.15.0 (nvm) | see Node note below |
| Debug APK | 6,099,636 bytes | `stat -f %z output/body-model-debug.apk` |
| Release AAB (throwaway key) | 4,912,050 bytes | `stat -f %z output/body-model-release.aab` |

Results: `make apk` printed `APK: output/body-model-debug.apk` (BUILD SUCCESSFUL in 58 s, 93 tasks). `make aab KEYSTORE=<scratchpad>/throwaway.jks …` printed `AAB: output/body-model-release.aab (signed)`. `jarsigner -verify output/body-model-release.aab` printed `jar verified.`, with the expected warnings for a self-signed, 1-day, untimestamped key. The keystore stayed in the session scratchpad, outside the repo.

## Node note
In the agent shell, `node` on PATH is 20.19.6 from a foreign pixi env, and `npx cap sync` fails with "The Capacitor CLI requires NodeJS >=22.0.0". Decision (main, PLAN §12): no Makefile change. Agent runs prefix `PATH=$HOME/.nvm/versions/node/v24.15.0/bin:$PATH`. The user's own shell already has a working Node.

## Gradle download note
After `networkTimeout=120000` the wrapper still failed: `java.net.ConnectException: Operation timed out`, at `org.gradle.wrapper.Install.forceFetch`.

Cause: services.gradle.org redirects (307) to github.com, which redirects (302) to release-assets.githubusercontent.com. That host resolves to 185.199.108.133, .109.133, .110.133 and .111.133. From this network 185.199.109.133 does not connect (`curl --resolve … :443:185.199.109.133` fails; the other three answer in about 6 ms). Java resolved .109.133 first and does not fall back to the other addresses. curl does fall back, so it downloads fine (about 7 MB/s).

Fix (main allowed it, PLAN §12): fetch the zip with curl and drop it into the wrapper's existing hash folder. The wrapper reuses a zip that is already there.
```
D=~/.gradle/wrapper/dists/gradle-8.14.3-all/10utluxaxniiv4wxiphsi49nj
rm "$D/gradle-8.14.3-all.zip.part"
curl -fsSL -o gradle.sha256 https://services.gradle.org/distributions/gradle-8.14.3-all.zip.sha256
curl -fsSL -o gradle-8.14.3-all.zip https://services.gradle.org/distributions/gradle-8.14.3-all.zip
shasum -a 256 gradle-8.14.3-all.zip   # ed1a8d686605fd7c23bdf62c7fc7add1c5b23b2bbc3721e661934ef4a4911d7c = .sha256 file
mv gradle-8.14.3-all.zip "$D/"
```
Zip size: 224,584,249 bytes. On another network the plain wrapper download may work, because the dead IP is network-specific.
