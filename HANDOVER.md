# Handover

Where this project stands, for whoever picks it up next (human or agent).
User-facing docs: [README](README.md), [release guide](docs/RELEASE.md),
[architecture](docs/ARCHITECTURE.md).

## State (2026-10-18)

- Feature-complete for v1: stamp card, NFC tap-to-collect (Android HCE counter
  phone → iOS/Android customers), QR fallback both ways, counter-verified
  rewards with a SQLite spent-stamp registry, history, about, staff setup with
  PIN, counter settings.
- `bun run test` (27 suites, ~720 tests), `bunx tsc --noEmit` and
  `bunx eslint . --quiet` all pass.
- Verified on an Android emulator (no NFC): deep-link stamps, unlock, reward
  ticket → redeem sheet → code, code re-shown from History, the counter's
  stamp QR (decoded and signature-checked), redeem → scanner, counter
  provisioning, leaving counter mode. Redemption codes decoded from the
  screen were verified against `verifyRedemption` and refused the second time.
- **Not verified anywhere yet**: real NFC between two phones, iOS builds, the
  counter camera scanning a customer's code. `docs/RELEASE.md` §7 is the
  hardware checklist.
- Signing key: key 2 is the only trusted key (key 1 retired, its secret
  deleted). The secret and staff QR are in `cafe-secrets/` (gitignored, keep
  an offline backup).

## Gotchas found the hard way

- **No Reanimated `entering`/`exiting` layout animations inside a `Modal`.**
  On Android they intermittently leave views stuck invisible (opacity 0). Use
  `Appear` from `src/ui/motion.tsx` or explicit shared values (see
  `src/ui/Sheet.tsx`). Reproduced roughly 1 in 6 opens before the fix, 0 in 50 after.
- Reanimated reads reduced motion once per process (`transition_animation_scale`
  = 0); `uiautomator dump` on the emulator can flip animation scales to 0.
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
bun run setup-cafe check|new-key|retire <id>|print
```

HCE unit tests (from `android/` after `bunx expo prebuild --platform android`):
`./gradlew :cafe-hce:testDebugUnitTest`.
