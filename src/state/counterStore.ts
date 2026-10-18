import type { CafeConfig } from '../domain/config';
import {
  createOffer,
  emptyCounterLog,
  logOffer,
  logRedemption,
  markRead,
  markShownAsQr,
  markWithdrawn,
  parseCounterLog,
  recordAck,
  type CounterLog,
  type IssuedToken,
} from '../domain/counter';
import { parseLink, type Ack, type AckStatus, type ParsedLink } from '../domain/link';
import { decodeMessage, messageUris } from '../domain/ndef';
import type { StaffCredentials } from '../domain/provisioning';
import {
  proofNonceIds,
  verifyRedemption,
  type Redemption,
  type RedemptionRejection,
  type RedemptionRequest,
  type RegistryView,
} from '../domain/redemption';
import type { KeyRing, TokenKind } from '../domain/token';
import type { JsonStore } from '../infra/storage';
import { createStore, type Store } from './store';

/**
 * The counter screen's live state: at most one token on offer at a time.
 *
 *   idle ──offer()──▶ waiting ──phone read it──▶ read ──reply written──▶ done
 *                       │                         └──redemption request──▶ checking ──▶ done
 *                       ├──redemption code scanned──────────────────────▶ checking ──▶ done
 *                       └──cancel()/timeout──▶ idle
 *
 * Stamp offers end with the customer app's ack (courtesy feedback). Redeem
 * offers end only with a redemption request verified against the registry,
 * or a refusal; a customer-written ack can never mark a reward as given.
 */

export const COUNTER_KEY = 'counter.v2';
/** How long an offer stays open. Tokens stay valid longer (see MAX_TOKEN_AGE_S). */
export const OFFER_TTL_MS = 90_000;

export type OfferPhase = 'waiting' | 'read' | 'checking' | 'done';

export type RefusalReason =
  | RedemptionRejection['kind']
  /** Reported by the customer app over NFC. */
  | Exclude<AckStatus, 'stamped'>
  /** The registry couldn't be read or written. */
  | 'unavailable';

export type OfferOutcome =
  /** Stamp offers: what the customer app reported. */
  | { readonly kind: 'ack'; readonly ack: Ack }
  /** Redeem offers: proofs verified and recorded. */
  | { readonly kind: 'verified'; readonly at: number }
  /**
   * Redeem offers: no reward given. `at`: when it was redeemed before, for
   * 'already-redeemed'. `progress`: the customer's stamps, when their app said why.
   */
  | { readonly kind: 'refused'; readonly reason: RefusalReason; readonly at?: number; readonly progress?: number };

