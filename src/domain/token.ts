import nacl from 'tweetnacl';

import { concatBytes, readUint32BE, toBase64Url, utf8Encode, writeUint32BE } from './bytes';
import type { Result } from './result';

/**
 * Wire format v1 (84 bytes):
 *
 *   0  u8      version (1)
 *   1  u8      kind (1 = stamp, 2 = redeem)
 *   2  u8      keyId
 *   3  u8      count (stamps granted, or rewards redeemed)
 *   4  u32 BE  issuedAt, unix seconds
 *   8  12B     nonce
 *  20  64B     Ed25519 signature over DOMAIN(cafeId) || bytes[0..20)
 */
export const TOKEN_VERSION = 1;
export const CLAIMS_LENGTH = 20;
export const NONCE_LENGTH = 12;
export const SIGNATURE_LENGTH = 64;
export const TOKEN_LENGTH = CLAIMS_LENGTH + SIGNATURE_LENGTH;
export const MAX_COUNT = 255;

export type TokenKind = 'stamp' | 'redeem';

const KIND_CODES: Readonly<Record<TokenKind, number>> = { stamp: 1, redeem: 2 };
const KIND_BY_CODE: Readonly<Record<number, TokenKind>> = { 1: 'stamp', 2: 'redeem' };

export interface TokenClaims {
  readonly kind: TokenKind;
  readonly keyId: number;
  readonly count: number;
  /** Unix seconds. */
  readonly issuedAt: number;
  readonly nonce: Uint8Array;
}

/** keyId -> 32-byte Ed25519 public key. */
export type KeyRing = ReadonlyMap<number, Uint8Array>;

export type TokenDecodeError = 'malformed' | 'unsupported-version';
export type TokenVerifyError = TokenDecodeError | 'unknown-key' | 'invalid-signature';

const signingDomain = (cafeId: string): Uint8Array => utf8Encode(`cafe-loyalty/v1/${cafeId}\n`);

function isByte(n: number): boolean {
  return Number.isInteger(n) && n >= 0 && n <= 255;
}

export function encodeClaims(claims: TokenClaims): Uint8Array {
  if (!isByte(claims.keyId)) throw new RangeError(`keyId out of range: ${claims.keyId}`);
  if (!isByte(claims.count) || claims.count === 0) throw new RangeError(`count out of range: ${claims.count}`);
  if (!Number.isInteger(claims.issuedAt) || claims.issuedAt < 0 || claims.issuedAt > 0xffffffff)
    throw new RangeError(`issuedAt out of range: ${claims.issuedAt}`);
  if (claims.nonce.length !== NONCE_LENGTH) throw new RangeError(`nonce must be ${NONCE_LENGTH} bytes`);
  return concatBytes(
    Uint8Array.of(TOKEN_VERSION, KIND_CODES[claims.kind], claims.keyId, claims.count),
    writeUint32BE(claims.issuedAt),
    claims.nonce,
  );
}

/** Signs claims with a 64-byte tweetnacl secret key (seed || public key). */
export function signToken(claims: TokenClaims, secretKey: Uint8Array, cafeId: string): Uint8Array {
  const body = encodeClaims(claims);
  const signature = nacl.sign.detached(concatBytes(signingDomain(cafeId), body), secretKey);
  return concatBytes(body, signature);
}

/** Parses the structure only. Does NOT check the signature; use verifyToken. */
export function decodeToken(bytes: Uint8Array): Result<TokenClaims, TokenDecodeError> {
  if (bytes.length >= 1 && bytes[0] !== TOKEN_VERSION) return { ok: false, error: 'unsupported-version' };
  if (bytes.length !== TOKEN_LENGTH) return { ok: false, error: 'malformed' };
  const kind = KIND_BY_CODE[bytes[1]];
  const count = bytes[3];
  if (kind === undefined || count === 0) return { ok: false, error: 'malformed' };
  return {
    ok: true,
    value: {
      kind,
      keyId: bytes[2],
      count,
      issuedAt: readUint32BE(bytes, 4),
      nonce: bytes.slice(8, CLAIMS_LENGTH),
    },
  };
}

export function verifyToken(
  bytes: Uint8Array,
  keys: KeyRing,
  cafeId: string,
): Result<TokenClaims, TokenVerifyError> {
  const decoded = decodeToken(bytes);
  if (!decoded.ok) return decoded;
  const publicKey = keys.get(decoded.value.keyId);
  if (!publicKey) return { ok: false, error: 'unknown-key' };
  const message = concatBytes(signingDomain(cafeId), bytes.subarray(0, CLAIMS_LENGTH));
  const valid = nacl.sign.detached.verify(message, bytes.subarray(CLAIMS_LENGTH), publicKey);
  return valid ? decoded : { ok: false, error: 'invalid-signature' };
}

/** Stable string id for a nonce, used for replay tracking and acks. */
export const nonceId = (nonce: Uint8Array): string => toBase64Url(nonce);

export interface KeyPair {
  readonly publicKey: Uint8Array;
  readonly secretKey: Uint8Array;
}

export function keyPairFromSeed(seed: Uint8Array): KeyPair {
  if (seed.length !== 32) throw new RangeError('seed must be 32 bytes');
  const kp = nacl.sign.keyPair.fromSeed(seed);
  return { publicKey: kp.publicKey, secretKey: kp.secretKey };
}
