#!/usr/bin/env bash
# Builds the Android App Bundle to upload to Google Play, signed with the
# upload key in cafe-secrets/. Play re-signs it with the app signing key it
# holds (Play App Signing), so the upload key only proves an upload is yours.
#   scripts/build-play-bundle.sh            → dist/play-<versionCode>.aab
#   scripts/build-play-bundle.sh --new-key  makes the upload key, once, before the first upload
# Needs JDK 17+ (JAVA_HOME) and the Android SDK (ANDROID_HOME). Takes ~10 minutes.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
keystore="$root/cafe-secrets/upload-keystore.jks"
props="$root/cafe-secrets/upload-keystore.properties"
export JAVA_HOME="${JAVA_HOME:-$HOME/.local/jdk}"
export ANDROID_HOME="${ANDROID_HOME:-$HOME/Android/Sdk}"
keytool="$JAVA_HOME/bin/keytool"

if [[ "${1:-}" == "--new-key" ]]; then
  if [[ -e "$keystore" ]]; then
    echo "$keystore already exists. Play only accepts uploads signed with it, so don't replace it." >&2
    exit 1
  fi
  mkdir -p "$root/cafe-secrets"
  UPLOAD_KEY_PASSWORD="$(openssl rand -base64 32 | tr -d '/+=')"
  export UPLOAD_KEY_PASSWORD
  bundle_id="$(cd "$root" && bun -p "require('./cafe.config.json').bundleId")"
  (
    umask 077
    "$keytool" -genkeypair -keystore "$keystore" -storetype PKCS12 -alias upload -keyalg RSA -keysize 4096 \
      -validity 10000 -dname "CN=$bundle_id upload key" -storepass:env UPLOAD_KEY_PASSWORD
    printf 'password=%s\n' "$UPLOAD_KEY_PASSWORD" > "$props"
  )
  echo "Made $keystore. Back up cafe-secrets/ offline: every Play upload must be signed with this key."
  exit 0
fi

if [[ ! -f "$keystore" || ! -f "$props" ]]; then
  echo "No upload key in cafe-secrets/. Restore it from your backup (or, before the very first upload only, run with --new-key)." >&2
  exit 1
fi
UPLOAD_KEY_PASSWORD="$(sed -n 's/^password=//p' "$props")"
export UPLOAD_KEY_PASSWORD

# Play needs a higher versionCode on every upload. Minutes since 1970 always is.
ANDROID_VERSION_CODE="$(($(date +%s) / 60))"
export ANDROID_VERSION_CODE

cd "$root"
# --clean: a release is built from the config alone, never from leftovers of an older one.
bunx expo prebuild --platform android --clean --no-install
(
  cd android
  env "ORG_GRADLE_PROJECT_android.injected.signing.store.file=$keystore" \
    "ORG_GRADLE_PROJECT_android.injected.signing.store.password=$UPLOAD_KEY_PASSWORD" \
    "ORG_GRADLE_PROJECT_android.injected.signing.key.alias=upload" \
    "ORG_GRADLE_PROJECT_android.injected.signing.key.password=$UPLOAD_KEY_PASSWORD" \
    ./gradlew bundleRelease --no-daemon
)

# Without the upload key Gradle quietly signs with the debug key, which Play rejects.
aab="$root/android/app/build/outputs/bundle/release/app-release.aab"
fingerprint() { sed -n 's/^[[:space:]]*SHA256: //p' | head -1; }
expected="$("$keytool" -list -v -keystore "$keystore" -alias upload -storepass:env UPLOAD_KEY_PASSWORD | fingerprint)"
actual="$("$keytool" -printcert -jarfile "$aab" | fingerprint)"
if [[ -z "$expected" || "$actual" != "$expected" ]]; then
  echo "$aab isn't signed with the upload key (got '${actual:-no signature}')." >&2
  exit 1
fi

mkdir -p dist
out="dist/play-$ANDROID_VERSION_CODE.aab"
cp "$aab" "$out"
echo "Built $root/$out (versionCode $ANDROID_VERSION_CODE), signed with the upload key."
