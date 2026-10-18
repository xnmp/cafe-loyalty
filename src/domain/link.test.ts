import { expect, test } from '@jest/globals';

import { toBase64Url } from './bytes';
import { buildAckLink, buildTokenLink, parseLink, type Ack, type AckStatus } from './link';

const scheme = 'testcafe';
const token = Uint8Array.from({ length: 84 }, (_, i) => i);
const encoded = toBase64Url(token);
const ack: Ack = { nonceId: toBase64Url(new Uint8Array(12).fill(7)), status: 'stamped', progress: 8, rewardsAvailable: 2 };

test('token build and parse round-trip', () => {
  expect(parseLink(scheme, buildTokenLink(scheme, token))).toEqual({ kind: 'token', token });
});

test.each(['stamped', 'redeemed', 'already-used', 'expired', 'no-reward', 'invalid'] satisfies AckStatus[])('ack %s round-trips', (status) => {
  const input = { ...ack, status };
  expect(parseLink(scheme, buildAckLink(scheme, input))).toEqual({ kind: 'ack', ack: input });
});

test.each([
  `TESTCAFE://t/${encoded}`, `testcafe:///t/${encoded}`, `testcafe://t/${encoded}/`,
  `testcafe://t/${encoded}?source=nfc`, `testcafe://t/${encoded}#scan`,
  ` \ntestcafe://t/${encoded}/?source=qr#scan\t`, encoded,
])('tolerates platform URL form %s', (raw) => {
  expect(parseLink(scheme, raw)).toEqual({ kind: 'token', token });
});

test('scheme matching is case-insensitive for both caller and URL', () => {
  expect(parseLink('TESTCAFE', buildTokenLink(scheme, token))).toEqual({ kind: 'token', token });
  expect(parseLink(scheme, `${buildAckLink('TESTCAFE', ack)}/?x=1#done`)).toEqual({ kind: 'ack', ack });
});

test.each([
  '', `other://t/${encoded}`, `https://t/${encoded}`, `testcafe://x/${encoded}`,
  'testcafe://t', `testcafe://t/${encoded}/extra`, 'testcafe://t/!!!!',
  `testcafe://t/${toBase64Url(new Uint8Array(83))}`, `testcafe://t/${toBase64Url(new Uint8Array(85))}`,
  `testcafe://a/${ack.nonceId}/unknown/1/2`, `testcafe://a/${ack.nonceId}/stamped/1`,
  `testcafe://a/${ack.nonceId}/stamped/1/2/3`, 'testcafe://a/bad!/stamped/1/2',
  `testcafe://a/${toBase64Url(new Uint8Array(11))}/stamped/1/2`,
])('rejects unrelated or malformed link %j', (raw) => {
  expect(parseLink(scheme, raw)).toBeNull();
});

test.each(['x', '-1', '1.5', '1e2', 'NaN', 'Infinity', '1000000', '999999999999999999999999'])('rejects ack numeric field %j', (value) => {
  expect(parseLink(scheme, `testcafe://a/${ack.nonceId}/stamped/${value}/0`)).toBeNull();
  expect(parseLink(scheme, `testcafe://a/${ack.nonceId}/stamped/0/${value}`)).toBeNull();
});

test('accepts zero and the largest supported ack number', () => {
  const input = { ...ack, progress: 0, rewardsAvailable: 999999 };
  expect(parseLink(scheme, buildAckLink(scheme, input))).toEqual({ kind: 'ack', ack: input });
});

test('rejects 100k characters of garbage promptly', () => {
  const started = performance.now();
  expect(parseLink(scheme, 'x'.repeat(100000))).toBeNull();
  expect(parseLink(scheme, `testcafe://t/${'!'.repeat(100000)}`)).toBeNull();
  expect(performance.now() - started).toBeLessThan(1000);
});
