# Architecture

A digital punch card for one café. Customers collect stamps by tapping their
phone on the café's **counter device**; every N stamps earns a free drink.

No backend, no accounts. The card lives on the customer's phone, like a paper
card in a wallet. That is deliberate: nothing to host, nothing to pay for,
nothing to break, no personal data collected.

## Trust model

The counter phone is the authority. The customer's phone keeps its own card,
but nothing it says about that card is trusted when a reward is handed out.

```
 counter phone (staff mode)                   customer phone
 ──────────────────────────                   ──────────────
 Ed25519 secret key                           public key(s) from cafe.config.json

 stamp:   signs a one-time token  ──token──▶  verifies signature, freshness, nonce;
                                              keeps the token as a proof of the stamp
                                  ◀──ack────  (courtesy) "stamped, 4 of 9"

 redeem:  asks for a reward       ──token──▶  picks unspent proofs worth one reward
          verifies every proof    ◀─request─  (NFC write, or a code the counter scans)
          against its registry of
          spent stamps, records the spend
```

- A **token** is 84 bytes: claims (kind, key id, count, issued-at, 96-bit
  nonce) + Ed25519 signature, domain-separated with the café id. See
  `src/domain/token.ts`.
- **Stamps.** The customer app rejects tokens that are forged, for another café,
  older than 15 min, from the future (>15 min skew), or already applied. It
  stores each stamp with its signed token: the proof.
- **Rewards.** A redemption request carries the proofs for one reward
  (`<scheme>://r/<request id>/<proofs>`). The counter phone checks each
  signature and its **redemption registry** (SQLite, kept forever) of stamps
  already spent, then records the spend atomically. Only a verified request
  shows "verified" to the barista; an ack from the customer app never can. See
  `src/domain/redemption.ts`.
- The request id is derived from the stamps it spends (and where in each stamp
  they start), so the same reward presented twice (an old code shown again, or
  a tap whose reply was cut off) is refused as "already used at …" instead of
  spending twice. The customer app marks a reward used once its NFC write goes
  through, or as soon as it shows the code. Every past redemption can be shown
  again as a code from History, so a reward the counter couldn't confirm (say,
  its database failed) isn't lost, and one it did confirm is refused.
- The barista's "verified" screen stays up until closed. A request refused as
  already used within the last 10 minutes says so, so staff can tell a missed
  confirmation (or a counter restart mid-check) from an old code.
- A tap hands over the card's stamps only while the customer has their reward
  open (the free-drink sheet), nothing is on screen over it, and no code or
  other tap is using it. The card store checks and claims that in one step as
  it replies (`src/state/rewardUse.ts`). With just the card on screen, a redemption
  request gets no reply, so a counter request recorded and replayed from another
  device can't take a reward off someone's phone. Stamps don't need this: they
  carry no value until redeemed.
- What this stops: forged stamps; copying a stamp token to other phones (only
  the first redemption that uses it succeeds); fake "redeemed" replies from an
  NFC tool; re-showing an old success screen or code; a rooted phone inflating
  its own card (the counter only accepts genuine, unspent proofs); replaying a
  counter request to a customer's phone. However the customer side is tampered
  with, free drinks given never exceed the stamps this counter phone issued
  divided by the stamps per reward.
