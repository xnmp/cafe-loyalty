import { toBase64Url } from './bytes';
import { appendEvent, hasNonce, summarize, unspentProofs, type Card, type CardSummary, type RedeemEvent, type RedeemVia, type Rules } from './card';
import { checkFreshness, type FreshnessError } from './freshness';
import type { Ack, AckStatus } from './link';
import { planRedemption, type RedemptionPlan } from './redemption';
import { err, ok, type Result } from './result';
import { nonceId, verifyToken, type KeyRing, type TokenVerifyError } from './token';

export { MAX_CLOCK_SKEW_S, MAX_TOKEN_AGE_S } from './freshness';

export interface IntakeContext {
  readonly cafeId: string;
  readonly keys: KeyRing;
  readonly rules: Rules;
  /** Epoch ms. */
  readonly now: number;
}

export type IntakeError = TokenVerifyError | FreshnessError | 'already-used' | 'no-reward' | 'too-many-stamps';

export type StampedOutcome = { readonly kind: 'stamped'; readonly added: number; readonly before: CardSummary; readonly after: CardSummary };
export type RedeemedOutcome = { readonly kind: 'redeemed'; readonly via: RedeemVia; readonly before: CardSummary; readonly after: CardSummary };
export type IntakeOutcome = StampedOutcome | RedeemedOutcome;

/** A verified token from the counter phone, and what it means for this card. */
export type TokenIntake =
  | { readonly kind: 'stamp'; readonly card: Card; readonly outcome: StampedOutcome; readonly nonceId: string }
  /**
   * The counter phone is asking for a reward. Nothing changes until the
   * customer hands over `plan.request` (NFC write, or a code the counter scans);
   * then commitRedemption records it.
   */
  | { readonly kind: 'redeem-request'; readonly nonceId: string; readonly plan: RedemptionPlan };

/** The single entry point for tokens from every transport (NFC, QR, deep link). Pure. */
export function applyToken(card: Card, token: Uint8Array, ctx: IntakeContext): Result<TokenIntake, IntakeError> {
  const verified = verifyToken(token, ctx.keys, ctx.cafeId);
  if (!verified.ok) return verified;
  const claims = verified.value;
  const id = nonceId(claims.nonce);

  const stale = checkFreshness(claims.issuedAt, ctx.now);
  if (stale) return err(stale);
  if (hasNonce(card, id)) return err('already-used');

  if (claims.kind === 'stamp') {
    if (claims.count > ctx.rules.maxStampsPerTap) return err('too-many-stamps');
    const before = summarize(card, ctx.rules);
    const next = appendEvent(card, { kind: 'stamp', count: claims.count, at: ctx.now, nonceId: id, proof: toBase64Url(token) });
    return ok({ kind: 'stamp', card: next, nonceId: id, outcome: { kind: 'stamped', added: claims.count, before, after: summarize(next, ctx.rules) } });
  }

  const plan = planRedemption(card, ctx.rules);
  return plan ? ok({ kind: 'redeem-request', nonceId: id, plan }) : err('no-reward');
}

export interface CommitOptions {
  readonly now: number;
  readonly via: RedeemVia;
  /** NFC: nonce id of the counter's request token, so reading it again is recognised as a repeat. */
  readonly trigger?: string;
}

/**
 * Records a redemption once its request has been handed to the counter phone.
 * Re-checks the card, since it may have changed while the request was in
 * flight: 'already-used' if this redemption (or its request token) is already
 * recorded, 'no-reward' if the planned stamps are no longer unspent.
 */
export function commitRedemption(
  card: Card,
  plan: RedemptionPlan,
  rules: Rules,
  opts: CommitOptions,
): Result<{ readonly card: Card; readonly event: RedeemEvent; readonly outcome: RedeemedOutcome }, 'already-used' | 'no-reward'> {
  if (hasNonce(card, plan.request.requestId) || (opts.trigger && hasNonce(card, opts.trigger))) return err('already-used');
  const remaining = new Map(unspentProofs(card).map((p) => [p.event.nonceId, p.remaining]));
  if (!plan.spends.every((s) => (remaining.get(s.nonceId) ?? 0) >= s.stamps)) return err('no-reward');
  const before = summarize(card, rules);
  const event: RedeemEvent = {
    kind: 'redeem',
    at: opts.now,
    nonceId: plan.request.requestId,
    spends: plan.spends,
    via: opts.via,
    ...(opts.trigger ? { trigger: opts.trigger } : {}),
  };
  const next = appendEvent(card, event);
  return ok({ card: next, event, outcome: { kind: 'redeemed', via: opts.via, before, after: summarize(next, rules) } });
}

/** Number of rewards a stamp outcome made available (usually 0 or 1). */
export const rewardsUnlocked = (outcome: IntakeOutcome): number =>
  outcome.kind === 'stamped' ? outcome.after.rewardsAvailable - outcome.before.rewardsAvailable : 0;

const ACK_FOR_ERROR: Readonly<Record<IntakeError, AckStatus>> = {
  malformed: 'invalid',
  'unsupported-version': 'invalid',
  'unknown-key': 'invalid',
  'invalid-signature': 'invalid',
  'too-many-stamps': 'invalid',
  expired: 'expired',
  'not-yet-valid': 'expired',
  'already-used': 'already-used',
  'no-reward': 'no-reward',
};

/**
 * The ack the customer app writes back after a stamp, or after a token it
 * couldn't use. Null for a redemption request: the reply to that is the
 * redemption request itself.
 */
export function ackFor(result: Result<TokenIntake, IntakeError>, tokenNonceId: string, card: Card, rules: Rules): Ack | null {
  if (result.ok) {
    if (result.value.kind !== 'stamp') return null;
    const { after } = result.value.outcome;
    return { nonceId: result.value.nonceId, status: 'stamped', progress: after.progress, rewardsAvailable: after.rewardsAvailable };
  }
  const summary = summarize(card, rules);
  return { nonceId: tokenNonceId, status: ACK_FOR_ERROR[result.error], progress: summary.progress, rewardsAvailable: summary.rewardsAvailable };
}
