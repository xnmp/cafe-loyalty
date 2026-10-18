# Handover

Where this project stands, for whoever picks it up next (human or agent).
User-facing docs: [README](README.md), [release guide](docs/RELEASE.md),
[architecture](docs/ARCHITECTURE.md).

## State (2026-10-18)

- Feature-complete for v1: stamp card, NFC tap-to-collect (Android HCE counter
  phone → iOS/Android customers), QR fallback both ways, counter-verified
  rewards with a SQLite spent-stamp registry, history, about, staff setup with
  PIN, counter settings.
- `bun run test` (29 suites, ~750 tests), `bunx tsc --noEmit` and
  `bunx eslint . --quiet` all pass.
- Verified on an Android emulator (no NFC): deep-link stamps, unlock, reward
  ticket → redeem sheet → code, code re-shown from History, the counter's
  stamp QR (decoded and signature-checked), redeem → scanner, counter
  provisioning, leaving counter mode. Redemption codes decoded from the
  screen were verified against `verifyRedemption` and refused the second time.
- **Not verified anywhere yet**: real NFC between two phones, iOS builds, the
  counter camera scanning a customer's code. `docs/RELEASE.md` §7 is the
  hardware checklist.
- Security: one audit (Codex; its content filter cut it short, but its
  findings were recovered from the transcript) and four review rounds of the
  "open the reward before a tap can spend it" change. What's left is listed
  as accepted risks, each with its limit, in `docs/ARCHITECTURE.md`.
- Test build for the two-phone check: `dist/corner-cafe-test.apk` (current as
  of the last commit).
- Signing key: key 2 is the only trusted key (key 1 retired, its secret
  deleted). The secret and staff QR are in `cafe-secrets/` (gitignored, keep
  an offline backup).

## Gotchas found the hard way

- **No Reanimated `entering`/`exiting` layout animations inside a `Modal`.**
  On Android they intermittently leave views stuck invisible (opacity 0). Use
  `Appear` from `src/ui/motion.tsx` or explicit shared values (see
  `src/ui/Sheet.tsx`). Reproduced roughly 1 in 6 opens before the fix, 0 in 50 after.
- Reanimated reads reduced motion once per process (`transition_animation_scale`
  = 0); `uiautomator dump` on the emulator can flip animation scales to 0.
- Whether an NFC tap may spend a reward is decided only in the card store
  (`using`, transitions in `src/state/rewardUse.ts`), checked and claimed in
  one synchronous step as it replies. Don't pass a "may redeem" flag down from
  the UI: two review rounds found races wherever screen state and the reader
  disagreed (a second reward spent mid-save, proofs sent behind feedback).
- A redemption code (QR) contains real signed stamps: never put one in a store
  screenshot. `scripts/render-store.ts` says so too.
- Signature checks are slow without a JIT: about 1 s for 9 proofs under
  `node --jitless`, so expect 2–4 s on a mid-range counter phone.
  `docs/RELEASE.md` asks to time it on hardware. If it's too slow: faster
  Ed25519 (native/JSI), or let the counter skip re-verifying token bytes it
  issued itself (it would need to store their hashes).
- The emulator was run `-read-only`: app data is lost when it stops.

## Useful commands

```sh
bun scripts/dev-token.ts stamp 3        # signed stamp deep link for testing
bun run render-brand                    # icons/splash from cafe.config.json
bun run render-store                    # Play graphics from docs/store/raw/
bun run setup-cafe check|new-key|retire <id>|print
```

iOS compile check without a Mac: GitHub → xnmp/cafe-loyalty (private) →
Actions → **iOS simulator build** → Run workflow (`gh workflow run
ios-simulator.yml`). It builds unsigned for the simulator, launches the app
and uploads screenshots. The simulator has no NFC.

HCE unit tests (from `android/` after `bunx expo prebuild --platform android`):
`./gradlew :cafe-hce:testDebugUnitTest`.

A sideloadable test build for the two-phone NFC check is at
`dist/corner-cafe-test.apk` (gitignored). It's signed with the debug key.
RELEASE.md §7 explains how to rebuild it and what uninstalling it wipes. The
local Gradle build takes about 11 minutes and a lot of RAM. Use `--no-daemon`
so nothing stays resident afterwards.
