import { fromBase64Url } from './bytes';
import { isEpochMs } from './time';
import { TOKEN_LENGTH } from './token';

/**
 * The customer's card is an append-only ledger of events. Everything shown on
 * screen (progress, rewards) is derived from it, so there is one source of
 * truth and replay protection falls out of the same data.
 *
 * Each stamp keeps the signed token it came from (its proof). Redeeming a
 * reward presents proofs to the counter phone, which verifies them and keeps
 * its own record of spent stamps; see redemption.ts. The balance shown here is
 * the customer's view; the counter's registry is the authority.
 */

export interface StampEvent {
  readonly kind: 'stamp';
  readonly count: number;
  /** Epoch ms on the customer's device when applied. */
  readonly at: number;
  readonly nonceId: string;
  /** base64url of the signed 84-byte stamp token. */
  readonly proof: string;
}

/** Stamps taken from one proof by a redemption. */
export interface Spend {
  readonly nonceId: string;
  readonly stamps: number;
}

export type RedeemVia = 'nfc' | 'code';

export interface RedeemEvent {
  readonly kind: 'redeem';
  readonly at: number;
  /** The redemption request id (see redemption.ts). */
  readonly nonceId: string;
  readonly spends: readonly Spend[];
  /** Tapped on the counter phone, or shown as a code for the counter to scan. */
  readonly via: RedeemVia;
  /** NFC: nonce id of the counter's request token that prompted it. */
  readonly trigger?: string;
}

export type CardEvent = StampEvent | RedeemEvent;

export interface Card {
  readonly version: 2;
  readonly events: readonly CardEvent[];
}

export interface Rules {
  /** Stamps needed to earn one reward. */
  readonly stampsPerReward: number;
  /** Upper bound on stamps a single token may grant; anything above is rejected. */
  readonly maxStampsPerTap: number;
}

export interface CardSummary {
  /** Lifetime stamps collected. */
  readonly totalStamps: number;
  /** Stamps not yet spent on a reward. */
  readonly unspentStamps: number;
  /** Stamps towards the next reward, 0 ≤ progress < stampsPerReward. */
  readonly progress: number;
  readonly rewardsRedeemed: number;
  readonly rewardsAvailable: number;
  readonly lastActivityAt: number | null;
}

export const emptyCard: Card = { version: 2, events: [] };

export function summarize(card: Card, rules: Rules): CardSummary {
  const totalStamps = card.events.reduce((n, e) => (e.kind === 'stamp' ? n + e.count : n), 0);
  const spent = card.events.reduce((n, e) => (e.kind === 'redeem' ? n + e.spends.reduce((m, s) => m + s.stamps, 0) : n), 0);
  const unspentStamps = Math.max(0, totalStamps - spent);
  const last = card.events.reduce<number | null>((max, e) => (max === null || e.at > max ? e.at : max), null);
  return {
    totalStamps,
    unspentStamps,
    progress: unspentStamps % rules.stampsPerReward,
    rewardsRedeemed: card.events.filter((e) => e.kind === 'redeem').length,
    rewardsAvailable: Math.floor(unspentStamps / rules.stampsPerReward),
    lastActivityAt: last,
  };
}

const matches = (e: CardEvent, nonceId: string): boolean => e.nonceId === nonceId || (e.kind === 'redeem' && e.trigger === nonceId);

/** True if a token with this nonce (a stamp, or a counter's redemption request) was already handled. */
export const hasNonce = (card: Card, nonceId: string): boolean => card.events.some((e) => matches(e, nonceId));

export const findEvent = (card: Card, nonceId: string): CardEvent | undefined => card.events.find((e) => matches(e, nonceId));

export const appendEvent = (card: Card, event: CardEvent): Card => ({ ...card, events: [...card.events, event] });

/** Stamp events that still have unspent stamps, oldest first, with what is left on each. */
export function unspentProofs(card: Card): readonly { readonly event: StampEvent; readonly remaining: number }[] {
  const spentBy = new Map<string, number>();
  for (const e of card.events) {
    if (e.kind === 'redeem') for (const s of e.spends) spentBy.set(s.nonceId, (spentBy.get(s.nonceId) ?? 0) + s.stamps);
  }
  return card.events.flatMap((e) => {
    if (e.kind !== 'stamp') return [];
    const remaining = e.count - (spentBy.get(e.nonceId) ?? 0);
    return remaining > 0 ? [{ event: e, remaining }] : [];
  });
}

export interface ParsedCard {
  readonly card: Card;
  /** Events that failed validation and were left out. Non-zero means the stored data was damaged. */
  readonly dropped: number;
}

/**
 * Validates an unknown value (e.g. parsed from storage) as a Card. Damaged
 * events are dropped rather than discarding the whole card: losing a customer's
 * stamps is worse than a slightly wrong local balance, which the counter's
 * registry corrects at redemption. Returns null when the value isn't a card.
 */
export function parseCard(value: unknown): ParsedCard | null {
  if (!isRecord(value) || value.version !== 2 || !Array.isArray(value.events)) return null;
  const events = value.events.map(parseEvent).filter((e): e is CardEvent => e !== null);
  const seen = new Set<string>();
  const unique = events.filter((e) => (seen.has(e.nonceId) ? false : (seen.add(e.nonceId), true)));
  return { card: { version: 2, events: unique }, dropped: value.events.length - unique.length };
}

function parseEvent(value: unknown): CardEvent | null {
  if (!isRecord(value)) return null;
  const { kind, at, nonceId } = value;
  if (!isEpochMs(at)) return null;
  if (typeof nonceId !== 'string' || nonceId.length === 0) return null;

  if (kind === 'stamp') {
    const { count, proof } = value;
    if (!isPositiveInt(count) || typeof proof !== 'string' || fromBase64Url(proof)?.length !== TOKEN_LENGTH) return null;
    return { kind, count, at, nonceId, proof };
  }

  if (kind === 'redeem') {
    const { spends, via, trigger } = value;
    if (via !== 'nfc' && via !== 'code') return null;
    if (!Array.isArray(spends) || spends.length === 0) return null;
    if (trigger !== undefined && (typeof trigger !== 'string' || trigger.length === 0)) return null;
    const parsed = spends.map(parseSpend);
    if (!parsed.every((s): s is Spend => s !== null)) return null;
    return { kind, at, nonceId, spends: parsed, via, ...(trigger ? { trigger } : {}) };
  }

  return null;
}

function parseSpend(value: unknown): Spend | null {
  if (!isRecord(value)) return null;
  const { nonceId, stamps } = value;
  return typeof nonceId === 'string' && nonceId.length > 0 && isPositiveInt(stamps) ? { nonceId, stamps } : null;
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isPositiveInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v > 0;
