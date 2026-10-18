import { describe, expect, test } from '@jest/globals';

import { fromBase64Url, toBase64Url } from './bytes';
import { createPinRecord, isValidPin, parsePinRecord, verifyPin } from './pin';

test.each(['0000', '1234', '12345', '123456', '1234567', '12345678'])('accepts PIN %j', (pin) => {
  expect(isValidPin(pin)).toBe(true);
});

test.each(['', '123', '123456789', 'abcd', '12a4', ' 1234', '1234 ', '12 34', '１２３４', '1234\n'])('rejects PIN %j and refuses to create a record', (pin) => {
  expect(isValidPin(pin)).toBe(false);
  expect(() => createPinRecord(pin, new Uint8Array(16).fill(1))).toThrow(RangeError);
});

describe('PIN verification', () => {
  const salt = new Uint8Array(16).fill(7);
  const record = createPinRecord('012345', salt);

  test('created record verifies after persistence, and rejects wrong PIN', () => {
    const parsed = parsePinRecord(JSON.parse(JSON.stringify(record)));
    expect(parsed).not.toBeNull();
    expect(verifyPin('012345', parsed!)).toBe(true);
    expect(verifyPin('012346', record)).toBe(false);
    expect(verifyPin('123', record)).toBe(false);
    expect(salt).toEqual(new Uint8Array(16).fill(7));
  });

  test('tampered salt and hash fail verification, including invalid encodings', () => {
    const changedSalt = salt.slice();
    changedSalt[0] ^= 1;
    const changedHash = fromBase64Url(record.hash)!;
    changedHash[0] ^= 1;
    expect(verifyPin('012345', { ...record, salt: toBase64Url(changedSalt) })).toBe(false);
    expect(verifyPin('012345', { ...record, hash: toBase64Url(changedHash) })).toBe(false);
    expect(verifyPin('012345', { ...record, salt: '!' })).toBe(false);
    expect(verifyPin('012345', { ...record, hash: '!' })).toBe(false);
    expect(verifyPin('012345', { ...record, hash: '' })).toBe(false);
  });

  test('distinct salts produce independently verifiable records', () => {
    const another = createPinRecord('012345', new Uint8Array(16).fill(8));
    expect(another.hash).not.toBe(record.hash);
    expect(verifyPin('012345', another)).toBe(true);
  });

  test.each([null, [], {}, 'pin', { ...record, version: 2 }, { ...record, salt: 1 }, { ...record, hash: null }, ...[0, -1, 1e9, 1.5, NaN, Infinity, '2000'].map((iterations) => ({ ...record, iterations }))])('parsePinRecord rejects junk %#', (value) => {
    expect(parsePinRecord(value)).toBeNull();
  });
});