export interface ActiveOffer {
  readonly record: IssuedToken;
  readonly link: string;
  readonly startedAt: number;
  readonly expiresAt: number;
  readonly phase: OfferPhase;
  /** When a phone finished reading the token over NFC. */
  readonly readAt: number | null;
  /** True if served over NFC (HCE). */
  readonly nfc: boolean;
  /** Stamp offers: the QR code is on screen. */
  readonly qrVisible: boolean;
  readonly outcome: OfferOutcome | null;
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

/** Durable record of spent stamps: the authority on what has been redeemed. */
export interface RedemptionRegistry {
  view(requestId: string, proofNonceIds: readonly string[]): Promise<RegistryView>;
  /** Records a verified redemption atomically. 'duplicate' if the request id is already recorded. */
  record(redemption: Redemption): Promise<'recorded' | 'duplicate'>;
}

export interface CounterStoreDeps {
  readonly storage: JsonStore;
  readonly registry: RedemptionRegistry;
  readonly cafe: CafeConfig;
  readonly keys: KeyRing;
  readonly now: () => number;
  readonly randomBytes: (n: number) => Uint8Array;
  readonly tag: TagEmulator;
}

export type ScanResult = 'checked' | 'not-a-code' | 'ignored';

export interface CounterStore extends Store<CounterState> {
  load(): Promise<void>;
  /** Starts an offer. Ignored until the store has loaded. */
  offer(credentials: StaffCredentials, kind: TokenKind, count: number): void;
  showQr(): void;
  cancel(): void;
  /** Close a finished offer (after the result screen). */
  dismiss(): void;
  /** Redeem offers: a code scanned from the customer's screen. */
  scanCode(text: string): Promise<ScanResult>;
  onTagRead(offerId: string): void;
  onTagWrite(offerId: string, message: Uint8Array): void;
}

export function createCounterStore(deps: CounterStoreDeps): CounterStore {
  const store = createStore<CounterState>({ status: 'loading', log: emptyCounterLog, offer: null });
  // False if the saved log couldn't be read, so it isn't overwritten by a fresh one.
  let persistLog = true;
  let checks: Promise<unknown> = Promise.resolve();

  const update = (f: (s: CounterState) => CounterState) => {
    const before = store.getSnapshot();
    const after = f(before);
    store.set(after);
    if (persistLog && after.log !== before.log) void deps.storage.save(COUNTER_KEY, after.log).catch(() => undefined);
  };

  const withOffer = (offerId: string, f: (s: CounterState, o: ActiveOffer) => CounterState) =>
    update((s) => (s.offer && s.offer.record.nonceId === offerId ? f(s, s.offer) : s));

  const finish = (offerId: string, outcome: OfferOutcome, log?: (l: CounterLog) => CounterLog) =>
    withOffer(offerId, (s, o) => ({ ...s, log: log ? log(s.log) : s.log, offer: { ...o, phase: 'done', outcome } }));

  /**
   * Verifies and records one request. Checks run one at a time so two phones
   * can't spend the same stamps. An offer checks only its first request, so a
   * request already recorded comes from an earlier offer (a re-shown code, or
   * a tap whose reply was cut off) and is refused.
   */
  const settle = async (request: RedemptionRequest): Promise<OfferOutcome> => {
    const ids = proofNonceIds(request);
    if (!ids) return { kind: 'refused', reason: 'invalid' };
    const ctx = { cafeId: deps.cafe.cafeId, keys: deps.keys, rules: deps.cafe.rules, now: deps.now() };
    let view = await deps.registry.view(request.requestId, ids);
    let result = verifyRedemption(request, view, ctx);
    if (result.ok && (await deps.registry.record(result.value)) === 'duplicate') {
      view = await deps.registry.view(request.requestId, ids);
      result = verifyRedemption(request, view, ctx);
    }
    if (result.ok) {
      const at = result.value.at;
      update((s) => ({ ...s, log: logRedemption(s.log, { requestId: request.requestId, at }, at) }));
      return { kind: 'verified', at };
    }
    const rejection = result.error;
    return rejection.kind === 'already-redeemed'
      ? { kind: 'refused', reason: 'already-redeemed', at: rejection.at }
      : { kind: 'refused', reason: rejection.kind };
  };

  const check = (offerId: string, request: RedemptionRequest) => {
    const offer = store.getSnapshot().offer;
    if (!offer || offer.record.nonceId !== offerId) return Promise.resolve();
    withOffer(offerId, (s, o) => ({ ...s, offer: { ...o, phase: 'checking' } }));
    const run = checks.then(async () => {
      const outcome = await settle(request).catch((): OfferOutcome => ({ kind: 'refused', reason: 'unavailable' }));
      finish(offerId, outcome);
    });
    checks = run.catch(() => undefined);
    return run;
  };

  const parseUris = (uris: readonly string[]): readonly ParsedLink[] =>
    uris.map((u) => parseLink(deps.cafe.scheme, u)).filter((p): p is ParsedLink => p !== null);

  const openOffer = (offerId: string): ActiveOffer | null => {
    const o = store.getSnapshot().offer;
    return o && o.record.nonceId === offerId && (o.phase === 'waiting' || o.phase === 'read') ? o : null;
  };

  return {
    ...store,

    async load() {
      let log = emptyCounterLog;
      try {
        const loaded = await deps.storage.load(COUNTER_KEY, parseCounterLog);
        if (loaded.kind === 'ok') log = loaded.value;
        // Unreadable data is replaced: the log is informational, the registry is the record.
      } catch {
        persistLog = false;
      }
      store.set({ ...store.getSnapshot(), status: 'ready', log });
    },

    offer(credentials, kind, count) {
      if (store.getSnapshot().status !== 'ready') return;
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
      else deps.tag.stop();
      update((s) => {
        // Starting a new offer replaces any open one.
        const log = s.offer && s.offer.phase !== 'done' ? markWithdrawn(s.log, s.offer.record.nonceId) : s.log;
        // Without NFC a stamp goes out as a QR code straight away. Redemptions are scanned from the customer instead.
        const qrVisible = !nfc && kind === 'stamp';
        const record = qrVisible ? { ...created.record, shownAsQr: true } : created.record;
        return {
          ...s,
          log: logOffer(log, record, now),
          offer: { record, link: created.link, startedAt: now, expiresAt: now + OFFER_TTL_MS, phase: 'waiting', readAt: null, nfc, qrVisible, outcome: null },
        };
      });
    },

    showQr() {
      update((s) =>
        s.offer && s.offer.record.kind === 'stamp' && !s.offer.qrVisible
          ? { ...s, log: markShownAsQr(s.log, s.offer.record.nonceId), offer: { ...s.offer, qrVisible: true } }
          : s,
      );
    },

    cancel() {
      if (store.getSnapshot().offer?.phase === 'checking') return;
      deps.tag.stop();
      update((s) => (s.offer ? { ...s, log: markWithdrawn(s.log, s.offer.record.nonceId), offer: null } : s));
    },

    dismiss() {
      if (store.getSnapshot().offer?.phase === 'checking') return;
      deps.tag.stop();
      update((s) => ({ ...s, offer: null }));
    },

    async scanCode(text) {
      const offer = store.getSnapshot().offer;
      if (!offer || offer.record.kind !== 'redeem' || !openOffer(offer.record.nonceId)) return 'ignored';
      const parsed = parseUris([text]).find((p) => p.kind === 'redeem');
      if (!parsed || parsed.kind !== 'redeem') return 'not-a-code';
      deps.tag.stop();
      await check(offer.record.nonceId, parsed.request);
      return 'checked';
    },

    onTagRead(offerId) {
      withOffer(offerId, (s, o) => ({
        ...s,
        log: markRead(s.log, offerId),
        offer: o.phase === 'waiting' ? { ...o, phase: 'read', readAt: deps.now() } : o,
      }));
    },

    onTagWrite(offerId, message) {
      const offer = openOffer(offerId);
      if (!offer) return;
      const records = decodeMessage(message);
      const links = records ? parseUris(messageUris(records)) : [];
      const ack = links.map((p) => (p.kind === 'ack' ? p.ack : null)).find((a): a is Ack => a !== null && a.nonceId === offerId);

      if (offer.record.kind === 'stamp') {
        if (!ack) return;
        // The reply replaced the token on the emulated tag; stop serving immediately.
        deps.tag.stop();
        finish(offerId, { kind: 'ack', ack }, (l) => recordAck(l, ack));
        return;
      }

      const request = links.find((p) => p.kind === 'redeem');
      if (request?.kind === 'redeem') {
        deps.tag.stop();
        void check(offerId, request.request);
        return;
      }
      // The customer app explains why it can't redeem (e.g. no reward yet). A
      // "success" ack is never accepted for a reward.
      if (ack && ack.status !== 'stamped') {
        deps.tag.stop();
        finish(offerId, { kind: 'refused', reason: ack.status, progress: ack.progress }, (l) => recordAck(l, ack));
      }
    },
  };
}
