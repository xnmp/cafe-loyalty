# Next steps to get Eastern Concourse onto Google Play

Where it stands (19 Oct 2026):

- **Internal testing is live with 1.0.1.** Only people on the internal email list
  can install it (just you so far).
- **The closed test has been sent to Google for review**, together with the store
  listing and app content. Google says reviews usually finish within 7 days, and
  it emails you when it's done. The closed test goes live by itself once approved
  (managed publishing is off).
- **iPhone isn't started.** See the end.

Google won't let the app go public (production) until a closed test has had **at
least 12 testers opted in for the last 14 days in a row**. The steps below get
you there.

## 1. This week, while Google reviews

- [ ] **Line up testers: aim for 15–20, not 12.** If someone leaves the test and
      the count drops below 12, the 14 days may have to start again. Testers
      need an **Android** phone signed in to a Google account. iPhone users
      can't be Play testers.
      - You don't need to collect anyone's email address. Each person joins the
        Google Group themselves, with the Google account that's on their phone.
      - Ask the café owners to recruit regulars and staff, and recruit friends
        and family yourself.
- [ ] **Add the café owners to the support group**, so they get problem reports:
      <https://groups.google.com/g/eastern-concourse-cafe-support> → People →
      Members → Add members.
- [ ] **Optional: let the owners install it now**, before the review finishes.
      Play Console → Test and release → Testing → Internal testing → Testers →
      *Eastern Concourse internal testers* → add their Gmail addresses → Save.
      Then send them the **Join on the web** link from that page.
      - Internal testers don't count towards the 12. The owners should join the
        closed test too, once it's live (step 2).
- [ ] **Set up the counter phone**, the café's Android phone with NFC.
      - Install the app, either from internal testing (put that phone's Google
        account on the internal list) or from the closed test once it's live.
      - Then follow `docs/RELEASE.md` §6: About (ⓘ) → hold the version number for
        2 seconds → Scan staff code → scan
        `/home/chong/Repos/cafe-loyalty/cafe-secrets/staff-key-3.html` from your
        laptop screen → choose a PIN.
- [ ] **Test with two real phones** using the checklist in `docs/RELEASE.md` §7.
      NFC can't be tested on an emulator, so this hasn't been done yet.
- [ ] **Uninstall the sideloaded test app** (`dist/test.apk`) from any phone you
      put it on before installing from Play. Play won't install over it, and
      uninstalling wipes that phone's card.
- [ ] **Back up `/home/chong/Repos/cafe-loyalty/cafe-secrets/` offline**, for
      example to a USB stick or a password manager. Every future Play upload must
      be signed with the key in it, and the counter phone's staff code comes
      from it.

## 2. When Google approves the closed test

You'll get an email, and Publishing overview stops saying "Changes in review".

- [ ] **Send each tester these two links, in order.** A sign with QR codes at
      the counter works well.
      1. **Join the group:** <https://groups.google.com/g/eastern-concourse-cafe-testers>
         (with the Google account on their phone)
      2. **Opt in, then install:** <https://play.google.com/apps/testing/md.chong.cafecard>
         → *Become a tester* → *Download it on Google Play*.
      - Joining the group alone isn't enough. Only people who open link 2 and
        opt in count.
- [ ] **Ask testers to actually use it:** collect stamps at the café, and send
      feedback through *Report a problem* in About. Google's production
      application asks how testers used the app and what you learned. Real
      use and a few reports make that easy to answer.
- [ ] **Check progress** in the Play Console Dashboard, which shows how far
      you are towards production access. Once 12 or more have opted in, leave
      it for **14 days**. Don't pause or end the
      closed test.

## 3. After 14 days: apply for production

- [ ] Play Console → **Dashboard** → **Apply for production**. It's a short
      questionnaire about the closed test: how you found testers, how they used
      the app, and what feedback you got and changed. Google says to allow up
      to 7 days for a decision.
- [ ] Once approved: **Test and release → Production → Create new release** →
      *Add from library* (the latest bundle) → Countries: Australia → Save →
      **Publishing overview → Send for review**.
- [ ] After that review, anyone in Australia can find **Eastern Concourse
      Cafe** on Google Play. Tell customers. The closed-test links can stay up.

## If something needs fixing along the way

Bump `version` in `app.config.ts`, run `scripts/build-play-bundle.sh`, upload
the new `.aab` to internal testing, then add it to the closed test. The 14 days
count testers staying opted in, so an update shouldn't reset them. `docs/RELEASE.md` §4 has the details, including how
to stop dragging bundles in by hand (a Play service account).

## iPhone (any time, separate from all of the above)

Needs an Apple Developer account (US$99 a year). Then:
`bunx eas-cli login` → `bunx eas-cli init` → `bunx eas-cli build -p ios --profile production`
→ `bunx eas-cli submit -p ios --latest` → fill in App Store Connect and submit.
`docs/RELEASE.md` §5 has the App Store fields and what to tell Apple's
reviewers. Until then, iPhone customers can't install the app. The counter
phone itself must be Android either way.
