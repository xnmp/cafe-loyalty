# Café loyalty card

A digital stamp card for one café, for iOS and Android. Customers tap their
phone on the café's counter phone (NFC) to collect stamps; every
`stampsPerReward` stamps earns a free drink, verified by the counter phone.
No backend, no accounts, nothing to host.

- **Release it:** [docs/RELEASE.md](docs/RELEASE.md)
- **How it works:** [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- **Customise it:** everything café-specific is in [`cafe.config.json`](cafe.config.json)

```sh
bun install
bun run test && bun run typecheck && bun run lint
```

Built with Expo SDK 58 / React Native, a local Expo module for Android NFC tag
emulation (`modules/hce`), and Ed25519 signatures (tweetnacl).
