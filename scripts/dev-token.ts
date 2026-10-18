// Development helper: mint a real signed token with the local staff secret and
// print its deep link, to exercise the app without a counter phone, e.g.
//   adb shell am start -a android.intent.action.VIEW -d "$(bun scripts/dev-token.ts stamp 2)"
//   xcrun simctl openurl booted "$(bun scripts/dev-token.ts redeem)"
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { keyRingOf, type CafeConfig } from '../src/domain/config';
import { createOffer } from '../src/domain/counter';
import { parseStaffCode } from '../src/domain/provisioning';

const root = fileURLToPath(new URL('..', import.meta.url));
const cafe = JSON.parse(readFileSync(join(root, 'cafe.config.json'), 'utf8')) as CafeConfig;
const [kindArg = 'stamp', countArg = '1'] = process.argv.slice(2);
if (kindArg !== 'stamp' && kindArg !== 'redeem') throw new Error('usage: dev-token.ts [stamp|redeem] [count]');

const secrets = readdirSync(join(root, 'cafe-secrets')).filter((f) => /^staff-key-\d+\.txt$/.test(f));
const creds = secrets
  .map((f) => parseStaffCode(readFileSync(join(root, 'cafe-secrets', f), 'utf8'), { cafeId: cafe.cafeId, keys: keyRingOf(cafe) }))
  .find((r) => r.ok);
if (!creds?.ok) throw new Error('No valid staff secret in cafe-secrets/ (run `bun run setup-cafe new-key`)');

const offer = createOffer({
  kind: kindArg,
  count: Number(countArg),
  now: Date.now(),
  nonce: crypto.getRandomValues(new Uint8Array(12)),
  keyId: creds.value.keyId,
  secretKey: creds.value.secretKey,
  cafeId: cafe.cafeId,
  scheme: cafe.scheme,
});
console.log(offer.link);
