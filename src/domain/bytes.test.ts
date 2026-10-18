import { describe, expect, test } from '@jest/globals';

import { bytesEqual, concatBytes, fromBase64Url, readUint32BE, toBase64Url, utf8Decode, utf8Encode, writeUint32BE } from './bytes';

describe('base64url', () => {
  test.each([
    ['', ''], ['f', 'Zg'], ['fo', 'Zm8'], ['foo', 'Zm9v'],
    ['foob', 'Zm9vYg'], ['fooba', 'Zm9vYmE'], ['foobar', 'Zm9vYmFy'],
  ])('RFC 4648 vector %j', (plain, encoded) => {
    expect(toBase64Url(utf8Encode(plain))).toBe(encoded);
    expect(fromBase64Url(encoded)).toEqual(utf8Encode(plain));
  });

  test.each(Array.from({ length: 71 }, (_, n) => n))('round-trips %i bytes of seeded pseudorandom data', (length) => {
    // Reproducible random coverage, independent of the codec under test.
    let state = length + 1;
    const bytes = Uint8Array.from({ length }, () => {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      return state >>> 24;
    });
    const encoded = toBase64Url(bytes);
    expect(encoded).toMatch(/^[A-Za-z0-9_-]*$/);
    expect(fromBase64Url(encoded)).toEqual(bytes);
  });

  test('uses URL alphabet and accepts standard alphabet and trailing padding', () => {
    expect(toBase64Url(Uint8Array.of(251, 255))).toBe('-_8');
    for (const value of ['-_8', '-_8=', '+/8', '+/8=']) {
      expect(fromBase64Url(value)).toEqual(Uint8Array.of(251, 255));
    }
    expect(fromBase64Url('Zg==')).toEqual(Uint8Array.of(102));
  });

  test.each(['A', 'AAAAA', 'AAAAAAAAA', 'Z g', 'Zg\n', 'Z=g', '?g', 'éA', 'AA.A', 'AA=A'])('rejects invalid input %j', (value) => {
    expect(fromBase64Url(value)).toBeNull();
  });
});

describe('UTF-8', () => {
  test.each(['', 'coffee', 'Café ☕', '😀𐐷𝄞', '\u0000\u007f\u0080\u07ff\u0800\uffff', '\u{10ffff}'])('round-trips %j', (text) => {
    expect(utf8Decode(utf8Encode(text))).toBe(text);
  });

  test('matches known multibyte encoding', () => {
    expect(utf8Encode('é😀')).toEqual(Uint8Array.of(0xc3, 0xa9, 0xf0, 0x9f, 0x98, 0x80));
  });

  test.each([
    [0xc0, 0x80], [0xc1, 0xbf], [0xe0, 0x80, 0xaf], [0xf0, 0x80, 0x80, 0xaf],
    [0xed, 0xa0, 0x80], [0xed, 0xbf, 0xbf], [0xc2], [0xe2, 0x82], [0xf0, 0x9f, 0x98],
    [0x80], [0xbf], [0x61, 0x80], [0xe2, 0x41, 0xac], [0xf4, 0x90, 0x80, 0x80], [0xff],
  ])('rejects malformed byte sequence %j', (...values) => {
    expect(utf8Decode(Uint8Array.from(values))).toBeNull();
  });
});

test.each([
  [0, [0, 0, 0, 0]], [2 ** 31, [128, 0, 0, 0]], [2 ** 32 - 1, [255, 255, 255, 255]],
] as const)('uint32 boundary %i has big-endian encoding', (value, bytes) => {
  expect(writeUint32BE(value)).toEqual(Uint8Array.from(bytes));
  expect(readUint32BE(Uint8Array.from([77, ...bytes, 88]), 1)).toBe(value);
});

test('bytesEqual compares contents and length, including empty arrays', () => {
  expect(bytesEqual(new Uint8Array(), new Uint8Array())).toBe(true);
  expect(bytesEqual(Uint8Array.of(1, 2), Uint8Array.of(1, 2))).toBe(true);
  expect(bytesEqual(Uint8Array.of(1, 2), Uint8Array.of(1, 3))).toBe(false);
  expect(bytesEqual(Uint8Array.of(1), Uint8Array.of(1, 0))).toBe(false);
  expect(bytesEqual(Uint8Array.of(1, 0), Uint8Array.of(1))).toBe(false);
});

test('concatBytes preserves order and does not alias its inputs', () => {
  const first = Uint8Array.of(1, 2);
  const joined = concatBytes(new Uint8Array(), first, Uint8Array.of(3));
  expect(joined).toEqual(Uint8Array.of(1, 2, 3));
  joined[0] = 9;
  expect(first).toEqual(Uint8Array.of(1, 2));
  expect(concatBytes()).toEqual(new Uint8Array());
});
