import { expect, test } from '@jest/globals';

import { toBase64Url } from './bytes';
import { emptyCard, summarize, type Card } from './card';
import { ackFor, applyToken, commitRedemption, MAX_CLOCK_SKEW_S, MAX_TOKEN_AGE_S, rewardsUnlocked, type IntakeContext, type IntakeError, type TokenIntake } from './intake';
import { planRedemption } from './redemption';
import { stamp } from '../testing/protocol.test-utils';
import { err } from './result';
import { keyPairFromSeed, nonceId, signToken, type TokenClaims } from './token';

const pair = keyPairFromSeed(new Uint8Array(32).fill(3));
const nowS = 1700000000;
const ctx: IntakeContext = { cafeId: 'test-cafe', keys: new Map([[1, pair.publicKey]]), rules: { stampsPerReward: 9, maxStampsPerTap: 10 }, now: nowS * 1000 + 999 };
const claims: TokenClaims = { kind: 'stamp', keyId: 1, count: 1, issuedAt: nowS, nonce: new Uint8Array(12).fill(3) };
const makeToken = (override: Partial<TokenClaims> = {}) => signToken({ ...claims, ...override }, pair.secretKey, ctx.cafeId);
const withStamps = (count: number): Card => ({ version: 2, events: [stamp(99, count, 100)] });
const success = (result: ReturnType<typeof applyToken>): Extract<TokenIntake, {kind: 'stamp'}> => {
  if (!result.ok) throw new Error(`Expected success, received ${result.error}`);
  if (result.value.kind !== 'stamp') throw new Error('Expected stamp');
  return result.value;
};

test('applies stamps with before/after summaries and a replay-tracked nonce', () => {
  const result = success(applyToken(emptyCard, makeToken({ count: 3 }), ctx));
  expect(result.outcome).toEqual({
    kind: 'stamped', added: 3,
    before: { totalStamps: 0, unspentStamps: 0, progress: 0, rewardsRedeemed: 0, rewardsAvailable: 0, lastActivityAt: null },
    after: { totalStamps: 3, unspentStamps: 3, progress: 3, rewardsRedeemed: 0, rewardsAvailable: 0, lastActivityAt: ctx.now },
  });
  expect(result.card.events[0]).toMatchObject({ proof: toBase64Url(makeToken({ count: 3 })) });
  expect(result.nonceId).toBe(nonceId(claims.nonce));
  expect(applyToken(result.card, makeToken({ count: 3 }), ctx)).toEqual({ ok: false, error: 'already-used' });
});

test.each([
  [-MAX_TOKEN_AGE_S, null], [-MAX_TOKEN_AGE_S - 1, 'expired'],
  [MAX_CLOCK_SKEW_S, null], [MAX_CLOCK_SKEW_S + 1, 'not-yet-valid'],
] as const)('freshness offset %i seconds yields %s', (offset, error) => {
  const result = applyToken(emptyCard, makeToken({ issuedAt: nowS + offset }), ctx);
  if (error) expect(result).toEqual({ ok: false, error });
  else expect(result.ok).toBe(true);
});

test('redeem tokens plan one reward without changing the card; commit records it', () => {
  const token = makeToken({ kind: 'redeem' });
  expect(applyToken(emptyCard, token, ctx)).toEqual({ ok: false, error: 'no-reward' });
  const card = withStamps(9);
  const result = applyToken(card, token, ctx);
  expect(result).toMatchObject({ ok: true, value: { kind: 'redeem-request', nonceId: nonceId(claims.nonce), plan: { spends: [{ nonceId: card.events[0].nonceId, stamps: 9 }] } } });
  expect(card.events).toHaveLength(1);
  if (!result.ok || result.value.kind !== 'redeem-request') throw new Error('Expected request');
  expect(ackFor(result, 'ignored', card, ctx.rules)).toBeNull();
  const committed = commitRedemption(card, result.value.plan, ctx.rules, { now: ctx.now, via: 'nfc', trigger: result.value.nonceId });
  if (!committed.ok) throw new Error('Expected commit');
  expect(committed.value.event).toMatchObject({ kind: 'redeem', via: 'nfc', trigger: result.value.nonceId, at: ctx.now });
  expect(committed.value.outcome).toMatchObject({ kind: 'redeemed', via: 'nfc', before: { rewardsAvailable: 1 }, after: { rewardsAvailable: 0, rewardsRedeemed: 1, totalStamps: 9, unspentStamps: 0, progress: 0 } });
  expect(rewardsUnlocked(committed.value.outcome)).toBe(0);
  expect(applyToken(committed.value.card, token, ctx)).toEqual({ ok: false, error: 'already-used' });
  expect(commitRedemption(committed.value.card, result.value.plan, ctx.rules, { now: ctx.now, via: 'code' })).toEqual({ ok: false, error: 'already-used' });
});

