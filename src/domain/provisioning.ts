import { bytesEqual, fromBase64Url, toBase64Url } from './bytes';
import { err, ok, type Result } from './result';
import { keyPairFromSeed, type KeyPair, type KeyRing } from './token';

/**
 * Staff provisioning code, shown as a QR by `bun run setup-cafe`:
 *
 *   CAFESTAFF1.<cafeId>.<keyId>.<base64url 32-byte Ed25519 seed>
 *
 * Deliberately not a URL, so an OS camera scan never routes the secret
 * anywhere; only the in-app scanner understands it.
 */
export const STAFF_CODE_PREFIX = 'CAFESTAFF1';

/**
 * The demo staff code opens counter mode for app-store reviewers and staff
 * practice. Its seed is public (32 zero bytes) and key id 0 is reserved for it,
 * so no café ever trusts it: customers' apps reject its stamps, and a demo
 * counter can't take redemptions.
 */
export const DEMO_KEY_ID = 0;
const DEMO_SEED = new Uint8Array(32);
export const DEMO_PUBLIC_KEY = keyPairFromSeed(DEMO_SEED).publicKey;

export const demoStaffCode = (cafeId: string): string => buildStaffCode(cafeId, DEMO_KEY_ID, DEMO_SEED);

export interface StaffCredentials extends KeyPair {
  readonly keyId: number;
  readonly seed: Uint8Array;
  /** The public demo key: its stamps count for nothing. */
  readonly demo: boolean;
}

export type StaffCodeError = 'not-a-staff-code' | 'malformed' | 'wrong-cafe' | 'untrusted-key';

export function buildStaffCode(cafeId: string, keyId: number, seed: Uint8Array): string {
  return [STAFF_CODE_PREFIX, cafeId, String(keyId), toBase64Url(seed)].join('.');
}

export function parseStaffCode(
  raw: string,
  expected: { readonly cafeId: string; readonly keys: KeyRing },
): Result<StaffCredentials, StaffCodeError> {
  const parts = raw.trim().split('.');
  if (parts[0] !== STAFF_CODE_PREFIX) return err('not-a-staff-code');
  if (parts.length !== 4) return err('malformed');
  const [, cafeId, keyIdText, seedText] = parts;
  if (!/^\d{1,3}$/.test(keyIdText) || Number(keyIdText) > 255) return err('malformed');
  const seed = fromBase64Url(seedText);
  if (!seed || seed.length !== 32) return err('malformed');
  if (cafeId !== expected.cafeId) return err('wrong-cafe');
  const keyId = Number(keyIdText);
  const pair = keyPairFromSeed(seed);
  if (keyId === DEMO_KEY_ID && bytesEqual(pair.publicKey, DEMO_PUBLIC_KEY)) return ok({ keyId, seed, ...pair, demo: true });
  const trusted = expected.keys.get(keyId);
  if (!trusted || !bytesEqual(trusted, pair.publicKey)) return err('untrusted-key');
  return ok({ keyId, seed, ...pair, demo: false });
}
