import { expect, test } from '@jest/globals';

import { toBase64Url } from './bytes';
import { cardOf, rules, stamp } from '../testing/protocol.test-utils';
import { appendEvent, emptyCard, findEvent, hasNonce, parseCard, summarize, unspentProofs, type Card, type RedeemEvent } from './card';

const first = stamp(1, 9, 100);
const redeem: RedeemEvent = { kind: 'redeem', at: 200, nonceId: 'request', spends: [{ nonceId: first.nonceId, stamps: 9 }], via: 'nfc', trigger: 'counter-token' };

test.each([[0, 0, 0], [8, 8, 0], [9, 0, 1], [10, 1, 1], [18, 0, 2], [27, 0, 3]])('summarizes %i unspent stamps', (count, progress, rewardsAvailable) => {
  const card: Card = { version: 2, events: count ? [{ ...first, count }] : [] };
  expect(summarize(card, rules)).toEqual({ totalStamps: count, unspentStamps: count, progress, rewardsRedeemed: 0, rewardsAvailable, lastActivityAt: count ? 100 : null });
});

test('derives balances from actual spends and finds latest activity by time', () => {
  const card: Card = { version: 2, events: [first, { ...redeem, at: 500 }, stamp(2, 10, 300)] };
  expect(summarize(card, rules)).toEqual({ totalStamps: 19, unspentStamps: 10, progress: 1, rewardsRedeemed: 1, rewardsAvailable: 1, lastActivityAt: 500 });
  expect(summarize({ ...card, events: [first, { ...redeem, spends: [{ nonceId: first.nonceId, stamps: 3 }] }] }, rules)).toMatchObject({ unspentStamps: 6, progress: 6, rewardsAvailable: 0 });
});

test('clamps excess spends to zero', () => {
  for (const events of [[redeem], [first, { ...redeem, spends: [{ nonceId: first.nonceId, stamps: 100 }] }]]) {
    expect(summarize({ version: 2, events }, rules)).toMatchObject({ unspentStamps: 0, progress: 0, rewardsAvailable: 0 });
  }
});

test('append preserves frozen input and tracks request and trigger nonces', () => {
  const card = Object.freeze({ version: 2 as const, events: Object.freeze([Object.freeze(first)]) });
  const next = appendEvent(card, redeem);
  expect(card.events).toEqual([first]);
  expect(next.events).toEqual([first, redeem]);
  expect(hasNonce(card, 'request')).toBe(false);
  for (const id of ['request', 'counter-token', first.nonceId]) expect(hasNonce(next, id)).toBe(true);
  expect(findEvent(next, 'counter-token')).toEqual(redeem);
  expect(findEvent(next, 'missing')).toBeUndefined();
});

test('unspent proofs skip exhausted stamps and retain partial balances in ledger order', () => {
  const card = cardOf(9, 10, 2);
  const spent = appendEvent(card, { ...redeem, spends: [{ nonceId: card.events[0].nonceId, stamps: 9 }, { nonceId: card.events[1].nonceId, stamps: 3 }] });
  expect(unspentProofs(spent)).toEqual([{ event: card.events[1], remaining: 7 }, { event: card.events[2], remaining: 2 }]);
});

test('parses persisted v2 ledger, including code redemption without trigger', () => {
  const card: Card = { version: 2, events: [first, redeem, { ...redeem, nonceId: 'code', via: 'code', trigger: undefined }] };
  expect(parseCard(emptyCard)).toEqual({ card: emptyCard, dropped: 0 });
  const parsed = parseCard(JSON.parse(JSON.stringify(card)))!;
  expect(parsed).toEqual({ card, dropped: 0 });
  expect(summarize(parsed.card, rules)).toEqual(summarize(card, rules));
});

test.each([null, [], {}, 'card', 1, { version: 1, events: [] }, { version: 2 }, { version: 2, events: {} }])('non-card %# returns null', (input) => expect(parseCard(input)).toBeNull());

test.each([
  null, [], {}, ...[{ kind: 'unknown' }, { count: -1 }, { count: 0 }, { count: 1.5 }, { count: NaN }, { count: Infinity }, { count: '1' }, { at: NaN }, { at: Infinity }, { at: '100' }, { at: 1e100 }, { at: -1 }, { at: 1.5 }, { nonceId: '' }, { nonceId: null }, { proof: null }, { proof: '!' }, { proof: 'a'.repeat(100000) }, { proof: '' }].map((override) => ({ ...first, ...override })),
  ...[{ via: 'qr' }, { spends: [] }, { spends: null }, { spends: [null] }, { spends: [{ nonceId: '', stamps: 1 }] }, { spends: [{ nonceId: 'x', stamps: 0 }] }, { spends: [{ nonceId: 'x', stamps: Infinity }] }, { spends: [{ nonceId: 'x', stamps: 1.5 }] }, { trigger: '' }, { trigger: null }].map((override) => ({ ...redeem, ...override })),
])('drops malformed event %# while preserving valid events', (bad) => {
  expect(parseCard({ version: 2, events: [bad, first, redeem] })).toEqual({ card: { version: 2, events: [first, redeem] }, dropped: 1 });
});

test('duplicate nonce ids keep the first valid event and report dropped count', () => {
  expect(parseCard({ version: 2, events: [null, first, { ...first, count: 2 }, { ...redeem, nonceId: first.nonceId }, redeem] })).toEqual({ card: { version: 2, events: [first, redeem] }, dropped: 3 });
});

test('parses a large damaged ledger without losing surviving stamps', () => {
  const events = Array.from({ length: 10000 }, (_, i) => ({ ...first, nonceId: `stamp-${i}` }));
  const parsed = parseCard({ version: 2, events: [...events, ...Array(10000).fill(null)] })!;
  expect(parsed.dropped).toBe(10000);
  expect(parsed.card.events).toHaveLength(10000);
  expect(summarize(parsed.card, rules).totalStamps).toBe(90000);
});

test.each([0, 83, 85])('drops stamp proofs of %i bytes', (size) => {
  expect(parseCard({ version: 2, events: [{ ...first, proof: toBase64Url(new Uint8Array(size)) }, redeem] })).toEqual({ card: { version: 2, events: [redeem] }, dropped: 1 });
});
