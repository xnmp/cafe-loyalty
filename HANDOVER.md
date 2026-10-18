# Handover

Where this project stands, for whoever picks it up next (human or agent).
User-facing docs: [README](README.md), [release guide](docs/RELEASE.md),
[architecture](docs/ARCHITECTURE.md).

## State (2026-10-18)

- Feature-complete for v1: stamp card, NFC tap-to-collect (Android HCE counter
  phone → iOS/Android customers), QR fallback both ways, counter-verified
  rewards with a SQLite spent-stamp registry, history, about, staff setup with
  PIN, counter settings.
- 1.0.1 added **Report a problem** (About, counter Settings, and the "couldn't
  open your card" screen). It opens the reporter's own email app with the
  message, app version and phone filled in, plus an optional screenshot from
  the system photo picker, so the app still makes no network requests. Reports
  go to `supportEmail` in `cafe.config.json`: the Google Group
  eastern-concourse-cafe-support@googlegroups.com (anyone can post; only
  members read). It's also the public contact on Play and in the privacy policy.
  Add the café owners as members so they get reports.
- The card screen fits without scrolling on small phones (`src/features/card/fit.ts`):
  the stamps shrink first, then the header goes compact, and past 36 dp stamps it
  scrolls. Checked on a 360×760 dp emulator with 3-button navigation.
- `bun run test` (31 suites, ~815 tests), `bunx tsc --noEmit` and
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
- Test build for the two-phone check: `dist/test.apk` (current as
  of the last commit).
- Signing key: key 3 is the only trusted key. Its secret and staff QR are in
  `cafe-secrets/`, with the Play upload key (gitignored, keep an offline
  backup). Key id 0 is the public demo code for app reviewers
  (`docs/review/`). It is never trusted: config validation, `keyRingOf` and
  the key helpers all refuse it.
- Google Play: every App content declaration is filed, and the store listing is
  complete (graphics declared as AI-made). Internal testing is live for the
  owner's email (1.0.0); 1.0.1 goes to internal next. The closed test, with
  the testers Google Group, has a draft release and still has to be sent for
  review from Publishing overview.
  `docs/RELEASE.md` §4 has the state and the road to production (12 testers for
  14 days). Bundles are built locally with `scripts/build-play-bundle.sh`, not
  EAS.

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
bun run setup-cafe check|new-key|retire <id>|print|demo
scripts/build-play-bundle.sh            # signed .aab for Play → dist/
```

iOS compile check without a Mac: GitHub → xnmp/cafe-loyalty →
Actions → **iOS simulator build** → Run workflow (`gh workflow run
ios-simulator.yml`). It builds unsigned for the simulator, launches the app
and uploads a screenshot. The simulator has no NFC, and deep links stop at an
"Open in …?" prompt there, so it can't reach other screens.

HCE unit tests (from `android/` after `bunx expo prebuild --platform android`):
`./gradlew :cafe-hce:testDebugUnitTest`.

A sideloadable test build for the two-phone NFC check is at
`dist/test.apk` (gitignored). It's signed with the debug key.
RELEASE.md §7 explains how to rebuild it and what uninstalling it wipes. The
local Gradle build takes about 11 minutes and a lot of RAM. Use `--no-daemon`
so nothing stays resident afterwards.
