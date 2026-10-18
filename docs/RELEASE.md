# Releasing

Everything you need to get the app into the café and onto customers' phones,
in order. Commands run from the repo root. `cafe-secrets/` is private: it is
gitignored, never commit it, and keep an offline backup of it.

## 0. Before you start

- **The café's OK.** The app uses the café's name and look. Get the owner's
  permission (both stores can ask), and decide who answers customer emails.
- **Accounts.**
  - Google Play Console: you already have one (Ballast).
  - For iOS only: Apple Developer Program ($99/year,
    <https://developer.apple.com/programs/>) and Expo (free,
    <https://expo.dev/signup>). The iOS build runs on Expo's servers, so no Mac is
    needed. Android builds locally (§3).
- **A counter phone**: an Android phone with NFC (almost any recent one). An
  iPhone can't be the tap point (iOS can't emulate an NFC tag). Without one,
  the app still works through QR codes.

## 1. Make it the café's

1. Edit `cafe.config.json`: `name`, `tagline`, `contact` (address, hours, phone,
   website, Instagram; leave a field empty to hide it), `rules`
   (`stampsPerReward`, `rewardName`) and the `theme` colours. `cafeId` and
   `bundleId` can't change after the first store upload. `cafeId` is part of
   every signature.
2. `bun run render-brand` regenerates the icon and splash from the colours.
3. `bun run setup-cafe check` should print no problems.

The signing key is already set up: `cafe-secrets/staff-key-<id>.html` is the
staff QR code for the counter phone. Print it or keep it on your laptop. It
lets any phone hand out stamps, so don't leave it lying around at the café.

## 2. Publish the privacy policy

Both stores need a privacy policy URL. This repo is public with GitHub Pages
serving `docs/` from `master`, so the policy in `docs/privacy/index.html` is at
<https://xnmp.github.io/cafe-loyalty/privacy/>. Edit the café name and contact
email in the file if you change them, and push.

## 3. Build for Google Play

```sh
scripts/build-play-bundle.sh      # → dist/play-<versionCode>.aab, about 10 minutes
```

It builds on this machine (JDK 17+ and the Android SDK; it looks in
`~/.local/jdk` and `~/Android/Sdk` unless `JAVA_HOME`/`ANDROID_HOME` say
otherwise) and signs the bundle with the **upload key**,
`cafe-secrets/upload-keystore.jks` (password in `upload-keystore.properties`).
Google holds the key that signs what customers install (Play App Signing). The
upload key only proves an upload came from you. If it's ever lost, Play Console →
Test and release → App integrity → *Request upload key reset*. Don't make a new
one with `--new-key`. That flag is only for an app that has never been uploaded.

The `versionCode` is minutes since 1970, so every build is higher than the last
one, as Play requires. The version people see is `version` in `app.config.ts`:
bump it when you ship a change. (If you ever build Android with EAS instead,
first set its remote version above the last upload:
`bunx eas-cli build:version:set -p android`.)

## 4. Google Play

The Console app is **Eastern Concourse Cafe** (`md.chong.cafecard`). Done so far:

- **App content**: every declaration is filed. Privacy policy (§2); data safety
  says no data is collected or shared (the app makes no network requests); no ads
  or advertising ID; content rating (IARC); 13 and over; financial features say
  *rewards/loyalty* only.
- **App access**: reviewers have no counter phone, so the instructions point them
  at the **demo staff code**, <https://xnmp.github.io/cafe-loyalty/review/>
  (regenerate with `bun run setup-cafe demo`). It turns any phone into a counter
  in demo mode. Customers' cards reject its stamps and it can't redeem rewards, so
  it's safe to publish. The real staff code never goes to Google.
- **Store listing**: text from `docs/store-listing.md`; graphics from
  `docs/store/` (`bun run render-store` regenerates them from the config and
  the captures in `docs/store/raw/`). Countries: Australia.
- **Testers**: internal testing uses the email list *Eastern Concourse internal
  testers*. Closed testing uses the Google Group
  `eastern-concourse-cafe-testers@googlegroups.com`: anyone can join, members
  can't see each other, and nobody can post.

From here to the public store:

1. **Internal testing** (no review; live within minutes): Test and release →
   Testing → Internal testing → create a release with the `.aab` → roll out.
   Testers on the email list open the opt-in link from the *Testers* tab, then
   install from Play. Until the app passes its first review, Play shows them a
   temporary name.
2. **Closed testing**: Testing → Closed testing → the track → Countries:
   Australia; Testers: the Google Group; create a release (*Add from library* reuses
   the internal bundle) → Publishing overview → **Send for review** (a few days for
   a new app). Then give people both links, in order:
   join <https://groups.google.com/g/eastern-concourse-cafe-testers>, then opt in at
   <https://play.google.com/apps/testing/md.chong.cafecard> and install from Play.
   Café regulars and staff make good testers: print the two links as QR codes at
   the counter.
3. **Production**: this is a personal developer account, so Play requires **at
   least 12 testers opted in for the last 14 days** of a closed test first. Then
   Dashboard → *Apply for production* (a short questionnaire about the test). Once
   approved: Production → create a release (promote the tested one) → Countries:
   Australia → send for review. (Check Play Console's own guidance. These rules
   change.)

**Shipping an update**: bump `version` in `app.config.ts`, commit, run
`scripts/build-play-bundle.sh`, then upload the new `.aab` as a release on the
track you want (internal first, then promote). Review usually takes hours to a
day for updates. To upload without the Console, give a service account *Release
manager* access to this app (Play Console → Users and permissions) and save its
JSON key as `cafe-secrets/play-service-account.json`. `eas.json` already points
`eas submit` at it: `bunx eas-cli submit -p android --path dist/play-<n>.aab`.

