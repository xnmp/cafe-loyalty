import { expect, test } from '@jest/globals';

import { concatBytes, utf8Encode } from './bytes';
import { decodeMessage, encodeUriMessage, messageUris, recordToUri, type NdefRecord } from './ndef';

test.each([
  `testcafe12://t/${'A'.repeat(112)}`, 'u'.repeat(300), 'café://😀',
])('URI survives NDEF encoding and decoding (%s)', (uri) => {
  const records = decodeMessage(encodeUriMessage(uri));
  expect(records).not.toBeNull();
  expect(messageUris(records!)).toEqual([uri]);
  expect(recordToUri(records![0])).toBe(uri);
});

test('encodes a tiny URI with the known short-record byte vector', () => {
  // MB | ME | SR | well-known TNF, type length, payload length, U, no prefix, x.
  const vector = Uint8Array.of(0xd1, 1, 2, 0x55, 0, 0x78);
  expect(encodeUriMessage('x')).toEqual(vector);
  expect(messageUris(decodeMessage(vector)!)).toEqual(['x']);
});

test('encodes long URI payloads with the four-byte length field', () => {
  const message = encodeUriMessage('u'.repeat(300));
  expect(message.subarray(0, 7)).toEqual(Uint8Array.of(0xc1, 1, 0, 0, 1, 45, 0x55));
  expect(messageUris(decodeMessage(message)!)).toEqual(['u'.repeat(300)]);
});

test('decodes a record with an ID field without treating the ID as payload', () => {
  const bytes = Uint8Array.of(0xd9, 1, 2, 2, 0x55, 0xaa, 0xbb, 0, 0x78);
  expect(messageUris(decodeMessage(bytes)!)).toEqual(['x']);
});

test('preserves URI order across multiple records', () => {
  const first = encodeUriMessage('first');
  const last = encodeUriMessage('last');
  first[0] &= ~0x40;
  last[0] &= ~0x80;
  expect(messageUris(decodeMessage(concatBytes(first, last))!)).toEqual(['first', 'last']);
});

test('expands abbreviated HTTPS URI prefixes', () => {
  const bytes = concatBytes(Uint8Array.of(0xd1, 1, 12, 0x55, 4), utf8Encode('example.com'));
  expect(messageUris(decodeMessage(bytes)!)).toEqual(['https://example.com']);
});

test('extracts UTF-8 Text records, skipping the language code', () => {
  const text = 'testcafe://t/hello😀';
  const payload = concatBytes(Uint8Array.of(2), utf8Encode('en'), utf8Encode(text));
  const message = concatBytes(Uint8Array.of(0xd1, 1, payload.length, 0x54), payload);
  expect(messageUris(decodeMessage(message)!)).toEqual([text]);
});

test.each([
  [], [0xd1], [0xd1, 1], [0xc1, 1], [0xc1, 1, 0, 0, 0],
  [0xd9, 1, 2], [0xd1, 1, 10, 0x55, 0, 0x78],
  [0xc1, 1, 0xff, 0xff, 0xff, 0xff, 0x55], [0xf1, 1, 2, 0x55, 0, 0x78],
])('rejects empty, chunked or truncated message %j', (...bytes) => {
  expect(decodeMessage(Uint8Array.from(bytes))).toBeNull();
});

test('rejects every nonempty truncation of a complete single-record message', () => {
  for (const uri of ['x', 'u'.repeat(300)]) {
    const message = encodeUriMessage(uri);
    for (let size = 1; size < message.length; size++) {
      expect(decodeMessage(message.slice(0, size))).toBeNull();
    }
  }
});

test.each([
  { tnf: 2, type: Uint8Array.of(0x55), payload: Uint8Array.of(0, 120) },
  { tnf: 1, type: Uint8Array.of(0x55, 0x55), payload: Uint8Array.of(0, 120) },
  { tnf: 1, type: Uint8Array.of(0x55), payload: new Uint8Array() },
  { tnf: 1, type: Uint8Array.of(0x55), payload: Uint8Array.of(255, 120) },
  { tnf: 1, type: Uint8Array.of(0x55), payload: Uint8Array.of(0, 0xc0, 0x80) },
  { tnf: 1, type: Uint8Array.of(0x54), payload: Uint8Array.of(0x82, 101, 110, 120) },
  { tnf: 1, type: Uint8Array.of(0x58), payload: Uint8Array.of(0, 120) },
] satisfies NdefRecord[])('ignores unsupported or malformed URI/Text records %#', (record) => {
  expect(recordToUri(record)).toBeNull();
  expect(messageUris([record])).toEqual([]);
});

test('Text records reject a language field extending beyond the payload', () => {
  expect(recordToUri({ tnf: 1, type: Uint8Array.of(0x54), payload: Uint8Array.of(3, 101) })).toBeNull();
});

test('random garbage never throws during decoding or URI extraction', () => {
  let state = 0x12345678;
  for (let length = 0; length < 512; length++) {
    const bytes = Uint8Array.from({ length }, () => {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      return state >>> 24;
    });
    expect(() => {
      const decoded = decodeMessage(bytes);
      if (decoded) messageUris(decoded);
    }).not.toThrow();
  }
});
