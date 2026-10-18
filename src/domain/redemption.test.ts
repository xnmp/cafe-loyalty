import { expect, test } from '@jest/globals';

import { cardOf, ctx, now, rules, stamp, token, value } from '../testing/protocol.test-utils';
import { appendEvent, emptyCard, summarize, type Card, type RedeemEvent } from './card';
import { MAX_CLOCK_SKEW_S } from './freshness';
import { commitRedemption } from './intake';
import { buildRedeemLink, parseLink } from './link';
import { MAX_PROOFS, planRedemption, proofNonceIds, requestForEvent, requestIdFor, verifyRedemption, type RegistryView } from './redemption';

const unused: RegistryView = { prior: null, spent: new Map() };
const plan = (card: Card, customRules = rules) => {
  const result = planRedemption(card, customRules);
  if (!result) throw new Error('Expected plan');
  return result;
};
const spentEvent = (nonceId: string, stamps: number): RedeemEvent => ({ kind: 'redeem', nonceId: 'previous-request', at: now - 1, via: 'code', spends: [{ nonceId, stamps }] });

test('plans oldest ledger stamps first, partially using the final multi-stamp proof', () => {
  const card = cardOf(4, 10, 2);
  const result = plan(card);
  expect(result.spends).toEqual([{ nonceId: card.events[0].nonceId, stamps: 4 }, { nonceId: card.events[1].nonceId, stamps: 5 }]);
  expect(result.request.proofs).toEqual([token(1, 4), token(2, 10)]);
  expect(card.events).toHaveLength(3);
});

test('exact reward boundary and insufficient stamps', () => {
  expect(plan(cardOf(9)).spends).toEqual([{ nonceId: stamp(1, 9).nonceId, stamps: 9 }]);
  expect(planRedemption(cardOf(8), rules)).toBeNull();
  expect(planRedemption(emptyCard, rules)).toBeNull();
});

test('skips exhausted stamps and honours partial local spends', () => {
  const card = cardOf(4, 10, 3);
  const changed = appendEvent(appendEvent(card, spentEvent(card.events[0].nonceId, 4)), { ...spentEvent(card.events[1].nonceId, 3), nonceId: 'previous-2' });
  expect(plan(changed).spends).toEqual([{ nonceId: card.events[1].nonceId, stamps: 7 }, { nonceId: card.events[2].nonceId, stamps: 2 }]);
});

test('request ids are deterministic across serialization and sensitive to nonce, offset, amount, and order', () => {
  const card = cardOf(4, 10);
  const slices = [{ nonceId: card.events[0].nonceId, from: 0, stamps: 4 }, { nonceId: card.events[1].nonceId, from: 0, stamps: 5 }];
  const id = requestIdFor(slices);
  expect(plan(card).request.requestId).toBe(id);
  expect(plan(JSON.parse(JSON.stringify(card)) as Card).request.requestId).toBe(id);
  const changed = [
    [{ ...slices[0], stamps: 3 }, slices[1]],
    [{ ...slices[0], from: 1 }, slices[1]],
    [{ ...slices[0], nonceId: stamp(3, 4).nonceId }, slices[1]],
    [...slices].reverse(),
  ];
  for (const c of changed) expect(requestIdFor(c)).not.toBe(id);
});

test('requestForEvent rebuilds the same code, or returns null for missing/corrupt proofs', () => {
  const card = cardOf(4, 10);
  const planned = plan(card);
  const committed = value(commitRedemption(card, planned, rules, { now, via: 'code' }));
  const request = requestForEvent(committed.card, committed.event)!;
  expect(request).toEqual(planned.request);
  expect(parseLink('testcafe', buildRedeemLink('testcafe', request))).toEqual({ kind: 'redeem', request: planned.request });
  expect(requestForEvent(emptyCard, committed.event)).toBeNull();
  expect(requestForEvent({ version: 2, events: [{ ...stamp(1, 4), proof: '!' }, stamp(2, 10)] }, committed.event)).toBeNull();
});

test('verifies genuine stamps and returns counter time and exact spends', () => {
  const result = plan(cardOf(4, 10));
  expect(verifyRedemption(result.request, unused, ctx)).toEqual({ ok: true, value: { requestId: result.request.requestId, at: now, spends: result.spends } });
  expect(proofNonceIds(result.request)).toEqual(result.spends.map((s) => s.nonceId));
});

test('prior request returns already-redeemed with original time', () => {
  expect(verifyRedemption(plan(cardOf(9)).request, { ...unused, prior: { at: 123 } }, ctx)).toEqual({ ok: false, error: { kind: 'already-redeemed', at: 123 } });
});