## 5. iOS (App Store)

1. Link the project to Expo once: `bunx eas-cli login`, then
   `bunx eas-cli init`. It can't edit `app.config.ts` itself. Put the project id it
   prints in `cafe.config.json` as `"easProjectId"` and commit.
2. `bunx eas-cli build -p ios --profile production`. Sign in with your Apple
   account when asked. EAS registers the bundle id, enables the **NFC Tag
   Reading** capability (from the app's entitlements) and handles certificates.
3. `bunx eas-cli submit -p ios --latest` uploads it to App Store Connect and
   TestFlight. Install it on your iPhone through TestFlight.
4. App Store Connect → your app:
   - App Privacy: **Data Not Collected**. Privacy policy URL from §2.
   - Screenshots: take them on your iPhone from the TestFlight build (6.7"/6.9"
     sizes; side button + volume up). Never screenshot a **Show my code**
     screen: that code is a real free drink anyone could scan off the listing.
   - Category: Food & Drink. Copy text from `docs/store-listing.md`.
   - **App Review notes.** Reviewers don't have the counter phone. Say: "Customers
     collect stamps by tapping their iPhone on the café's Android counter phone
     (NFC) or by scanning a code on its screen. Rewards are verified by that
     counter phone. A demo video is linked." Record a 30-second screen recording
     on your iPhone of tapping the counter phone and getting a stamp, upload it
     unlisted (YouTube or a Drive link), and paste the link. Apple can ask for a
     fresh video with later submissions.
5. Submit for review.

## 6. Set up the counter phone

1. Install the app from Play (internal or closed testing is fine).
2. Open the app → **About** (ⓘ) → press and hold the version number for
   2 seconds → **Scan staff code** → scan `cafe-secrets/staff-key-<id>.html`
   from your laptop screen → choose a staff PIN.
3. Leave NFC on (the app tells you if it's off) and keep the phone charging. The
   counter screen keeps itself awake. Stand it so customers can reach its
   back, where the NFC antenna is.
4. Turn on Google backup on that phone (Settings → Google → Backup). The record of
   spent stamps is included, so a replacement phone restored from it can't be
   tricked into accepting old stamps twice.

## 7. Test with real phones before telling customers

The emulator can't do NFC, so this part needs two real phones.

To test the Android phones before anything is on Play, install a local build on
both: `adb install dist/test.apk`, or copy the file to each phone and
open it. Make the build with `bunx expo prebuild --platform android`, then
`cd android && ./gradlew assembleRelease`, then copy
`android/app/build/outputs/apk/release/app-release.apk` to
`dist/test.apk`. That build is signed with the debug key, so a phone
must uninstall it before it can install the Play version. Uninstalling wipes the
card, and on the counter phone it also wipes the spent-stamp record and the
signing key. Set the counter phone up again afterwards (§6). iPhones need
TestFlight (§5).

- [ ] Android customer phone, app open: Give 1 stamp → hold phones back to
      back → both screens confirm ("Stamp added").
- [ ] iPhone: Give 1 stamp → **Tap to collect** → hold the top of the iPhone to
      the back of the counter phone → both confirm.
- [ ] Give 9 stamps in one go (+ button) → the card fills and the reward ticket appears.
- [ ] **Redeem free drink** on the counter → customer taps their free drink
      ticket, then holds the phones together (iPhone: **Tap the counter phone**
      in the ticket) → counter shows **"Free drink verified"**. Only hand over a
      drink on that green screen.
- [ ] Same again, but the customer taps without opening the ticket: their phone
      says "Open your free drink first", the reward stays on the card and the
      counter keeps waiting. Opening the ticket and tapping again then works.
- [ ] Redeem by code: customer taps the reward ticket → **Show my code**; counter
      → Redeem → **Scan their code** → verified. Scanning the same code again
      shows "Already used".
- [ ] Time a redemption made of 9 single stamps. The counter checks every
      stamp's signature, which can take a few seconds on a slower phone ("Checking
      their stamps…"). If it's much slower than that, pick a faster counter phone.
- [ ] With the customer app closed, tap the counter phone (Android): the app opens
      and the stamp lands.

If a tap doesn't register, move the phones slowly. NFC antennas sit in
different places on different models, usually in the middle of the back.

## 8. Running it

- **Stamps**: set the number of drinks → *Give N stamps* → customer taps (or
  *Show QR code instead*).
- **Free drink**: *Redeem free drink* → customer opens their free drink ticket
  and taps, or *Scan their code*.
  Only the green **verified** screen means the reward is real.
- **Settings** (gear, staff PIN): change PIN, or stop using the phone as the counter.
- **Changing rules**: edit `cafe.config.json` and ship an update. Existing stamps
  keep counting.
- **Lost staff code or a new counter phone**: the same `staff-key-<id>.html` works
  on any number of phones. Each counter phone keeps its own record of spent
  stamps, so one counter phone is best.
- **Key compromised** (someone copied the staff code): `bun run setup-cafe new-key`,
  ship an update, re-provision the counter phone with the new code, then
  `bun run setup-cafe retire <old id>` and ship again. Retiring a key also stops
  customers redeeming stamps it signed, so only do it if it was really leaked.

## Local development

```sh
bun install
bunx expo prebuild --platform android --clean   # after native config changes
bun run android                                 # build + install a dev client
bunx expo start --dev-client
bun run test && bun run typecheck && bun run lint
```

`bun scripts/dev-token.ts stamp 3` prints a signed stamp link for testing deep links
on an emulator (`adb shell am start -a android.intent.action.VIEW -d "<link>"`).
