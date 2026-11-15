# Body Model: Android builds.
#   make apk   debug APK, installable on a phone   -> ./output/body-model-debug.apk
#   make aab   signed release bundle for Play Store -> ./output/body-model-release.aab
#   make run   Vite dev server reachable on the LAN (open the printed Network URL on the phone)
#   make install  install the debug APK on a USB-connected phone (adb)
#
# Needs: Node, JDK 21, Android SDK (ANDROID_HOME or ANDROID_SDK_ROOT set).
# JDK 21 is picked in this order: JAVA_HOME if it is 21+, `/usr/libexec/java_home -v 21`,
# then the JDK bundled with Android Studio.
# The first run adds Capacitor to package.json and creates the android/ project.
#
# APP_ID is permanent once the app is on the Play Store. Change it before the first upload.

APP_ID   ?= com.bodymodel.app
APP_NAME ?= Body Model
OUT      := output
NAME     := body-model
GRADLE   := cd android && ./gradlew

# First JDK whose java reports major version >= 21. The shell java is often 17, so never trust it blindly.
JDK := $(shell for h in "$$JAVA_HOME" "$$(/usr/libexec/java_home -v 21 2>/dev/null)" "/Applications/Android Studio.app/Contents/jbr/Contents/Home"; do \
  v=$$("$$h/bin/java" -version 2>&1 | sed -n 's/.*version "\([0-9]*\).*/\1/p' | head -1); \
  [ -n "$$h" ] && [ -n "$$v" ] && [ "$$v" -ge 21 ] && { echo "$$h"; break; }; done)
ifneq ($(JDK),)
export JAVA_HOME := $(JDK)
endif

# Release signing for `make aab`. Put these in .env.local (ignored by git) or pass them on the command line.
-include .env.local
KEYSTORE      ?=
KEYSTORE_PASS ?=
KEY_ALIAS     ?=
KEY_PASS      ?= $(KEYSTORE_PASS)

.PHONY: apk aab run install _check _web

run:
	npm run dev -- --host

install:
	adb install -r $(OUT)/$(NAME)-debug.apk

apk: _web
	$(GRADLE) assembleDebug
	mkdir -p $(OUT)
	cp android/app/build/outputs/apk/debug/app-debug.apk $(OUT)/$(NAME)-debug.apk
	@echo "APK: $(OUT)/$(NAME)-debug.apk"

aab: _web
	@test -n "$(KEYSTORE)" && test -f "$(KEYSTORE)" || { \
	  echo "No keystore. Set KEYSTORE, KEYSTORE_PASS and KEY_ALIAS in .env.local. Create a keystore with:"; \
	  echo "  keytool -genkeypair -v -keystore release.jks -keyalg RSA -keysize 2048 -validity 10000 -alias bodymodel"; exit 1; }
	@test -n "$(KEYSTORE_PASS)" && test -n "$(KEY_ALIAS)" || { echo "Set KEYSTORE_PASS and KEY_ALIAS."; exit 1; }
	@echo "gradlew bundleRelease (signing with $(KEYSTORE))"
	@$(GRADLE) bundleRelease \
	  -Pandroid.injected.signing.store.file="$(abspath $(KEYSTORE))" \
	  -Pandroid.injected.signing.store.password="$(KEYSTORE_PASS)" \
	  -Pandroid.injected.signing.key.alias="$(KEY_ALIAS)" \
	  -Pandroid.injected.signing.key.password="$(KEY_PASS)"
	mkdir -p $(OUT)
	cp android/app/build/outputs/bundle/release/app-release.aab $(OUT)/$(NAME)-release.aab
	@jarsigner -verify $(OUT)/$(NAME)-release.aab | grep -q "jar verified" || { echo "The bundle is NOT signed. Play Store will reject it."; exit 1; }
	@echo "AAB: $(OUT)/$(NAME)-release.aab (signed)"

_check:
	@command -v node >/dev/null || { echo "Node is missing."; exit 1; }
	@test -n "$(JDK)" || { echo "JDK 21 not found. Install JDK 21 or Android Studio."; exit 1; }
	@echo "JDK: $(JDK)"
	@test -n "$$ANDROID_HOME$$ANDROID_SDK_ROOT" || test -f android/local.properties || { echo "Android SDK not found. Set ANDROID_HOME."; exit 1; }

# Build the web app. On the first run add Capacitor and the android/ project. Then copy the web build in.
_web: _check
	@test -d node_modules/@capacitor/android || npm install --legacy-peer-deps @capacitor/core @capacitor/android @capacitor/cli
	@ls capacitor.config.* >/dev/null 2>&1 || npx cap init "$(APP_NAME)" "$(APP_ID)" --web-dir dist
	npm run build
	@test -d android || npx cap add android
	npx cap sync android
