import type { Ack } from './link';
import { buildTokenLink } from './link';
import { encodeUriMessage } from './ndef';
import { nonceId, signToken, type TokenKind } from './token';

/**
 * Counter-device side: issuing one-time tokens and keeping a short local log
 * so staff can see today's activity. The log is informational only.
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

export interface CounterLog {
  readonly version: 1;
  readonly issued: readonly IssuedToken[];
}

export const emptyCounterLog: CounterLog = { version: 1, issued: [] };

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

/** Adds a newly offered token and drops entries past retention. */
export function logOffer(log: CounterLog, record: IssuedToken, now: number): CounterLog {
  const kept = log.issued.filter((t) => now - t.issuedAt <= LOG_RETENTION_MS);
  return { ...log, issued: [...kept, record] };
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

const isSuccess = (ack: Ack | null): boolean => ack?.status === 'stamped' || ack?.status === 'redeemed';

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
 * Activity in [from, to). Counts tokens that left the device (read over NFC,
 * acked, or shown as QR) and were not explicitly rejected by the customer app.
 */
export function statsBetween(log: CounterLog, from: number, to: number): CounterStats {
  const delivered = log.issued.filter(
    (t) =>
      t.issuedAt >= from &&
      t.issuedAt < to &&
      (t.status === 'read' || t.status === 'acked' || t.shownAsQr) &&
      (t.ack === null || isSuccess(t.ack)),
  );
  return {
    stamps: delivered.reduce((n, t) => (t.kind === 'stamp' ? n + t.count : n), 0),
    rewards: delivered.reduce((n, t) => (t.kind === 'redeem' ? n + t.count : n), 0),
  };
}

const DELIVERY_STATUSES: readonly DeliveryStatus[] = ['offered', 'read', 'acked', 'withdrawn'];
const ACK_STATUSES: readonly Ack['status'][] = ['stamped', 'redeemed', 'already-used', 'expired', 'no-reward', 'invalid'];

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

/** Validates an unknown value (e.g. parsed from storage) as a CounterLog. Returns null if any entry is malformed. */
export function parseCounterLog(value: unknown): CounterLog | null {
  if (!isObject(value) || value.version !== 1 || !Array.isArray(value.issued)) return null;
  return value.issued.every(isIssuedToken) ? { version: 1, issued: value.issued } : null;
}
