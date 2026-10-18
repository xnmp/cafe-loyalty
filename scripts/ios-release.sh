#!/usr/bin/env bash
# Builds the iPhone app in Expo's cloud (EAS: no Mac needed), uploads it to
# App Store Connect and TestFlight, and fills in the App Store listing from
# store.config.json.
#   scripts/ios-release.sh       (or: bun run ios-release)
# Needs a free Expo account and a paid Apple Developer account; it asks you to
# sign in to both. The first run also makes the signing certificates, registers
# the bundle ID with NFC switched on, and creates the app in App Store Connect.
# docs/app-store.md walks through what's left afterwards.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"
eas() { bunx eas-cli "$@"; }
uuid='[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'

echo "== 1/4 Expo account"
if ! eas whoami >/dev/null 2>&1; then
  echo "Sign in to Expo. No account yet? Make a free one at https://expo.dev/signup, then come back."
  eas login
fi

echo "== 2/4 Link this project to Expo (first run only)"
project_id="$(bun -p "require('./cafe.config.json').easProjectId || ''")"
if [[ -z "$project_id" ]]; then
  # The project belongs to the signed-in user's own account (whoami's first line), not
  # whichever organisation EAS would pick on its own.
  owner="$(eas whoami 2>/dev/null | sed -n 1p | sed 's/\x1b\[[0-9;]*m//g')"
  # app.config.ts is code, so eas init can't save the project ID into it. It fails
  # and prints the setting to add instead, {"extra": {"eas": {"projectId": "..."}}},
  # so only that line counts: its errors can contain other IDs, such as request IDs.
  output="$(eas init --non-interactive --force --account "$owner" 2>&1 || true)"
  printf '%s\n' "$output"
  # shellcheck disable=SC2001 # Stripping colour codes needs a regex.
  project_id="$(sed 's/\x1b\[[0-9;]*m//g' <<<"$output" | grep -oE "\"projectId\": \"$uuid\"" | grep -oE "$uuid" | tail -1 || true)"
  if [[ -z "$project_id" ]]; then
    echo "Let's do that step by hand. Answer yes to creating the project."
    eas init || true
    read -rp "Paste the project ID it printed (it looks like 1a2b3c4d-...): " project_id
  fi
  if [[ ! "$project_id" =~ ^$uuid$ ]]; then
    echo "That isn't a project ID (it looks like 1a2b3c4d-...). Run this again." >&2
    exit 1
  fi
  # shellcheck disable=SC2016 # JavaScript, not shell: the template literal is meant for bun.
  PROJECT_ID="$project_id" bun -e '
    const fs = require("node:fs");
    const config = JSON.parse(fs.readFileSync("cafe.config.json", "utf8"));
    fs.writeFileSync("cafe.config.json", `${JSON.stringify({ ...config, easProjectId: process.env.PROJECT_ID }, null, 2)}\n`);'
  echo "Saved the project ID in cafe.config.json. Commit it, so later builds use the same project."
fi

echo "== 3/4 Build in the cloud and upload to App Store Connect (about 20-40 minutes)"
echo "When asked: sign in with your Apple ID, enter the code your iPhone shows, and answer yes to"
echo "making a distribution certificate, a provisioning profile and an App Store Connect API key."
eas build --platform ios --profile production --auto-submit

echo "== 4/4 Fill in the App Store listing from store.config.json"
eas metadata:push

echo
echo "Done. The build shows up in TestFlight once Apple has processed it (usually 10-30 minutes)."
echo "What's left is clicking through App Store Connect: docs/app-store.md, from step 4."
