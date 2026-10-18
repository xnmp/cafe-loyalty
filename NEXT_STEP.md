# What happens next, in plain English

## The big picture

Google doesn't let a brand-new app go public on Google Play straight away. First
you have to show that real people have used it. There are five steps, and most
of the time you're just waiting:

| Step | What happens | Roughly how long |
| --- | --- | --- |
| 1 | Google checks the test version of the app | up to 7 days, **you are here** |
| 2 | You get 12 or more people to install the test version | a day or two |
| 3 | Those people keep it on their phones | 14 days |
| 4 | You ask Google to let you go public, and Google checks again | up to 7 days |
| 5 | You press publish, and anyone can find it on Google Play | a day or so |

All up, that's about 4 to 5 weeks. You can ask Claude to do any of the
Play Console parts for you. Just say which step you're on.

---

## Step 1: wait for Google's email (up to 7 days)

**What's happening:** Google is checking the app. You don't need to press
anything.

(Google said no once, on 19 October, because of one wrong answer in a form.
That's fixed and was sent back the same day, so the wait started again.)

**How you'll know it's done:** you get an email from Google Play to the Gmail
you use for the Play Console, saying the changes were approved. If you look at
<https://play.google.com/console>, open the app and click **Publishing
overview**, it will no longer say "Changes in review".

**If Google says no:** the email says why. Forward it to Claude (paste it in)
and it will fix things.

**Things to do while you wait (optional, but they save time later):**

1. **Back up the secret folder.** Copy the folder
   `/home/chong/Repos/cafe-loyalty/cafe-secrets/` to a USB stick or into your
   password manager.
   - Why: it holds the key that proves new versions of the app come from you,
     and the code that turns the café's phone into the stamp-giving phone. If
     your laptop dies without a backup, you can never update the app again.
2. **Tell the café owners the plan.** They need to find about **20 people
   with Android phones** who'd install the test version: staff, regulars,
   friends, family.
   - Why 20 when Google asks for 12: some people drop out.
   - iPhones can't join, and nobody needs to hand over an email address.
3. **Make sure the owners get problem reports.** Ask for their email
   addresses, then:
   1. Go to <https://groups.google.com/g/eastern-concourse-cafe-support>.
   2. Click **People** on the left, then **Members**.
   3. Click **Invite members** (it may say **Add members**), type their emails,
      and send. If they get an invitation email, they click **Accept**.

   Now when a customer presses *Report a problem* in the app, the owners get
   the email too.

---

## Step 2: get 12 or more people to install it (once Google says yes)

**First, tell Claude "Google said yes".** It changes one privacy answer in the
Play Console (that the counter phone keeps a nameless list of used stamps).
Google checks that quickly; testing carries on meanwhile.

**1. Put the sign up.** Open <https://xnmp.github.io/cafe-loyalty/testers/> and
print it. It has two QR codes and tells people what to do. Stick it on the
counter, or send the two links on the sign to people by text message.

**2. What each person does on their Android phone** (the sign says the same):

1. Scan the **first** QR code, or open
   <https://groups.google.com/g/eastern-concourse-cafe-testers>.
2. Check it's signed in with the Google account their Play Store uses,
   usually their Gmail. Press **Join group**.
3. Scan the **second** QR code, or open
   <https://play.google.com/apps/testing/md.chong.cafecard>.
4. Press **Become a tester**.
5. Press **Download it on Google Play**, then **Install**.

That's all. They don't need to tell you anything. Google counts them
automatically.

**3. Do it yourself and get the owners to do it,** on your own Android phones.
You count towards the 12 too.

- If you installed the test file `test.apk` on a phone earlier, uninstall that
  app first. Play won't install over it.

**4. Set up the café's phone as the stamp-giving "counter phone".** This must
be an Android phone with NFC.

1. Install the app on it the same way: the two links above, signed in with the
   café's Google account.
2. On your laptop, open
   `/home/chong/Repos/cafe-loyalty/cafe-secrets/staff-key-3.html` in a browser.
   It shows a QR code. Keep this file private.
3. On the café phone, open the app and tap the round **ⓘ** button at the top.
4. Press and hold the version number at the bottom for 2 seconds.
5. Tap **Scan staff code**, point the phone at the QR code on your laptop, and
   choose a 4-digit staff PIN.
6. Leave the phone on charge with NFC turned on. Customers will tap the back
   of their phone against the back of this one.

**5. Try it once with two real phones** before telling customers.

1. On the counter phone, give 1 stamp.
2. Hold a customer phone (with the app open) back to back with it.
3. Both screens should say the stamp was added.

The full checklist is in `docs/RELEASE.md` section 7. If anything doesn't work,
tell Claude what happened.

---

## Step 3: wait 14 days

**What's happening:** Google needs at least 12 people to keep the test version
for 14 days in a row. The clock starts once 12 have joined.

**What you do:**

- Nothing in the Play Console.
- Ask testers to actually use it: collect stamps when they buy coffee, and
  press *Report a problem* (in the ⓘ screen) if something's wrong or they
  have an idea.
- Ask them not to uninstall it or leave the test. If the number drops below
  12, the 14 days may start again.

**How to check the count:** the Play Console **Dashboard** shows how close you
are to being allowed to go public. Or ask Claude to look.

---

## Step 4: ask Google to go public (after the 14 days)

1. Go to <https://play.google.com/console>, open the app, and click **Dashboard**.
2. Find **Apply for production** and answer the questions. They ask who
   tested, how, and what you learned. Honest, simple answers are fine, for
   example: "Café customers and staff, recruited with a sign at the counter.
   They collected stamps for two weeks and reported problems through the
   app."
3. Wait for Google's email, up to 7 days.

Or tell Claude "apply for production" and it will go through it with you.

---

## Step 5: publish it for everyone

Tell Claude "publish to production", and it will do this in the Play Console
for you. If you'd rather do it yourself:

1. Click **Test and release**, then **Production**, then **Create new release**.
2. Click **Add from library**, tick the newest version, and click **Add to release**.
3. Click **Next**, then **Save**.
4. Click **Publishing overview**, then the **Submit … for review** button, then
   **Send changes for review**.

After one more short check, anyone in Australia can search **Eastern
Concourse Cafe** on Google Play and install it.

---

## Other things you might wonder about

- **iPhones:** everything is ready except the Apple Developer account
  (US$99 a year). The plain-English guide is
  `/home/chong/Repos/cafe-loyalty/docs/app-store.md`. In short: make a free
  Expo account, get the Apple account, run `bun run ios-release` in a
  terminal, then click through App Store Connect. Apple doesn't need the 12
  testers, so the iPhone version can go public before the Android one. The
  café's counter phone has to be Android either way.
- **If the app needs a fix later:** tell Claude what's wrong. It makes the new
  version, and your only job is dragging one file into the Play Console page
  it opens.
- **Words you'll see in the Play Console:**
  - **Internal testing:** a private copy only you can install. It's already
    working.
  - **Closed testing:** the test version that people join with the two
    links. This is the one the 12 testers need.
  - **Production:** the public version anyone can find.
  - **Opt in:** pressing *Become a tester*.
