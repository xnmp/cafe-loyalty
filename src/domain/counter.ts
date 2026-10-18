import type { Ack } from './link';
import { buildTokenLink } from './link';
import { encodeUriMessage } from './ndef';
import { nonceId, signToken, type TokenKind } from './token';

/**
 * Counter-device side: issuing one-time tokens and keeping a short local log
 * so staff can see today's activity. The log is informational only; the
 * authority on which stamps have been spent is the redemption registry.
 */

export type DeliveryStatus =
  /** Token is being offered (NFC armed and/or QR visible). */
  | 'offered'
  /** A phone read the whole NDEF message over NFC. */
  | 'read'
  /** The customer app wrote an ack back. */
  | 'acked'
  /** Staff cancelled, or it timed out, before any phone read it. */
  | 'withdrawn';

export interface IssuedToken {
  readonly nonceId: string;
  readonly kind: TokenKind;
  readonly count: number;
  /** Epoch ms. */
  readonly issuedAt: number;
  readonly status: DeliveryStatus;
  /** True if the token was shown as a QR code (delivery can't be observed). */
  readonly shownAsQr: boolean;
  readonly ack: Ack | null;
}

/** A redemption the counter verified (summary for the activity log). */
export interface RedemptionRecord {
  readonly requestId: string;
  /** Epoch ms. */
  readonly at: number;
}

export interface CounterLog {
  readonly version: 2;
  readonly issued: readonly IssuedToken[];
  readonly redemptions: readonly RedemptionRecord[];
}

export const emptyCounterLog: CounterLog = { version: 2, issued: [], redemptions: [] };

export const LOG_RETENTION_MS = 35 * 24 * 60 * 60 * 1000;

export interface IssueParams {
  readonly kind: TokenKind;
  readonly count: number;
  readonly now: number;
  readonly nonce: Uint8Array;
  readonly keyId: number;
  readonly secretKey: Uint8Array;
  readonly cafeId: string;
  readonly scheme: string;
}

export interface Offer {
  readonly token: Uint8Array;
  readonly link: string;
  /** NDEF message bytes for the HCE emulator. */
  readonly ndef: Uint8Array;
  readonly record: IssuedToken;
}

export function createOffer(p: IssueParams): Offer {
  const token = signToken(
    { kind: p.kind, keyId: p.keyId, count: p.count, issuedAt: Math.floor(p.now / 1000), nonce: p.nonce },
    p.secretKey,
    p.cafeId,
  );
  const link = buildTokenLink(p.scheme, token);
  return {
    token,
    link,
    ndef: encodeUriMessage(link),
    record: {
      nonceId: nonceId(p.nonce),
      kind: p.kind,
      count: p.count,
      issuedAt: p.now,
      status: 'offered',
      shownAsQr: false,
      ack: null,
    },
  };
}

const prune = (log: CounterLog, now: number): CounterLog => ({
  ...log,
  issued: log.issued.filter((t) => now - t.issuedAt <= LOG_RETENTION_MS),
  redemptions: log.redemptions.filter((r) => now - r.at <= LOG_RETENTION_MS),
});

/** Adds a newly offered token and drops entries past retention. */
export function logOffer(log: CounterLog, record: IssuedToken, now: number): CounterLog {
  const kept = prune(log, now);
  return { ...kept, issued: [...kept.issued, record] };
}

/** Adds a verified redemption (once per request id) and drops entries past retention. */
export function logRedemption(log: CounterLog, record: RedemptionRecord, now: number): CounterLog {
  const kept = prune(log, now);
  return kept.redemptions.some((r) => r.requestId === record.requestId) ? kept : { ...kept, redemptions: [...kept.redemptions, record] };
}

const updateEntry = (log: CounterLog, id: string, f: (t: IssuedToken) => IssuedToken): CounterLog => ({
  ...log,
  issued: log.issued.map((t) => (t.nonceId === id ? f(t) : t)),
});

