import { expect, test } from '@jest/globals';

import { decodeToken, encodeClaims, keyPairFromSeed, nonceId, signToken, verifyToken, type TokenClaims } from './token';

const pair = keyPairFromSeed(new Uint8Array(32).fill(1));
const other = keyPairFromSeed(new Uint8Array(32).fill(2));
const keys = new Map([[7, pair.publicKey]]);
const claims: TokenClaims = { kind: 'stamp', keyId: 7, count: 3, issuedAt: 1700000000, nonce: new Uint8Array(12).fill(8) };
const token = signToken(claims, pair.secretKey, 'test-cafe');

test.each(['stamp', 'redeem'] as const)('signs and verifies %s claims', (kind) => {
  const input = { ...claims, kind };
  const signed = signToken(input, pair.secretKey, 'test-cafe');
  expect(signed).toHaveLength(84);
  expect(verifyToken(signed, keys, 'test-cafe')).toEqual({ ok: true, value: input });
  expect(decodeToken(signed)).toEqual({ ok: true, value: input });
});

test('every single-bit change anywhere in the token fails verification', () => {
  for (let byte = 0; byte < 84; byte++) {
    for (let bit = 0; bit < 8; bit++) {
      const altered = token.slice();
      altered[byte] ^= 1 << bit;
      expect({ byte, bit, accepted: verifyToken(altered, keys, 'test-cafe').ok }).toEqual({ byte, bit, accepted: false });
    }
  }
}, 30000);

test('binds signature to the cafe, key id and public key', () => {
  expect(verifyToken(token, keys, 'other-cafe')).toEqual({ ok: false, error: 'invalid-signature' });
  expect(verifyToken(token, new Map(), 'test-cafe')).toEqual({ ok: false, error: 'unknown-key' });
  expect(verifyToken(token, new Map([[7, other.publicKey]]), 'test-cafe')).toEqual({ ok: false, error: 'invalid-signature' });
});

test.each([0, 1, 19, 20, 83, 85, 100])('rejects token length %i', (length) => {
  const input = new Uint8Array(length);
  input.set(token.subarray(0, length));
  expect(verifyToken(input, keys, 'test-cafe')).toEqual({ ok: false, error: 'malformed' });
});

test.each([
  [0, 2, 'unsupported-version'], [1, 0, 'malformed'], [1, 3, 'malformed'], [3, 0, 'malformed'],
] as const)('rejects malformed claims at byte %i = %i', (offset, value, error) => {
  const input = token.slice();
  input[offset] = value;
  expect(decodeToken(input)).toEqual({ ok: false, error });
  expect(verifyToken(input, keys, 'test-cafe')).toEqual({ ok: false, error });
});

test.each([
  { keyId: 256 }, { keyId: -1 }, { keyId: 1.5 }, { count: 0 }, { count: 256 }, { count: -1 }, { count: 1.5 },
  { issuedAt: -1 }, { issuedAt: 2 ** 32 }, { issuedAt: 1.5 }, { issuedAt: NaN }, { issuedAt: Infinity },
  { nonce: new Uint8Array(11) }, { nonce: new Uint8Array(13) },
])('encodeClaims rejects out-of-range input %j', (override) => {
  expect(() => encodeClaims({ ...claims, ...override })).toThrow(RangeError);
});

test.each([0, 2 ** 31, 2 ** 32 - 1])('supports uint32 timestamp %i and byte field boundaries', (issuedAt) => {
  const input = { ...claims, keyId: 255, count: 255, issuedAt };
  expect(decodeToken(signToken(input, pair.secretKey, 'test-cafe'))).toEqual({ ok: true, value: input });
});

test('nonce ids are stable URL-safe identifiers', () => {
  expect(nonceId(new Uint8Array(12))).toBe('AAAAAAAAAAAAAAAA');
  expect(nonceId(new Uint8Array(12).fill(255))).toBe('________________');
});

test.each([0, 31, 33])('keyPairFromSeed rejects %i-byte seeds', (length) => {
  expect(() => keyPairFromSeed(new Uint8Array(length))).toThrow(RangeError);
});
