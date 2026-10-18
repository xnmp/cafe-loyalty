# Getting the app onto the iPhone App Store, in plain English

Everything that can be prepared ahead of time is done: the iPhone settings, NFC,
the privacy details Apple asks for, the App Store text, the screenshots, a help
page, and one command that builds and uploads the app. What's left needs your
Apple account, so only you can do it.

All up: about an hour of your time, spread over a few days of waiting for Apple.

| Step | What happens | Roughly how long |
| --- | --- | --- |
| 1 | Make a free Expo account (Expo builds the app for you, so you don't need a Mac) | 2 minutes, do it any time |
| 2 | Get the Apple Developer account | 10 minutes, then Apple takes up to 2 days |
| 3 | Run one command, which builds the app and uploads it to Apple | 5 minutes of answering questions, then 20–40 minutes of waiting |
| 4 | Try it on your iPhone, and record a 30-second video at the café | 15 minutes |
| 5 | Click through App Store Connect and press Submit | 20 minutes |
| 6 | Apple reviews it | usually 1–2 days |

You can ask Claude to help with any step. Just say which one you're on.

---

## Step 1: make a free Expo account (any time)

Go to <https://expo.dev/signup> and sign up. It's free. Remember the username and
password: the command in step 3 asks for them.

## Step 2: get the Apple Developer account

1. Go to <https://developer.apple.com/programs/enroll/> and press **Start your
   enrollment**.
2. Sign in with your Apple ID (the one on your iPhone is fine) and choose
   **Individual**. It costs US$99 a year, about A$150.
3. Wait for Apple's email saying you're in. It can take up to 2 days.

The App Store will show your name as the seller.

## Step 3: run the command

Open a terminal (not this chat; the command needs to ask you questions) and
type:

```sh
cd /home/chong/Repos/cafe-loyalty && bun run ios-release
```

It will ask you, in this order:

1. **Your Expo username and password** (from step 1).
2. **Your Apple ID and password**, then **the 6-digit code** that pops up on your
   iPhone.
3. Whether to **make a distribution certificate**, **a provisioning profile**
   and **an App Store Connect API key**. Answer **yes** to each. These are the
   digital signatures Apple needs; Expo looks after them from now on.
4. If it asks which **team** to use, pick the one with your name.

Then it builds the app on Expo's computers. Leave the terminal open. After
20–40 minutes it uploads the app to Apple and fills in the App Store text, and
says **Done**.

- **If it stops with an error:** copy the last 20 lines or so and paste them to
  Claude.
- **When it's done:** tell Claude "commit the Expo project ID". The command saved
  a new line into `cafe.config.json` that needs keeping.

## Step 4: try it on your iPhone, and record a short video

Apple's reviewers don't have the café's counter phone, so they need to see a
video of it working.

1. Go to <https://appstoreconnect.apple.com>, click **Apps**, then **Eastern
   Concourse Cafe**, then **TestFlight** at the top.
2. On the left, next to **Internal Testing**, click **+**. Call the group "Me",
   tick **Enable automatic distribution**, and add yourself as a tester.
3. On your iPhone, install **TestFlight** from the App Store. Open the
   invitation email Apple sends you and press **View in TestFlight**, then
   **Install**.
4. At the café, with the counter phone set up:
   1. Swipe down from the top-right corner of your iPhone and press the
      **Screen Recording** button (a circle inside a circle). If it isn't
      there, add it in Settings → Control Centre.
   2. Open the app and press **Tap to collect**.
   3. Hold the top of your iPhone to the back of the counter phone until it
      says the stamp was added.
   4. Stop the recording (the red bar at the top). It's saved in Photos.
5. Send the video to your laptop, for example by emailing it to yourself.

## Step 5: click through App Store Connect

Go to <https://appstoreconnect.apple.com> → **Apps** → **Eastern Concourse
Cafe**. The command already filled in the description, keywords, help page,
privacy policy link, category and age rating. These are the bits it can't do:

**On the version page** (the left menu, under **iOS App**, shows something like
**1.0.1 Prepare for Submission**):

1. **Screenshots:** under **iPhone 6.9" Display**, drag in all five files from
   `/home/chong/Repos/cafe-loyalty/docs/store/app-store/`, in order (01, 02, 03,
   04, 07).
2. **Build:** press **Add Build** and pick the one that's there. If none shows
   up, Apple is still processing it: wait half an hour and reload the page.
3. **Copyright:** type `2026` and your full name, for example `2026 Jane Citizen`.
4. **App Review Information:**
   - Untick **Sign-in required**.
   - Fill in your name, phone number (starting +61) and email. Only Apple sees
     these.
   - **Notes:** paste the text in the box at the bottom of this page.
   - **Attachment:** add the video from step 4.
5. Press **Save** at the top right.

**App Privacy** (left menu):

1. Press **Get Started**, then choose **No, we do not collect data from this
   app**, and save.
2. Press **Publish**.

The app has no accounts or servers, and *Report a problem* only opens the
customer's own email app, so "no data collected" is the honest answer.

**Pricing and Availability** (left menu):

1. **Price:** choose **USD 0 (Free)**.
2. **Availability:** press **Edit**, untick everything, tick **Australia**, and
   save. This matches Google Play. Widen it later if you like.

**App Information** (left menu):

- **Age Rating:** if anything is unanswered, answer **None** or **No** to every
  question. It should come out as 4+.
- **Content Rights:** choose **No, it does not contain, show, or access
  third-party content**.
- If it asks about the **EU Digital Services Act**, you can leave it: that only
  matters for selling in Europe.

**Submit:** go back to the version page, press **Add for Review**, then
**Submit for Review**.

## Step 6: Apple reviews it

Apple says most reviews take a day or two, and it emails you either way.

- **If they approve it:** it goes onto the App Store straight away. Anyone in
  Australia can search **Eastern Concourse Cafe** and install it.
- **If they reject it:** the email and the App Store Connect page say why. Paste
  that to Claude and it will fix things or draft a reply.

Unlike Google, Apple doesn't need 12 testers for 14 days first.

---

## Updating the iPhone app later

Tell Claude what needs changing. It makes the new version; then you run
`bun run ios-release` again (it only asks for passwords if they've expired),
and press **Add for Review** on the new version in App Store Connect.

## Notes for Apple's reviewers (paste into App Review Information → Notes)

```text
Eastern Concourse is the loyalty stamp card for one café, Eastern Concourse Cafe and Bakery in Australia. There are no accounts, logins or network requests: the card lives on the phone.

How it works: a customer presses "Tap to collect" and holds their iPhone to the café's counter phone, an Android phone that acts as an NFC card (the iPhone reads it with Core NFC, ISO 7816). Or they scan a QR code on the counter phone's screen. After 9 stamps the next drink is free, and the counter phone checks the reward.

Stamping needs the café's counter phone, so we've attached a short video of an iPhone collecting a stamp at the counter.

To see the counter side on a single device: open https://xnmp.github.io/cafe-loyalty/review/ on a computer. In the app, tap the ⓘ button, press and hold the version number for 2 seconds, tap "Scan staff code" and scan the code on that page (or tap "Paste code instead"). This demo counter works like the real one, but customers' cards reject its stamps by design.

"Report a problem" (under ⓘ) opens the device's own email app; the app itself sends nothing.
```
