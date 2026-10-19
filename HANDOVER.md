# Handover

Where this project stands, for whoever picks it up next (human or agent).
User-facing docs: [README](README.md), [release guide](docs/RELEASE.md),
[architecture](docs/ARCHITECTURE.md). The owner's to-do list for getting to
production is [NEXT_STEP.md](NEXT_STEP.md).

## State (2026-10-19)

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
- `bun run test` (35 suites, ~840 tests), `bunx tsc --noEmit` and
  `bunx eslint . --quiet` all pass.
- Verified on an Android emulator (no NFC): deep-link stamps, unlock, reward
  ticket → redeem sheet → code, code re-shown from History, the counter's
  stamp QR (decoded and signature-checked), redeem → scanner, counter
  provisioning, leaving counter mode. Redemption codes decoded from the
  screen were verified against `verifyRedemption` and refused the second time.
- **Not verified anywhere yet**: real NFC between two phones, a signed iOS
  build on a real iPhone, the counter camera scanning a customer's code. `docs/RELEASE.md` §7 is the
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
  complete (graphics declared as AI-made). Internal testing is live with
  1.0.1 (29872142) for the owner's email. The closed test (1.0.1, Australia,
  the testers Google Group, feedback to the support group) was sent for review
  with the store listing and app content, rejected over the financial features
  declaration (see Gotchas), and resent on 2026-10-19. **Once it's approved,
  update Data safety** to declare purchase history (`docs/RELEASE.md` §4 has
  the answers); the owner decided on 2026-10-19 to declare the counter's
  spent-stamp registry on both stores, and the privacy policy and iOS
  manifest already do.
  `docs/RELEASE.md` §4 has the state and the road to production (12 testers for
  14 days). Bundles are built locally with `scripts/build-play-bundle.sh`, not
  EAS.
- App Store: ready apart from the owner's Apple Developer account. The
  owner's walkthrough is [docs/app-store.md](docs/app-store.md);
  `bun run ios-release` (EAS build, auto-submit, `eas metadata:push`) does the
  first-run setup too, including creating the App Store Connect app.
  Listing text is `store.config.json`, screenshots are `docs/store/app-store/`
  (captured by the iOS simulator workflow with *screenshots* ticked), and the
  privacy manifest in `app.config.ts` is checked against the installed
  libraries by `app.config.test.ts`. iPhone-only (`supportsTablet: false`):
  iPads have no NFC. Not done yet: `easProjectId` (the script sets it on its
  first run; commit it).
- The Android build in closed testing predates the spring fix (2026-10-19),
  so its sheets and buttons still bounce too much; the next Play bundle fixes
  that.

## Gotchas found the hard way

- **No Reanimated `entering`/`exiting` layout animations inside a `Modal`.**
  On Android they intermittently leave views stuck invisible (opacity 0). Use
  `Appear` from `src/ui/motion.tsx` or explicit shared values (see
  `src/ui/Sheet.tsx`). Reproduced roughly 1 in 6 opens before the fix, 0 in 50 after.
- **Never call Reanimated's `withSpring` directly; use `spring()` from
  `src/ui/motion.tsx`.** Reanimated 4 defaults to mass 4, stiffness 900 and
  damping 120, and the app's springs are tuned for Reanimated 3's mass 1,
  stiffness 100, damping 10: raw, the sheet overshot by a third of the screen.
  Lint blocks the import; `src/ui/Sheet.test.tsx` measures the overshoot.
- **iOS simulator links (Maestro, `simctl openurl`) are unreliable.** The
  first one stops at an "Open in …?" prompt, and after "Open" the simulator
  sometimes never hands it to the app (its log shows nothing sent), so the
  screenshot flow sends it again. Another once took 50 s to arrive. Maestro
  counts a `notVisible` timeout from its last tap or link, not from the check.
- **Play's Financial features declaration must stay "none".** Ticking
  *Rewards, points, frequent flier miles* got the first closed-test review
  rejected (2026-10-19, "Play Console Requirements": financial features need an
  organization account). Changed to none and resent the same day.
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
bun run render-store                    # store screenshots: raw/ → screenshots/, ios-raw/ → app-store/
bun run ios-release                     # build, upload and list the iPhone app (docs/app-store.md)
bun run setup-cafe check|new-key|retire <id>|print|demo
scripts/build-play-bundle.sh            # signed .aab for Play → dist/
```

iOS compile check without a Mac: GitHub → xnmp/cafe-loyalty →
Actions → **iOS simulator build** → Run workflow (`gh workflow run
ios-simulator.yml`). It builds unsigned for the simulator, launches the app
and uploads a screenshot. The simulator has no NFC. With
`-f screenshots=true` it also drives the app with Maestro
(`e2e/app-store-screenshots/`, stamps signed by a key made in the run) and
uploads the raw App Store screenshots.

HCE unit tests (from `android/` after `bunx expo prebuild --platform android`):
`./gradlew :cafe-hce:testDebugUnitTest`.

A sideloadable test build for the two-phone NFC check is at
`dist/test.apk` (gitignored). It's signed with the debug key.
RELEASE.md §7 explains how to rebuild it and what uninstalling it wipes. The
local Gradle build takes about 11 minutes and a lot of RAM. Use `--no-daemon`
so nothing stays resident afterwards.
