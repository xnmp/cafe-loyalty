import nacl from 'tweetnacl';

import { fromBase64Url, toBase64Url, utf8Encode } from './bytes';
import { unspentProofs, type Card, type RedeemEvent, type Rules, type Spend } from './card';
import { MAX_CLOCK_SKEW_S } from './freshness';
import { err, ok, type Result } from './result';
import { CLAIMS_LENGTH, NONCE_LENGTH, TOKEN_LENGTH, nonceId, verifyToken, type KeyRing } from './token';

/**
 * Redeeming a reward, verified by the counter phone.
 *
 * The customer presents the signed stamp tokens (proofs) that make up one
 * reward. The counter phone checks every signature and its own registry of
 * stamps already spent, then records the spend. Copying a stamp to another
 * phone, faking an acknowledgement, or showing an old screen therefore can't
 * produce a verified redemption: only unspent, genuinely issued stamps can.
 *
 * Both sides pick stamps the same way (oldest first, in request order), so
 * when the customer's ledger and the counter's registry agree they record the
 * same spends. When they don't (the card holds stamps spent elsewhere, e.g. a
 * copied card or a stale backup), the counter spends the stamps it knows are
 * unspent: the registry is the authority, and the card only overstates its
 * balance by the stamps that were already used.
 *
 * The request id is derived from the planned spends, which makes a retry
 * after a dropped NFC session idempotent rather than a second spend.
 */

export const REQUEST_ID_LENGTH = 12;
/** A reward never needs more proofs than stamps (each proof is at least one stamp). */
export const MAX_PROOFS = 32;

export interface RedemptionRequest {
  /** base64url, REQUEST_ID_LENGTH bytes. */
  readonly requestId: string;
  /** Signed 84-byte stamp tokens, oldest first. */
  readonly proofs: readonly Uint8Array[];
}

export interface RedemptionPlan {
  readonly request: RedemptionRequest;
  readonly spends: readonly Spend[];
}

const REQUEST_DOMAIN = 'cafe-loyalty/redeem/v1\n';

/** A planned spend, plus how many of its proof's stamps were used before it. */
export interface Slice extends Spend {
  readonly from: number;
}

/** `from` keeps two rewards taken from one large stamp apart. */
export function requestIdFor(slices: readonly Slice[]): string {
  const canonical = slices.map((s) => `${s.nonceId}@${s.from}:${s.stamps}`).join(',');
  return toBase64Url(nacl.hash(utf8Encode(REQUEST_DOMAIN + canonical)).subarray(0, REQUEST_ID_LENGTH));
}

/** Customer side: the stamps to spend on one reward, oldest first. Null if the card doesn't have enough. */
export function planRedemption(card: Card, rules: Rules): RedemptionPlan | null {
  const picked: { readonly slice: Slice; readonly proof: Uint8Array }[] = [];
  let needed = rules.stampsPerReward;
  for (const { event, remaining } of unspentProofs(card)) {
    if (needed === 0) break;
    const proof = fromBase64Url(event.proof);
    if (!proof) continue;
    const stamps = Math.min(remaining, needed);
    picked.push({ slice: { nonceId: event.nonceId, from: event.count - remaining, stamps }, proof });
    needed -= stamps;
  }
  if (needed > 0 || picked.length > MAX_PROOFS) return null;
  const spends = picked.map(({ slice: { nonceId, stamps } }) => ({ nonceId, stamps }));
  return { spends, request: { requestId: requestIdFor(picked.map((p) => p.slice)), proofs: picked.map((p) => p.proof) } };
}

/** Rebuilds the request for a past redemption, so its code can be shown again. */
export function requestForEvent(card: Card, event: RedeemEvent): RedemptionRequest | null {
  const proofs = event.spends.map((s) => {
    const stamp = card.events.find((e) => e.kind === 'stamp' && e.nonceId === s.nonceId);
    return stamp?.kind === 'stamp' ? fromBase64Url(stamp.proof) : null;
  });
  return proofs.every((p): p is Uint8Array => p !== null) ? { requestId: event.nonceId, proofs } : null;
}

// ---------------------------------------------------------------------------
// Counter side

/** What the counter's registry knows about the stamps in a request. */
export interface RegistryView {
  /** A redemption already recorded under this request id. */
  readonly prior: { readonly at: number } | null;
  /** Stamps already spent, per proof nonce id (only the proofs in the request). */
  readonly spent: ReadonlyMap<string, number>;
}

export interface Redemption {
  readonly requestId: string;
  /** Epoch ms on the counter phone. */
  readonly at: number;
  readonly spends: readonly Spend[];
}

export type RedemptionRejection =
  /** This exact request was accepted before (a re-shown code, or a retry). */
  | { readonly kind: 'already-redeemed'; readonly at: number }
  /** Enough genuine stamps, but some were already spent (e.g. copied to another phone). */
  | { readonly kind: 'stamps-used' }
  /** Genuine stamps, but not enough for a reward. */
  | { readonly kind: 'not-enough' }
  /** Malformed, forged, from an unknown key, or otherwise not a valid request. */
  | { readonly kind: 'invalid' };

export interface VerifyContext {
  readonly cafeId: string;
  readonly keys: KeyRing;
  readonly rules: Rules;
  /** Epoch ms. */
  readonly now: number;
}

/** Proof nonce ids in a request, for looking up the registry before verifying. Null if any proof is malformed. */
export function proofNonceIds(request: RedemptionRequest): readonly string[] | null {
  const ids = request.proofs.map((p) => (p.length === TOKEN_LENGTH ? nonceId(p.subarray(CLAIMS_LENGTH - NONCE_LENGTH, CLAIMS_LENGTH)) : null));
  return ids.every((id): id is string => id !== null) ? ids : null;
}

export function verifyRedemption(
  request: RedemptionRequest,
  registry: RegistryView,
  ctx: VerifyContext,
): Result<Redemption, RedemptionRejection> {
  if (registry.prior) return err({ kind: 'already-redeemed', at: registry.prior.at });
  if (request.proofs.length === 0 || request.proofs.length > MAX_PROOFS) return err({ kind: 'invalid' });

  const nowS = Math.floor(ctx.now / 1000);
  const stamps: { readonly id: string; readonly count: number }[] = [];
  const seen = new Set<string>();
  for (const proof of request.proofs) {
    const verified = verifyToken(proof, ctx.keys, ctx.cafeId);
    if (!verified.ok) return err({ kind: 'invalid' });
    const claims = verified.value;
    if (claims.kind !== 'stamp' || claims.count > ctx.rules.maxStampsPerTap) return err({ kind: 'invalid' });
    if (claims.issuedAt > nowS + MAX_CLOCK_SKEW_S) return err({ kind: 'invalid' });
    const id = nonceId(claims.nonce);
    if (seen.has(id)) return err({ kind: 'invalid' });
    seen.add(id);
    stamps.push({ id, count: claims.count });
  }

  const spends: Spend[] = [];
  let needed = ctx.rules.stampsPerReward;
  for (const { id, count } of stamps) {
    if (needed === 0) break;
    const remaining = count - (registry.spent.get(id) ?? 0);
    if (remaining <= 0) continue;
    const take = Math.min(remaining, needed);
    spends.push({ nonceId: id, stamps: take });
    needed -= take;
  }
  if (needed > 0) {
    const total = stamps.reduce((n, s) => n + s.count, 0);
    return err({ kind: total >= ctx.rules.stampsPerReward ? 'stamps-used' : 'not-enough' });
  }
  return ok({ requestId: request.requestId, at: ctx.now, spends });
}
