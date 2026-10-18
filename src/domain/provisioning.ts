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

export interface StaffCredentials extends KeyPair {
  readonly keyId: number;
  readonly seed: Uint8Array;
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
  const trusted = expected.keys.get(keyId);
  if (!trusted || !bytesEqual(trusted, pair.publicKey)) return err('untrusted-key');
  return ok({ keyId, seed, ...pair });
}
