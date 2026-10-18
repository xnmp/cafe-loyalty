# Releasing

Everything you need to get the app into the café and onto customers' phones,
in order. Commands run from the repo root. `cafe-secrets/` is private: it is
gitignored, never commit it, and keep an offline backup of it.

## 0. Before you start

- **The café's OK.** The app uses the café's name and look. Get the owner's
  permission (both stores can ask), and decide who answers customer emails.
- **Accounts.**
  - Expo (free): <https://expo.dev/signup>. Builds run on Expo's servers, so no
    Mac or Android Studio is needed.
  - Google Play Console: you already have one (Ballast).
  - Apple Developer Program ($99/year) for iOS: <https://developer.apple.com/programs/>.
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

Both stores need a privacy policy URL. Same pattern as Ballast: make a public
GitHub repo (for example `xnmp/cornercafe-privacy`), add
`docs/privacy/index.html` as its `index.html`, and turn on Pages (Settings →
Pages → Deploy from branch → `main`, root). The URL is
`https://xnmp.github.io/cornercafe-privacy/`. Edit the café name and contact
email in the file first if you changed them.

## 3. Link the project to Expo

```sh
bunx eas-cli login
bunx eas-cli init
```

`eas init` can't edit `app.config.ts` itself. It prints a project id. Put that
id in `cafe.config.json` as `"easProjectId"` and commit.

## 4. Android (Google Play)

1. **Build**: `bunx eas-cli build -p android --profile production`. When asked,
   let EAS generate the upload keystore (it stores it for you; Play App Signing
   holds the real key). Download the `.aab` from the link it prints.
2. **Create the app** in Play Console → *Create app*: name as in the config,
   default language, *App*, *Free*.
3. **App content** (Monitor and improve → Policy and programs → App content):
   - Privacy policy: the URL from step 2.
   - Data safety: **no data collected, no data shared**. Nothing leaves the
     phone; the app makes no network requests.
   - Ads: none. Content rating questionnaire: a utility with no objectionable
     content. Target audience: 13 and over (choosing under-13s pulls in the
     Families programme rules). Government, financial, health: none.
4. **Store listing**: copy from `docs/store-listing.md`. Graphics are in
   `docs/store/`: `icon-512.png`, `feature-graphic.png` and `screenshots/`
   (regenerate with `bun run render-store` after changing the config or the
   captures in `docs/store/raw/`).
5. **Testing first.** New personal developer accounts (created after 13 Nov 2023)
   must run a **closed test with at least 12 testers for 14 days** before
   Production unlocks. Café regulars and staff make good testers: Testing →
   Closed testing → create a release with the `.aab`, add testers by email or a
   Google Group, and share the opt-in link. If your account predates that rule,
   go straight to Production. (Check Play Console's own guidance. These rules
   change.)
6. **Production**: promote the tested release, then send for review.

Later updates, without the Console:
- In Play Console → Setup → API access, give your existing service account
  (the Ballast one) *Release manager* access to this app too. Save its JSON key
  as `cafe-secrets/play-service-account.json`.
- Bump `version` in `app.config.ts`, then
  `bunx eas-cli build -p android --profile production --auto-submit`. EAS
  increments the build number itself. Submissions go to the *internal* track
  (see `eas.json`). Promote them in the Console.

## 5. iOS (App Store)

1. `bunx eas-cli build -p ios --profile production`. Sign in with your Apple
   account when asked. EAS registers the bundle id, enables the **NFC Tag
   Reading** capability (from the app's entitlements) and handles certificates.
2. `bunx eas-cli submit -p ios --latest` uploads it to App Store Connect and
   TestFlight. Install it on your iPhone through TestFlight.
3. App Store Connect → your app:
   - App Privacy: **Data Not Collected**. Privacy policy URL from step 2.
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
4. Submit for review.

## 6. Set up the counter phone

1. Install the app from the store (or a preview build:
   `bunx eas-cli build -p android --profile preview` gives an installable APK).
2. Open the app → **About** (ⓘ) → press and hold the version number for
   1.5 seconds → **Scan staff code** → scan `cafe-secrets/staff-key-<id>.html`
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
both: `adb install dist/corner-cafe-test.apk`, or copy the file to each phone and
open it. Make the build with `bunx expo prebuild --platform android`, then
`cd android && ./gradlew assembleRelease`, then copy
`android/app/build/outputs/apk/release/app-release.apk` to
`dist/corner-cafe-test.apk`. That build is signed with the debug key, so a phone
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