test('commit revalidates availability after another redemption spends planned stamps', () => {
  const card = withStamps(9);
  const plan = planRedemption(card, ctx.rules)!;
  const changed: Card = { ...card, events: [...card.events, { kind: 'redeem', nonceId: 'other-request', at: 10, via: 'code', spends: plan.spends }] };
  expect(commitRedemption(changed, plan, ctx.rules, { now: ctx.now, via: 'code' })).toEqual({ ok: false, error: 'no-reward' });
  const triggerUsed: Card = { ...card, events: [...card.events, { kind: 'redeem', nonceId: 'other-request', at: 10, via: 'nfc', trigger: 'trigger', spends: [{ nonceId: 'other-proof', stamps: 9 }] }] };
  expect(commitRedemption(triggerUsed, plan, ctx.rules, { now: ctx.now, via: 'nfc', trigger: 'trigger' })).toEqual({ ok: false, error: 'already-used' });
  expect(commitRedemption(emptyCard, plan, ctx.rules, { now: ctx.now, via: 'code' })).toEqual({ ok: false, error: 'no-reward' });
});

test('accepts exactly maxStampsPerTap and rejects one above it', () => {
  expect(success(applyToken(emptyCard, makeToken({ count: 10 }), ctx)).outcome).toMatchObject({ kind: 'stamped', added: 10 });
  expect(applyToken(emptyCard, makeToken({ count: 11 }), ctx)).toEqual({ ok: false, error: 'too-many-stamps' });
});

test('crossing from 8 stamps by adding 3 unlocks one reward and leaves progress 2', () => {
  const result = success(applyToken(withStamps(8), makeToken({ count: 3 }), ctx));
  expect(result.outcome).toMatchObject({ before: { progress: 8, rewardsAvailable: 0 }, after: { progress: 2, rewardsAvailable: 1 } });
  expect(rewardsUnlocked(result.outcome)).toBe(1);
});

test('rewardsUnlocked counts multiple boundaries and zero for an ordinary stamp', () => {
  expect(rewardsUnlocked(success(applyToken(emptyCard, makeToken(), ctx)).outcome)).toBe(0);
  const generous = { ...ctx, rules: { ...ctx.rules, maxStampsPerTap: 30 } };
  expect(rewardsUnlocked(success(applyToken(withStamps(8), makeToken({ count: 20 }), generous)).outcome)).toBe(3);
});

test('ackFor reports stamp success with the resulting balance and nonce', () => {
  const card = withStamps(10);
  const result = applyToken(card, makeToken(), ctx);
  expect(ackFor(result, 'ignored-on-success', card, ctx.rules)).toEqual({ nonceId: nonceId(claims.nonce), status: 'stamped', progress: 2, rewardsAvailable: 1 });
});

test.each([
  ['malformed', 'invalid'], ['unsupported-version', 'invalid'], ['unknown-key', 'invalid'],
  ['invalid-signature', 'invalid'], ['too-many-stamps', 'invalid'], ['expired', 'expired'],
  ['not-yet-valid', 'expired'], ['already-used', 'already-used'], ['no-reward', 'no-reward'],
] satisfies readonly [IntakeError, string][])('ackFor maps %s to %s and preserves the current balance', (error, status) => {
  expect(ackFor(err(error), 'attempted-nonce', withStamps(20), ctx.rules)).toEqual({ nonceId: 'attempted-nonce', status, progress: 2, rewardsAvailable: 2 });
});

test('tampered tokens never apply and never change the input card', () => {
  const card = withStamps(8);
  const original = JSON.parse(JSON.stringify(card));
  const token = makeToken({ count: 3 });
  for (let offset = 0; offset < token.length; offset++) {
    const tampered = token.slice();
    tampered[offset] ^= 1;
    expect(applyToken(card, tampered, ctx).ok).toBe(false);
  }
  expect(card).toEqual(original);
  expect(summarize(card, ctx.rules).totalStamps).toBe(8);
}, 30000);

test('success and business-rule failures do not mutate frozen input ledgers', () => {
  const card: Card = Object.freeze({ version: 2, events: Object.freeze([Object.freeze(stamp(99, 8, 100))]) });
  const original = JSON.parse(JSON.stringify(card));
  success(applyToken(card, makeToken({ count: 3 }), ctx));
  for (const token of [makeToken({ kind: 'redeem' }), makeToken({ count: 11 }), makeToken({ issuedAt: nowS - MAX_TOKEN_AGE_S - 1 }), makeToken({ issuedAt: nowS + MAX_CLOCK_SKEW_S + 1 })]) {
    expect(applyToken(card, token, ctx).ok).toBe(false);
  }
  expect(card).toEqual(original);
});