export const markShownAsQr = (log: CounterLog, id: string): CounterLog =>
  updateEntry(log, id, (t) => ({ ...t, shownAsQr: true }));

export const markRead = (log: CounterLog, id: string): CounterLog =>
  updateEntry(log, id, (t) => (t.status === 'offered' || t.status === 'withdrawn' ? { ...t, status: 'read' } : t));

/** Marks an offer withdrawn unless a phone already took it. */
export const markWithdrawn = (log: CounterLog, id: string): CounterLog =>
  updateEntry(log, id, (t) => (t.status === 'offered' ? { ...t, status: 'withdrawn' } : t));

const isSuccess = (ack: Ack | null): boolean => ack?.status === 'stamped';

/**
 * Records an ack. A success is never overwritten by a later failure for the
 * same nonce (a second tap of the same phone reports 'already-used').
 */
export const recordAck = (log: CounterLog, ack: Ack): CounterLog =>
  updateEntry(log, ack.nonceId, (t) => (isSuccess(t.ack) ? t : { ...t, status: 'acked', ack }));

export interface CounterStats {
  readonly stamps: number;
  readonly rewards: number;
}

/**
 * Activity in [from, to). Stamps count tokens that left the device (read over
 * NFC, acked, or shown as QR) and were not explicitly rejected by the customer
 * app. Rewards count verified redemptions only.
 */
export function statsBetween(log: CounterLog, from: number, to: number): CounterStats {
  const inRange = (at: number) => at >= from && at < to;
  const delivered = log.issued.filter(
    (t) =>
      t.kind === 'stamp' &&
      inRange(t.issuedAt) &&
      (t.status === 'read' || t.status === 'acked' || t.shownAsQr) &&
      (t.ack === null || isSuccess(t.ack)),
  );
  return {
    stamps: delivered.reduce((n, t) => n + t.count, 0),
    rewards: log.redemptions.filter((r) => inRange(r.at)).length,
  };
}

const DELIVERY_STATUSES: readonly DeliveryStatus[] = ['offered', 'read', 'acked', 'withdrawn'];
const ACK_STATUSES: readonly Ack['status'][] = ['stamped', 'already-used', 'expired', 'no-reward', 'invalid'];

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isCount = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 1 && (v as number) <= 255;
const isNonNegativeInt = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 0;

function isAck(v: unknown): v is Ack {
  return (
    isObject(v) &&
    typeof v.nonceId === 'string' &&
    ACK_STATUSES.includes(v.status as Ack['status']) &&
    isNonNegativeInt(v.progress) &&
    isNonNegativeInt(v.rewardsAvailable)
  );
}

function isIssuedToken(v: unknown): v is IssuedToken {
  return (
    isObject(v) &&
    typeof v.nonceId === 'string' &&
    v.nonceId.length > 0 &&
    (v.kind === 'stamp' || v.kind === 'redeem') &&
    isCount(v.count) &&
    typeof v.issuedAt === 'number' &&
    Number.isFinite(v.issuedAt) &&
    DELIVERY_STATUSES.includes(v.status as DeliveryStatus) &&
    typeof v.shownAsQr === 'boolean' &&
    (v.ack === null || isAck(v.ack))
  );
}

const isRedemptionRecord = (v: unknown): v is RedemptionRecord =>
  isObject(v) && typeof v.requestId === 'string' && v.requestId.length > 0 && typeof v.at === 'number' && Number.isFinite(v.at);

/**
 * Validates an unknown value (e.g. parsed from storage) as a CounterLog.
 * Malformed entries are dropped (the log is informational). Returns null when
 * the value isn't a log at all.
 */
export function parseCounterLog(value: unknown): CounterLog | null {
  if (!isObject(value) || value.version !== 2 || !Array.isArray(value.issued) || !Array.isArray(value.redemptions)) return null;
  return { version: 2, issued: value.issued.filter(isIssuedToken), redemptions: value.redemptions.filter(isRedemptionRecord) };
}
