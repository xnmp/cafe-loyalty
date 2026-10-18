import type { Ack, AckStatus } from './link';
import { appendEvent, hasNonce, summarize, type Card, type CardSummary, type Rules } from './card';
import { err, ok, type Result } from './result';
import { nonceId, verifyToken, type KeyRing, type TokenVerifyError } from './token';

/** Tokens older than this are rejected. Generous enough for slow phones and clock drift. */
export const MAX_TOKEN_AGE_S = 15 * 60;
/** Tolerated clock skew for tokens that appear to come from the future. */
export const MAX_CLOCK_SKEW_S = 15 * 60;

export interface IntakeContext {
  readonly cafeId: string;
  readonly keys: KeyRing;
  readonly rules: Rules;
  /** Epoch ms. */
  readonly now: number;
}

export type IntakeError =
  | TokenVerifyError
  | 'expired'
  | 'not-yet-valid'
  | 'already-used'
  | 'no-reward'
  | 'too-many-stamps';

export type IntakeOutcome =
  | { readonly kind: 'stamped'; readonly added: number; readonly before: CardSummary; readonly after: CardSummary }
  | { readonly kind: 'redeemed'; readonly redeemed: number; readonly before: CardSummary; readonly after: CardSummary };

export interface IntakeSuccess {
  readonly card: Card;
  readonly outcome: IntakeOutcome;
  readonly nonceId: string;
}

/** The single entry point for every transport (NFC, QR, deep link). Pure. */
export function applyToken(card: Card, token: Uint8Array, ctx: IntakeContext): Result<IntakeSuccess, IntakeError> {
  const verified = verifyToken(token, ctx.keys, ctx.cafeId);
  if (!verified.ok) return verified;
  const claims = verified.value;
  const id = nonceId(claims.nonce);

  const nowS = Math.floor(ctx.now / 1000);
  if (claims.issuedAt > nowS + MAX_CLOCK_SKEW_S) return err('not-yet-valid');
  if (nowS - claims.issuedAt > MAX_TOKEN_AGE_S) return err('expired');
  if (hasNonce(card, id)) return err('already-used');

  const before = summarize(card, ctx.rules);

  if (claims.kind === 'stamp') {
    if (claims.count > ctx.rules.maxStampsPerTap) return err('too-many-stamps');
    const next = appendEvent(card, { kind: 'stamp', count: claims.count, at: ctx.now, nonceId: id });
    return ok({
      card: next,
      nonceId: id,
      outcome: { kind: 'stamped', added: claims.count, before, after: summarize(next, ctx.rules) },
    });
  }

  if (before.rewardsAvailable < claims.count) return err('no-reward');
  const next = appendEvent(card, { kind: 'redeem', count: claims.count, at: ctx.now, nonceId: id });
  return ok({
    card: next,
    nonceId: id,
    outcome: { kind: 'redeemed', redeemed: claims.count, before, after: summarize(next, ctx.rules) },
  });
}

/** Number of reward thresholds crossed by a stamp outcome (usually 0 or 1). */
export const rewardsUnlocked = (outcome: IntakeOutcome): number =>
  outcome.kind === 'stamped' ? outcome.after.rewardsEarned - outcome.before.rewardsEarned : 0;

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

/** The ack the customer app writes back to the counter device after an intake attempt. */
export function ackFor(
  result: Result<IntakeSuccess, IntakeError>,
  tokenNonceId: string,
  card: Card,
  rules: Rules,
): Ack {
  if (result.ok) {
    const { after } = result.value.outcome;
    return {
      nonceId: result.value.nonceId,
      status: result.value.outcome.kind,
      progress: after.progress,
      rewardsAvailable: after.rewardsAvailable,
    };
  }
  const summary = summarize(card, rules);
  return {
    nonceId: tokenNonceId,
    status: ACK_FOR_ERROR[result.error],
    progress: summary.progress,
    rewardsAvailable: summary.rewardsAvailable,
  };
}
