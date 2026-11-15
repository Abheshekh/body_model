# m1b-android-programs: test plan

## Automated tests
| ID | AC | Command | Expected | Exit |
|---|---|---|---|---|
| A1 | AC5 | `npm run lint` | no errors | 0 |
| A2 | AC5 | `npm test` | regex: `Tests\s+\d+ passed` and no failed | 0 |
| A3 | AC5 | `npm run build` | regex: `built in` | 0 |
| A4 | AC3, AC7 | `npx vitest run src/programs/programs.test.ts` | parseRoute: `#programs/pelvic-floor` gives programs and its id, `#profile`, `#credits`, empty gives explore; male profile list lacks sexual-health-female and canOpen false; the reverse for female; null profile → []; `all` programs visible to both | 0 |
| A5 | AC4 | `npx vitest run src/programs/data.test.ts` | five ids present; every claim has a label in the enum and source.title; non-convention claims have an `https://` url; items animated false; claim ids resolve; targets resolve via partIdsByName with missing = []; non-null dose has a source url; adultOnly true only on the two sexual-health programs; male program has a note containing `not in this anatomy model`; female and pelvic-floor programs have the note `The body shown is male anatomy.`; every program has a convention claim with `source.url` null; no text matches `/jelq|enlarg|lengthen the penis|supplement|stop(ping)? (the )?(urine|flow)/i` outside cautions | 0 |
| A6 | AC6 | `npx vitest run src/me/profile.test.ts` | height 99 / 100 / 250 / 251 and mass 24 / 25 / 300 / 301 boundaries; bad sex → null; NaN, Infinity and string heights → null; profileErrors gives a message per bad field and `{}` when valid; isAdultConfirmed false until confirmAdult, then true; invalid JSON → null; a throwing Storage → load null, save false | 0 |
| A7 | AC6 | `grep -rn "fetch(" src --include=*.ts \| grep -v test \| grep -vc "BASE_URL"` | `0` | 1 (grep finds none) |
| A8 | AC1 | `make apk` | regex: `APK: output/body-model-debug.apk` and file exists | 0 |
| A9 | AC1 | `grep -n "networkTimeout=120000" android/gradle/wrapper/gradle-wrapper.properties` | one line | 0 |
| A10 | AC2 | `jarsigner -verify output/body-model-release.aab` (uses the AAB T4 left in output/; the throwaway keystore stays in the scratchpad) | `jar verified.` | 0 |
| A11 | AC2 | `git ls-files \| grep -Ec "\.(jks\|keystore)$"` | `0` | 1 |
| A12 | AC4 | `npx vitest run src/body/model.test.ts` | partIdsByName: both sides matched; exact name matched; unknown → missing | 0 |
| A13 | AC9 | `grep -n "^run:" Makefile && grep -n "^install:" Makefile` | both found | 0 |
| A14 | AC11 | `test -f docs/reports/M1b.md && grep -c "convention\|moderate\|strong" docs/reports/M1b.md` | ≥ 7 | 0 |

## AC → tests
| AC | Tests |
|---|---|
| AC1 | A8, A9 |
| AC2 | A10, A11 |
| AC3 | A4 |
| AC4 | A5, A12 |
| AC5 | A1, A2, A3 |
| AC6 | A6, A7 |
| AC7 | M2 |
| AC8 | M3 |
| AC9 | A13, M5 |
| AC10 | M1 |
| AC11 | A14 |

## Manual checks (not run by tester)
| ID | AC | What | How | Passes when |
|---|---|---|---|---|
| M1 | AC10 | install, offline open, load, fps | Enable USB debugging, connect, `make install`, then airplane mode and open the app. In desktop Chrome open `chrome://inspect`, then the WebView console: read "Body load time". Run `location.search='?fps=1'` and read the overlay after 10 s of orbiting. | Opens offline; numbers go into M1b.md |
| M2 | AC7 | 18+ gate | Profile male → Programs → Sexual health (male) | Gate shows first; Back returns to the list |
| M7 | AC6 | screenshots | Open docs/reports/m1b/*.png | list, gate, detail and pelvic view look clean at 360 px: no overflow, chips readable |
| M3 | AC8 | pelvic view | Programs → Pelvic floor → an item | Pelvic floor highlighted from below, bones translucent, male-anatomy banner shown |
| M4 | AC3 | profile switch | Profile → female → Programs | Only the female sexual-health program is listed |
| M5 | AC9 | make run | `make run`, open the LAN URL on the phone | Body loads |
| M6 | AC6 | first launch | Clear site data and reload | Only the profile form shows; after Save, Explore shows |
