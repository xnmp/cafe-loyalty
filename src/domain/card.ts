/**
 * The customer's card is an append-only ledger of events. Everything shown on
 * screen (progress, rewards) is derived from it, so there is one source of
 * truth and replay protection falls out of the same data.
 */

export interface StampEvent {
  readonly kind: 'stamp';
  readonly count: number;
  /** Epoch ms on the customer's device when applied. */
  readonly at: number;
  readonly nonceId: string;
}

export interface RedeemEvent {
  readonly kind: 'redeem';
  readonly count: number;
  readonly at: number;
  readonly nonceId: string;
}

export type CardEvent = StampEvent | RedeemEvent;

export interface Card {
  readonly version: 1;
  readonly events: readonly CardEvent[];
}

export interface Rules {
  /** Stamps needed to earn one reward. */
  readonly stampsPerReward: number;
  /** Upper bound on stamps a single token may grant; anything above is rejected. */
  readonly maxStampsPerTap: number;
}

export interface CardSummary {
  readonly totalStamps: number;
  /** Stamps towards the next reward, 0 ≤ progress < stampsPerReward. */
  readonly progress: number;
  readonly rewardsEarned: number;
  readonly rewardsRedeemed: number;
  readonly rewardsAvailable: number;
  readonly lastActivityAt: number | null;
}

export const emptyCard: Card = { version: 1, events: [] };

export function summarize(card: Card, rules: Rules): CardSummary {
  const totalStamps = sumCounts(card.events, 'stamp');
  const rewardsRedeemed = sumCounts(card.events, 'redeem');
  const rewardsEarned = Math.floor(totalStamps / rules.stampsPerReward);
  const last = card.events.reduce<number | null>((max, e) => (max === null || e.at > max ? e.at : max), null);
  return {
    totalStamps,
    progress: totalStamps % rules.stampsPerReward,
    rewardsEarned,
    rewardsRedeemed,
    rewardsAvailable: Math.max(0, rewardsEarned - rewardsRedeemed),
    lastActivityAt: last,
  };
}

export const hasNonce = (card: Card, nonceId: string): boolean => card.events.some((e) => e.nonceId === nonceId);

export const appendEvent = (card: Card, event: CardEvent): Card => ({ ...card, events: [...card.events, event] });

function sumCounts(events: readonly CardEvent[], kind: CardEvent['kind']): number {
  return events.reduce((n, e) => (e.kind === kind ? n + e.count : n), 0);
}

/** Validates an unknown value (e.g. parsed from storage) as a Card. Returns null when it isn't one. */
export function parseCard(value: unknown): Card | null {
  if (!isRecord(value) || value.version !== 1 || !Array.isArray(value.events)) return null;
  const events = value.events.map(parseEvent);
  return events.every((e): e is CardEvent => e !== null) ? { version: 1, events } : null;
}

function parseEvent(value: unknown): CardEvent | null {
  if (!isRecord(value)) return null;
  const { kind, count, at, nonceId } = value;
  if (kind !== 'stamp' && kind !== 'redeem') return null;
  if (!isPositiveInt(count) || typeof at !== 'number' || !Number.isFinite(at)) return null;
  if (typeof nonceId !== 'string' || nonceId.length === 0) return null;
  return { kind, count, at, nonceId };
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isPositiveInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v > 0;
