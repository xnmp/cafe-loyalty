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
- The request id is derived from the stamps it spends, so a retry after a
  dropped NFC session is recognised instead of spending twice, and an old code
  shown again is reported as "already used at …".
- What this stops: forged stamps; copying a stamp token to other phones (only
  the first redemption that uses it succeeds); fake "redeemed" replies from an
  NFC tool; re-showing an old success screen or code; a rooted phone inflating
  its own card (the counter only accepts genuine, unspent proofs).
- Accepted risks: a copied stamp *displays* on several phones until one of them
  redeems it; with two counter phones, each keeps its own registry, so the same
  stamps could be redeemed once on each; a lost customer phone loses its card
  unless restored from an OS backup; resetting the counter phone without its
  backup forgets which stamps were spent.
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
