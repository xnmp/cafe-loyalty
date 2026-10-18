# Architecture

A digital punch card for one café. Customers collect stamps by tapping their
phone on the café's **counter device**; every N stamps earns a free drink.

No backend, no accounts. The card lives on the customer's phone, like a paper
card in a wallet. That is deliberate: nothing to host, nothing to pay for,
nothing to break, no personal data collected.

## Trust model

```
 counter device (staff mode)                 customer phone
 ───────────────────────────                 ──────────────
 holds Ed25519 secret key      ──token──▶    holds public key(s) (cafe.config.json)
 signs one-time token per sale               verifies signature, freshness, nonce
 serves it over NFC (Android HCE)            appends event to local ledger
 or as a QR code (any platform)  ◀──ack───   (optional) writes ack back over NFC
```

- A **token** is 84 bytes: claims (kind, key id, count, issued-at, 96-bit
  nonce) + Ed25519 signature. Signed message is domain-separated with the
  café id. See `src/domain/token.ts`.
- The customer app rejects tokens that are forged, for another café, older
  than 15 min, from the future (>15 min skew), or whose nonce it has already
  applied. Nonces are kept in the ledger forever, so clock tricks can't replay.
- Out of scope (accepted risk, same as a paper card): a rooted phone editing
  its own storage, a lost phone losing its stamps (OS backups do restore it).
- The counter device's secret is provisioned by scanning a staff QR code
  produced by `npm run setup-cafe`; it is stored in SecureStore and never leaves
  the device.

## Transport

- **NFC (primary)**: the counter device (Android only — iOS can't emulate
  tags) runs a HostApduService that emulates an NFC Forum Type 4 Tag serving a
  single NDEF URI record `<scheme>://t/<base64url token>`. The customer app
  reads it with react-native-nfc-manager on iOS and Android, then best-effort
  writes back an ack record `<scheme>://a/...` so the barista's screen confirms.
- **QR (fallback)**: the counter screen can show the same URI as a QR code;
  the customer app scans it in-app. The OS camera also opens the app via the
  deep link.
- **Deep link**: any `<scheme>://t/...` URL that opens the app is applied the
  same way (covers Android background NFC dispatch and OS camera scans).

All transports converge on one function: `applyToken` in `src/domain/intake.ts`.

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
- Persistence: customer ledger in AsyncStorage (`card.v1`), counter log in
  AsyncStorage (`counter.v1`), staff secret + PIN hash in SecureStore.
  Every persisted shape carries a `version` field.
- Tests: Jest (`jest-expo` preset), colocated as `*.test.ts`. Test behaviour
  through public functions. Kotlin emulator has JVM unit tests under
  `modules/hce/android/src/test`.
