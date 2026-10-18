import { expect, test } from '@jest/globals';

import { toBase64Url } from './bytes';
import { buildStaffCode, DEMO_KEY_ID, demoStaffCode, parseStaffCode } from './provisioning';
import { keyPairFromSeed } from './token';

const seed = new Uint8Array(32).fill(5);
const pair = keyPairFromSeed(seed);
const expected = { cafeId: 'test-cafe', keys: new Map([[7, pair.publicKey]]) };
const code = buildStaffCode(expected.cafeId, 7, seed);

test('staff code round-trip recovers the trusted credentials', () => {
  expect(parseStaffCode(code, expected)).toEqual({ ok: true, value: { keyId: 7, seed, ...pair, demo: false } });
  expect(parseStaffCode(` \n${code}\t `, expected)).toEqual(parseStaffCode(code, expected));
});

test.each(['', 'OTHER.test-cafe.7.seed', 'cafestaff1.test-cafe.7.seed', `https://${code}`])('rejects wrong prefix %j', (raw) => {
  expect(parseStaffCode(raw, expected)).toEqual({ ok: false, error: 'not-a-staff-code' });
});

test.each([
  'CAFESTAFF1', 'CAFESTAFF1.test-cafe.7', `${code}.extra`,
  `CAFESTAFF1.test-cafe.256.${toBase64Url(seed)}`, `CAFESTAFF1.test-cafe.01x.${toBase64Url(seed)}`,
  `CAFESTAFF1.test-cafe.-1.${toBase64Url(seed)}`, `CAFESTAFF1.test-cafe.1.5.${toBase64Url(seed)}`,
  'CAFESTAFF1.test-cafe.7.!!!!',
  ...[0, 31, 33].map((length) => `CAFESTAFF1.test-cafe.7.${toBase64Url(new Uint8Array(length))}`),
])('rejects malformed staff code %j', (raw) => {
  expect(parseStaffCode(raw, expected)).toEqual({ ok: false, error: 'malformed' });
});

test('rejects codes belonging to another cafe', () => {
  expect(parseStaffCode(buildStaffCode('other-cafe', 7, seed), expected)).toEqual({ ok: false, error: 'wrong-cafe' });
});

test('rejects missing trusted key and matching id with a different public key', () => {
  expect(parseStaffCode(code, { ...expected, keys: new Map() })).toEqual({ ok: false, error: 'untrusted-key' });
  const other = keyPairFromSeed(new Uint8Array(32).fill(6));
  expect(parseStaffCode(code, { ...expected, keys: new Map([[7, other.publicKey]]) })).toEqual({ ok: false, error: 'untrusted-key' });
});

test.each([0, 255])('accepts trusted key id boundary %i', (id) => {
  expect(parseStaffCode(buildStaffCode(expected.cafeId, id, seed), { ...expected, keys: new Map([[id, pair.publicKey]]) })).toMatchObject({ ok: true, value: { keyId: id } });
});

test('the demo code opens a demo counter without the café trusting its key', () => {
  for (const keys of [expected.keys, new Map()]) {
    const parsed = parseStaffCode(demoStaffCode(expected.cafeId), { ...expected, keys });
    expect(parsed).toMatchObject({ ok: true, value: { keyId: DEMO_KEY_ID, demo: true } });
  }
});

test("the demo code still belongs to one café", () => {
  expect(parseStaffCode(demoStaffCode('other-cafe'), expected)).toEqual({ ok: false, error: 'wrong-cafe' });
});

test('only the demo seed under the demo id is the demo', () => {
  expect(parseStaffCode(buildStaffCode(expected.cafeId, 7, new Uint8Array(32)), expected)).toEqual({ ok: false, error: 'untrusted-key' });
  expect(parseStaffCode(buildStaffCode(expected.cafeId, DEMO_KEY_ID, seed), expected)).toEqual({ ok: false, error: 'untrusted-key' });
});