const forged = token(1, 9).slice();
forged[83] ^= 1;
test.each([
  ['forged signature', [forged]], ['forged surplus proof', [token(2, 9), forged]], ['wrong cafe', [token(1, 9, {}, 'another-cafe')]], ['unknown key', [token(1, 9, { keyId: 2 })]],
  ['redeem proof', [token(1, 9, { kind: 'redeem' })]], ['above max stamps', [token(1, 11)]],
  ['future proof', [token(1, 9, { issuedAt: Math.floor(now / 1000) + MAX_CLOCK_SKEW_S + 1 })]],
  ['duplicate proof', [token(1, 5), token(1, 5)]], ['no proofs', []], ['malformed proof', [new Uint8Array(83)]],
  ['too many proofs', Array.from({ length: MAX_PROOFS + 1 }, (_, i) => token(i + 1, 9))], ['huge proof', [new Uint8Array(100000)]],
] as const)('rejects %s', (_name, proofs) => {
  expect(verifyRedemption({ requestId: plan(cardOf(9)).request.requestId, proofs }, unused, ctx)).toEqual({ ok: false, error: { kind: 'invalid' } });
});

test('proofs need no expiry and accept the exact future-skew boundary', () => {
  for (const issuedAt of [1, Math.floor(now / 1000) + MAX_CLOCK_SKEW_S]) {
    expect(verifyRedemption({ requestId: stamp(90, 1).nonceId, proofs: [token(1, 9, { issuedAt })] }, unused, ctx).ok).toBe(true);
  }
});

test('distinguishes genuine insufficient stamps from registry-spent stamps', () => {
  const request = plan(cardOf(9)).request;
  expect(verifyRedemption(request, { ...unused, spent: new Map([[stamp(1, 9).nonceId, 1]]) }, ctx)).toEqual({ ok: false, error: { kind: 'stamps-used' } });
  expect(verifyRedemption({ ...request, proofs: [token(1, 8)] }, unused, ctx)).toEqual({ ok: false, error: { kind: 'not-enough' } });
});

test('honours partial remaining stamps and skips fully spent proofs in registry', () => {
  const request = { requestId: requestIdFor([{ nonceId: stamp(2, 10).nonceId, from: 3, stamps: 7 }, { nonceId: stamp(3, 2).nonceId, from: 0, stamps: 2 }]), proofs: [token(1, 9), token(2, 10), token(3, 2)] };
  const registry = { ...unused, spent: new Map([[stamp(1, 9).nonceId, 9], [stamp(2, 10).nonceId, 3]]) };
  expect(value(verifyRedemption(request, registry, ctx)).spends).toEqual([{ nonceId: stamp(2, 10).nonceId, stamps: 7 }, { nonceId: stamp(3, 2).nonceId, stamps: 2 }]);
});

test('a copied proof already spent by someone else cannot redeem again', () => {
  const result = plan(cardOf(4, 5));
  expect(verifyRedemption(result.request, { ...unused, spent: new Map([[stamp(1, 4).nonceId, 4]]) }, ctx)).toEqual({ ok: false, error: { kind: 'stamps-used' } });
});

test.each(Array.from({ length: 16 }, (_, i) => i))('customer and counter choose identical spends when ledgers agree (case %i)', (i) => {
  const counts = Array.from({ length: 5 }, (_, j) => 1 + ((i * 7 + j * 3) % 10));
  const card = cardOf(...counts);
  const spent = new Map([[card.events[0].nonceId, counts[0]], [card.events[1].nonceId, Math.floor(counts[1] / 2)]]);
  const ledger = appendEvent(card, { ...spentEvent('unused', 1), spends: [...spent].map(([nonceId, stamps]) => ({ nonceId, stamps })).filter((s) => s.stamps > 0) });
  const planned = planRedemption(ledger, rules);
  if (!planned) { expect(summarize(ledger, rules).unspentStamps).toBeLessThan(9); return; }
  expect(value(verifyRedemption(planned.request, { prior: null, spent }, ctx)).spends).toEqual(planned.spends);
});

test('two rewards taken from one large stamp get different request ids and both commit', () => {
  const custom = { stampsPerReward: 2, maxStampsPerTap: 4 };
  const card = cardOf(4);
  const firstPlan = plan(card, custom);
  const first = value(commitRedemption(card, firstPlan, custom, { now, via: 'code' }));
  expect(summarize(first.card, custom).rewardsAvailable).toBe(1);
  const secondPlan = plan(first.card, custom);
  expect(secondPlan.request.requestId).not.toBe(firstPlan.request.requestId);
  const second = value(commitRedemption(first.card, secondPlan, custom, { now: now + 1, via: 'code' }));
  expect(summarize(second.card, custom).rewardsAvailable).toBe(0);
  // The counter accepts both: the second is not mistaken for a re-shown first.
  const counter = { ...ctx, rules: custom };
  const firstSpend = value(verifyRedemption(firstPlan.request, unused, counter));
  const afterFirst = { prior: null, spent: new Map(firstSpend.spends.map((s) => [s.nonceId, s.stamps])) };
  expect(value(verifyRedemption(secondPlan.request, afterFirst, counter)).spends).toEqual(secondPlan.spends);
});

// When the card holds a stamp spent elsewhere (copied card, stale backup), the
// registry decides: genuinely unspent stamps in the request still pay.
test('a copied spent proof is skipped when later proofs hold enough unspent stamps', () => {
  const planned = plan(cardOf(4, 10));
  const registry = { ...unused, spent: new Map([[stamp(1, 4).nonceId, 4]]) };
  expect(value(verifyRedemption(planned.request, registry, ctx)).spends).toEqual([{ nonceId: stamp(2, 10).nonceId, stamps: 9 }]);
});

