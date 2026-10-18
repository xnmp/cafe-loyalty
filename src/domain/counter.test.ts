import { expect, test } from '@jest/globals';

import { emptyCard } from './card';
import { createOffer, emptyCounterLog, logOffer, LOG_RETENTION_MS, markRead, markShownAsQr, markWithdrawn, parseCounterLog, recordAck, statsBetween, type CounterLog, type IssuedToken } from './counter';
import { applyToken } from './intake';
import { parseLink, type Ack } from './link';
import { decodeMessage, messageUris } from './ndef';
import { keyPairFromSeed, verifyToken } from './token';

const pair = keyPairFromSeed(new Uint8Array(32).fill(4));
const keys = new Map([[2, pair.publicKey]]);
const params = { kind: 'stamp' as const, count: 3, now: 1700000000123, nonce: new Uint8Array(12).fill(4), keyId: 2, secretKey: pair.secretKey, cafeId: 'test-cafe', scheme: 'testcafe' };
const offer = createOffer(params);
const base: CounterLog = { version: 1, issued: [offer.record] };
const ack: Ack = { nonceId: offer.record.nonceId, status: 'stamped', progress: 3, rewardsAvailable: 0 };

test('offer NDEF URI parses to a verifiable token that applies to a customer card', () => {
  const uris = messageUris(decodeMessage(offer.ndef)!);
  expect(uris).toEqual([offer.link]);
  const link = parseLink(params.scheme, uris[0]);
  if (!link || link.kind !== 'token') throw new Error('Offer did not contain a token link');
  expect(link.token).toEqual(offer.token);
  expect(verifyToken(link.token, keys, params.cafeId)).toMatchObject({ ok: true, value: { kind: 'stamp', count: 3, issuedAt: 1700000000 } });
  const result = applyToken(emptyCard, link.token, { cafeId: params.cafeId, keys, rules: { stampsPerReward: 9, maxStampsPerTap: 10 }, now: params.now });
  expect(result).toMatchObject({ ok: true, value: { nonceId: offer.record.nonceId, outcome: { kind: 'stamped', added: 3, after: { totalStamps: 3, progress: 3 } } } });
});

test('logOffer prunes past retention, keeps the exact boundary, and preserves inputs', () => {
  const now = params.now;
  const old: IssuedToken = { ...offer.record, nonceId: 'old', issuedAt: now - LOG_RETENTION_MS - 1 };
  const boundary: IssuedToken = { ...old, nonceId: 'boundary', issuedAt: now - LOG_RETENTION_MS };
  const log: CounterLog = { version: 1, issued: [old, boundary] };
  expect(logOffer(log, offer.record, now).issued).toEqual([boundary, offer.record]);
  expect(log.issued).toEqual([old, boundary]);
  expect(logOffer(emptyCounterLog, offer.record, now).issued).toEqual([offer.record]);
});

test('read, withdrawal and QR transitions preserve delivery evidence', () => {
  const id = offer.record.nonceId;
  const withdrawn = markWithdrawn(base, id);
  expect(withdrawn.issued[0].status).toBe('withdrawn');
  expect(markRead(withdrawn, id).issued[0].status).toBe('read');
  const read = markRead(base, id);
  expect(read.issued[0].status).toBe('read');
  expect(markWithdrawn(read, id).issued[0].status).toBe('read');
  const acked = recordAck(base, ack);
  expect(markRead(acked, id).issued[0].status).toBe('acked');
  expect(markWithdrawn(acked, id).issued[0].status).toBe('acked');
  expect(markShownAsQr(withdrawn, id).issued[0]).toMatchObject({ status: 'withdrawn', shownAsQr: true });
  expect(base.issued[0]).toMatchObject({ status: 'offered', shownAsQr: false, ack: null });
});

test.each(['stamped', 'redeemed'] as const)('a successful %s ack survives later rejection', (status) => {
  const success = { ...ack, status };
  const log = recordAck(base, success);
  expect(recordAck(log, { ...ack, status: 'already-used' })).toEqual(log);
  expect(recordAck(log, { ...ack, status: 'invalid' }).issued[0]).toMatchObject({ status: 'acked', ack: success });
});

test('a later successful ack replaces failure and unknown nonces are ignored', () => {
  const rejected = recordAck(base, { ...ack, status: 'expired' });
  expect(recordAck(rejected, ack).issued[0]).toMatchObject({ status: 'acked', ack });
  expect(recordAck(base, { ...ack, nonceId: 'unknown' })).toEqual(base);
  for (const transition of [markRead, markWithdrawn, markShownAsQr]) expect(transition(base, 'unknown')).toEqual(base);
});

test('stats count only delivered, non-rejected offers in [from, to)', () => {
  const entry = (nonceId: string, override: Partial<IssuedToken>): IssuedToken => ({ ...offer.record, nonceId, issuedAt: 100, count: 2, ...override });
  const log: CounterLog = { version: 1, issued: [
    entry('from', { status: 'read', issuedAt: 100 }),
    entry('inside', { status: 'acked', ack, count: 3, issuedAt: 199 }),
    entry('qr', { shownAsQr: true, count: 4 }),
    entry('qr-withdrawn', { status: 'withdrawn', shownAsQr: true, count: 5 }),
    entry('reward', { kind: 'redeem', status: 'read', count: 2 }),
    entry('reward-acked', { kind: 'redeem', status: 'acked', count: 3, ack: { ...ack, status: 'redeemed' } }),
    entry('before', { status: 'read', issuedAt: 99, count: 100 }),
    entry('to', { status: 'read', issuedAt: 200, count: 100 }),
    entry('offered', { count: 100 }), entry('withdrawn', { status: 'withdrawn', count: 100 }),
    ...(['already-used', 'expired', 'no-reward', 'invalid'] as const).map((status) => entry(status, { status: 'acked', shownAsQr: true, count: 100, ack: { ...ack, status } })),
  ] };
  expect(statsBetween(log, 100, 200)).toEqual({ stamps: 14, rewards: 5 });
  expect(statsBetween(log, 200, 200)).toEqual({ stamps: 0, rewards: 0 });
  expect(statsBetween(emptyCounterLog, 0, Infinity)).toEqual({ stamps: 0, rewards: 0 });
});

test('parseCounterLog accepts a complete issued log', () => {
  expect(parseCounterLog(emptyCounterLog)).toEqual(emptyCounterLog);
  expect(parseCounterLog(JSON.parse(JSON.stringify(recordAck(base, ack))))).toEqual(recordAck(base, ack));
});

test.each([null, [], 'log', {}, { version: 2, issued: [] }, { version: 1, issued: {} }, { version: 1, issued: [null] }, { version: 1, issued: [{}] }])('parseCounterLog rejects junk %#', (value) => {
  expect(parseCounterLog(value)).toBeNull();
});

test.each([
  ['non-string nonce', { nonceId: 1 }], ['unknown kind', { kind: 'other' }],
  ['non-numeric count', { count: '1' }], ['non-numeric issuedAt', { issuedAt: '1' }], ['non-string status', { status: 1 }],
  ['zero count', { count: 0 }], ['negative count', { count: -1 }], ['fractional count', { count: 1.5 }],
  ['NaN count', { count: NaN }], ['NaN issuedAt', { issuedAt: NaN }],
  ['unknown status', { status: 'unknown' }], ['non-boolean shownAsQr', { shownAsQr: 'yes' }], ['malformed ack', { ack: { status: 'unknown' } }],
])('parseCounterLog rejects %s', (_label, override) => {
  expect(parseCounterLog({ version: 1, issued: [{ ...offer.record, ...override }] })).toBeNull();
});
