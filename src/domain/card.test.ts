import { expect, test } from '@jest/globals';

import { appendEvent, emptyCard, hasNonce, parseCard, summarize, type Card, type CardEvent } from './card';

const rules = { stampsPerReward: 9, maxStampsPerTap: 10 };
const stamp: CardEvent = { kind: 'stamp', count: 9, at: 100, nonceId: 'stamp' };
const redeem: CardEvent = { kind: 'redeem', count: 1, at: 200, nonceId: 'redeem' };

test.each([
  [0, 0, 0], [8, 8, 0], [9, 0, 1], [10, 1, 1], [18, 0, 2], [27, 0, 3],
])('summarizes %i stamps as progress %i and %i rewards', (count, progress, earned) => {
  const card: Card = { version: 1, events: count === 0 ? [] : [{ ...stamp, count }] };
  expect(summarize(card, rules)).toEqual({
    totalStamps: count, progress, rewardsEarned: earned, rewardsRedeemed: 0,
    rewardsAvailable: earned, lastActivityAt: count === 0 ? null : 100,
  });
});

test('sums interleaved stamps and redemptions and finds latest activity by time', () => {
  const card: Card = { version: 1, events: [stamp, { ...redeem, at: 500 }, { ...stamp, count: 10, at: 300, nonceId: 'later' }] };
  expect(summarize(card, rules)).toEqual({ totalStamps: 19, progress: 1, rewardsEarned: 2, rewardsRedeemed: 1, rewardsAvailable: 1, lastActivityAt: 500 });
});

test('rewardsAvailable never goes below zero even with excess redemptions', () => {
  expect(summarize({ version: 1, events: [stamp, { ...redeem, count: 4 }] }, rules).rewardsAvailable).toBe(0);
  expect(summarize({ version: 1, events: [redeem] }, rules).rewardsAvailable).toBe(0);
});

test('appendEvent returns a new card without mutating the ledger', () => {
  const card: Card = Object.freeze({ version: 1, events: Object.freeze([Object.freeze(stamp)]) });
  const next = appendEvent(card, redeem);
  expect(card).toEqual({ version: 1, events: [stamp] });
  expect(next.events).toEqual([stamp, redeem]);
  expect(hasNonce(card, 'redeem')).toBe(false);
  expect(hasNonce(next, 'redeem')).toBe(true);
  expect(hasNonce(next, 'stamp')).toBe(true);
});

test('parseCard accepts valid persisted ledgers and preserves observable summaries', () => {
  expect(parseCard(emptyCard)).toEqual(emptyCard);
  const card: Card = { version: 1, events: [stamp, redeem] };
  const parsed = parseCard(JSON.parse(JSON.stringify(card)));
  expect(parsed).toEqual(card);
  expect(summarize(parsed!, rules)).toEqual(summarize(card, rules));
});

test.each([null, [], {}, 'card', 1, { version: 2, events: [] }, { version: 1 }, { version: 1, events: {} }, { version: 1, events: [null] }, { version: 1, events: [[]] }])('parseCard rejects junk %#', (value) => {
  expect(parseCard(value)).toBeNull();
});

test.each([
  { kind: 'unknown' }, { count: -1 }, { count: 0 }, { count: 1.5 }, { count: NaN }, { count: Infinity }, { count: '1' },
  { at: NaN }, { at: Infinity }, { at: '100' }, { nonceId: '' }, { nonceId: null },
])('parseCard rejects invalid event %j', (override) => {
  expect(parseCard({ version: 1, events: [{ ...stamp, ...override }] })).toBeNull();
});