- Accepted risks, each with its limit:
  - A copied stamp *displays* on several phones until one of them redeems it.
    A card holding stamps spent elsewhere (a copied card, an old backup)
    overstates its balance by those stamps. If it redeems by tap, the counter
    refuses, but the customer's phone still counts that reward as used, so its
    genuine stamps stop showing. Staff can stamp them back by hand.
  - A redemption code carries the stamps it spends. When its last stamp came
    from a multi-drink stamp, the rest of that stamp travels in the code too.
    Someone who photographs the code and builds their own request could spend
    that remainder (fewer stamps than one tap can give) before its owner does.
    With a reward of their own, they could also redeem it under the code's
    request id first, so the photographed code is refused as already used. That
    gains them nothing, and the owner's stamps stay unspent on the counter but
    marked used on their phone.
  - If an NFC write reaches the counter but the customer's phone sees it fail,
    the reward stays on the card until the next attempt, which the counter
    refuses as already used. The same goes if the phone can't save after the
    counter took it; the phone then says to check the counter screen.
  - A malformed or empty request written by an NFC tool ends the counter's
    current offer with a refusal. Staff start it again.
  - With two counter phones, each keeps its own registry, so the same stamps
    could be redeemed once on each.
  - Restoring the counter phone from a backup forgets spends made after that
    backup. Resetting it without one forgets them all.
  - A lost customer phone loses its card unless restored from an OS backup.
  - Anyone with the staff code, or with the counter phone unlocked in front of
    them, can give stamps: the PIN guards settings (changing it, leaving counter
    mode), not stamping. Its lockout resets when the app restarts. Retiring a
    key takes an app update and also voids the unspent stamps it signed.
- The counter phone's secret is provisioned by scanning a staff QR code made
  by `bun run setup-cafe`; it is stored in SecureStore (excluded from backups)
  and never leaves the device.

## Transport

- **NFC (primary)**: the counter phone (Android only — iOS can't emulate tags)
  runs a HostApduService that emulates an NFC Forum Type 4 Tag serving one NDEF
  URI record. The customer app reads it with react-native-nfc-manager on iOS and
  Android and writes its reply (ack, or redemption request) back over the same
  session. Replies are staged, so an interrupted write never damages the token
  being served. The emulated file holds up to 4 KB.
- **QR (fallback)**: for stamps, the counter screen shows the token as a QR code
  the customer scans in-app (or with the OS camera, via the deep link). For
  rewards, the customer shows a code and the counter phone scans it.
- **Deep link**: a `<scheme>://t/...` URL that opens the app (Android background
  NFC dispatch, OS camera) is applied without navigating
  (`src/app/+native-intent.tsx`).

Stamp intake converges on `applyToken` in `src/domain/intake.ts`; redemption
on `planRedemption` (customer) and `verifyRedemption` (counter).

## Layout

```
cafe.config.json        single source of truth: branding, rules, contact, trusted public keys
app.config.ts           Expo config derived from cafe.config.json
src/domain/             pure TypeScript, no React / React Native / Expo imports. All business rules.
src/infra/              adapters to the platform: storage, NFC reader, HCE module, camera, random bytes
src/state/              React context + hooks that wire domain to infra (one store per concern)
src/ui/                 design system: theme tokens, typography, primitives, illustrations
src/features/           screen-level components grouped by feature (card, history, counter, setup)
src/app/                expo-router routes only; thin files that render features
modules/hce/            local Expo module: Android HCE Type 4 tag emulator (Kotlin)
scripts/                node scripts (key generation, provisioning QR)
```

## Conventions

- Domain code is pure and immutable: functions take values, return new values.
  Time (`now`), randomness (nonces) and keys are parameters, never ambient.
- Errors in the domain are values (`{ ok: false, error }`), not exceptions.
  Exceptions are for programmer errors and infra failures only.
- Infra modules expose small async interfaces; features depend on the
  interface, not on the native library.
- Bytes are `Uint8Array`. Encoding helpers live in `src/domain/bytes.ts` (no
  Node `Buffer`; Hermes doesn't have it).
- Persistence: customer ledger in AsyncStorage (`card.v2`), counter activity
  log in AsyncStorage (`counter.v2`, 35 days), redemption registry in SQLite
  (`redemptions.db`, forever), staff secret + PIN hash in SecureStore. Every
  persisted shape carries a version. Android backup includes everything except
  SecureStore (`plugins/withBackupRules.js`). Damaged stored data is kept aside
  rather than overwritten.
- Tests: Jest (`jest-expo` preset), colocated as `*.test.ts`. Test behaviour
  through public functions. Kotlin emulator has JVM unit tests under
  `modules/hce/android/src/test`.
