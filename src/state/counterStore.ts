import type { CafeConfig } from '../domain/config';
import {
  createOffer,
  emptyCounterLog,
  logOffer,
  markRead,
  markShownAsQr,
  markWithdrawn,
  parseCounterLog,
  recordAck,
  type CounterLog,
  type IssuedToken,
} from '../domain/counter';
import { parseLink, type Ack } from '../domain/link';
import { decodeMessage, messageUris } from '../domain/ndef';
import type { StaffCredentials } from '../domain/provisioning';
import type { TokenKind } from '../domain/token';
import type { JsonStore } from '../infra/storage';
import { createStore, type Store } from './store';

/**
 * The counter screen's live state: at most one token on offer at a time.
 *
 *   idle ──offer()──▶ waiting ──phone read it──▶ read ──ack written──▶ done
 *                       │  └────────────── ack written ───────────────▶ done
 *                       └──cancel()/timeout──▶ idle
 */

export const COUNTER_KEY = 'counter.v1';
/** How long an offer stays open. Tokens stay valid longer (see MAX_TOKEN_AGE_S). */
export const OFFER_TTL_MS = 90_000;

export type OfferPhase = 'waiting' | 'read' | 'done';

export interface ActiveOffer {
  readonly record: IssuedToken;
  readonly link: string;
  readonly startedAt: number;
  readonly expiresAt: number;
  readonly phase: OfferPhase;
  /** When a phone finished reading the token over NFC. */
  readonly readAt: number | null;
  /** True if served over NFC (HCE); false means QR only. */
  readonly nfc: boolean;
  readonly qrVisible: boolean;
  readonly ack: Ack | null;
}

export interface CounterState {
  readonly status: 'loading' | 'ready';
  readonly log: CounterLog;
  readonly offer: ActiveOffer | null;
}

/** What the counter store needs from the tag emulator. */
export interface TagEmulator {
  readonly available: () => boolean;
  readonly serve: (offerId: string, ndef: Uint8Array) => void;
  readonly stop: () => void;
}

export interface CounterStoreDeps {
  readonly storage: JsonStore;
  readonly cafe: CafeConfig;
  readonly now: () => number;
  readonly randomBytes: (n: number) => Uint8Array;
  readonly tag: TagEmulator;
}

export interface CounterStore extends Store<CounterState> {
  load(): Promise<void>;
  offer(credentials: StaffCredentials, kind: TokenKind, count: number): void;
  showQr(): void;
  cancel(): void;
  /** Close a finished offer (after the success screen). */
  dismiss(): void;
  onTagRead(offerId: string): void;
  onTagWrite(offerId: string, message: Uint8Array): void;
}

export function createCounterStore(deps: CounterStoreDeps): CounterStore {
  const store = createStore<CounterState>({ status: 'loading', log: emptyCounterLog, offer: null });

  const update = (f: (s: CounterState) => CounterState) => {
    const before = store.getSnapshot();
    const after = f(before);
    store.set(after);
    if (after.log !== before.log) void deps.storage.save(COUNTER_KEY, after.log).catch(() => undefined);
  };

  const withOffer = (offerId: string, f: (s: CounterState, o: ActiveOffer) => CounterState) =>
    update((s) => (s.offer && s.offer.record.nonceId === offerId ? f(s, s.offer) : s));

  return {
    ...store,

    async load() {
      const log = (await deps.storage.load(COUNTER_KEY, parseCounterLog)) ?? emptyCounterLog;
      update((s) => ({ ...s, status: 'ready', log }));
    },

    offer(credentials, kind, count) {
      const now = deps.now();
      const created = createOffer({
        kind,
        count,
        now,
        nonce: deps.randomBytes(12),
        keyId: credentials.keyId,
        secretKey: credentials.secretKey,
        cafeId: deps.cafe.cafeId,
        scheme: deps.cafe.scheme,
      });
      const nfc = deps.tag.available();
      if (nfc) deps.tag.serve(created.record.nonceId, created.ndef);
      update((s) => {
        // Starting a new offer replaces any open one.
        const log = s.offer && s.offer.phase !== 'done' ? markWithdrawn(s.log, s.offer.record.nonceId) : s.log;
        const record = nfc ? created.record : { ...created.record, shownAsQr: true };
        return {
          ...s,
          log: logOffer(log, record, now),
          offer: {
            record,
            link: created.link,
            startedAt: now,
            expiresAt: now + OFFER_TTL_MS,
            phase: 'waiting',
            readAt: null,
            nfc,
            qrVisible: !nfc,
            ack: null,
          },
        };
      });
    },

    showQr() {
      update((s) =>
        s.offer && !s.offer.qrVisible
          ? { ...s, log: markShownAsQr(s.log, s.offer.record.nonceId), offer: { ...s.offer, qrVisible: true } }
          : s,
      );
    },

    cancel() {
      deps.tag.stop();
      update((s) => (s.offer ? { ...s, log: markWithdrawn(s.log, s.offer.record.nonceId), offer: null } : s));
    },

    dismiss() {
      deps.tag.stop();
      update((s) => ({ ...s, offer: null }));
    },

    onTagRead(offerId) {
      withOffer(offerId, (s, o) => ({
        ...s,
        log: markRead(s.log, offerId),
        offer: o.phase === 'waiting' ? { ...o, phase: 'read', readAt: deps.now() } : o,
      }));
    },

    onTagWrite(offerId, message) {
      const records = decodeMessage(message);
      const ack = records
        ? messageUris(records)
            .map((u) => parseLink(deps.cafe.scheme, u))
            .map((p) => (p?.kind === 'ack' ? p.ack : null))
            .find((a): a is Ack => a !== null && a.nonceId === offerId)
        : undefined;
      if (!ack) return;
      // The ack replaced the token on the emulated tag; stop serving immediately.
      deps.tag.stop();
      withOffer(offerId, (s, o) => ({ ...s, log: recordAck(s.log, ack), offer: { ...o, phase: 'done', ack } }));
    },
  };
}
