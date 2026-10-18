import { emptyCard, findEvent, parseCard, summarize, type Card, type CardEvent, type RedeemEvent } from '../domain/card';
import type { CafeConfig } from '../domain/config';
import { ackFor, applyToken, commitRedemption, type IntakeError, type IntakeOutcome } from '../domain/intake';
import { buildAckLink, buildRedeemLink, parseLink, type Ack } from '../domain/link';
import { planRedemption, requestForEvent, type RedemptionPlan } from '../domain/redemption';
import { err, ok, type Result } from '../domain/result';
import { decodeToken, nonceId, type KeyRing } from '../domain/token';
import type { JsonStore } from '../infra/storage';
import { isOpen, rewardUse, type CodeError, type RewardUse, type RewardUseAction } from './rewardUse';
import { createStore, type Store } from './store';

export const CARD_KEY = 'card.v2';

export type IntakeSource = 'nfc' | 'qr' | 'link';

export type IntakeProblem =
  | IntakeError
  /** Not one of this café's codes. */
  | 'not-ours'
  /** The card couldn't be saved (or read). */
  | 'storage'
  /** NFC: the redemption request didn't reach the counter phone. */
  | 'not-delivered'
  /** A redemption request arrived without an NFC session to answer it (e.g. the tap launched the app). */
  | 'tap-again'
  /** NFC: the counter asked for a reward, but the customer hadn't opened one, so nothing was sent. */
  | 'reward-closed'
  /** NFC: the counter may have taken the reward, but this phone couldn't record it. */
  | 'redeem-not-saved';

/** What the UI reacts to after a tap/scan. `id` lets the UI tell repeats apart. */
export type IntakeEvent =
  | { readonly id: number; readonly kind: 'success'; readonly outcome: IntakeOutcome; readonly source: IntakeSource }
  /** Same token handled again (e.g. a second tap after a flaky first one). Harmless. */
  | { readonly id: number; readonly kind: 'repeat'; readonly original: CardEvent; readonly source: IntakeSource }
  | { readonly id: number; readonly kind: 'error'; readonly error: IntakeProblem; readonly source: IntakeSource };

export interface CardState {
  /** `unavailable`: storage couldn't be read; nothing is written until a retry succeeds. */
  readonly status: 'loading' | 'ready' | 'unavailable';
  readonly card: Card;
  readonly lastEvent: IntakeEvent | null;
  /** The customer using a reward; see rewardUse.ts. */
  readonly using: RewardUse;
}

/**
 * One NFC exchange with the counter phone. `reply` is written back over the
 * same session; `finish` reports whether that worked and returns the outcome.
 * Stamps are saved before replying (the reply is only a courtesy ack). A
 * redemption is saved only once its request was delivered.
 */
export interface TapExchange {
  readonly reply: string | null;
  finish(delivered: boolean): Promise<IntakeEvent>;
}

export interface CardStoreDeps {
  readonly storage: JsonStore;
  readonly now: () => number;
  readonly cafe: CafeConfig;
  readonly keys: KeyRing;
}

export interface CardStore extends Store<CardState> {
  load(): Promise<void>;
  /**
   * NFC: handles what was read from the counter phone. Stamps always land. A
   * redemption request gets the card's stamps only while a reward is open and
   * nothing is on screen over it, checked at the moment of replying: a counter
   * request replayed from another device can't take a reward off a card that's
   * merely on screen.
   */
  tap(uris: readonly string[]): Promise<TapExchange>;
  /** QR scans and deep links. */
  submit(uris: readonly string[], source: Exclude<IntakeSource, 'nfc'>): Promise<IntakeEvent>;
  /** The customer opened a reward to use it. */
  openReward(): void;
  /** Closes it, unless a code is being saved or a tap is handing over its stamps. */
  closeReward(): void;
  /** Spends the open reward on a code for the counter to scan. `busy`: the reward isn't open, or a tap or code is already using it. */
  showCode(): Promise<Result<{ readonly link: string; readonly event: RedeemEvent }, CodeError | 'busy'>>;
  /** The code of a past redemption, to show again (e.g. if it was never scanned). */
  codeFor(event: RedeemEvent): string | null;
  dismiss(eventId: number): void;
}

export function createCardStore(deps: CardStoreDeps): CardStore {
  const store = createStore<CardState>({ status: 'loading', card: emptyCard, lastEvent: null, using: null });
  const { cafe } = deps;
  let nextEventId = 1;
  let queue: Promise<unknown> = Promise.resolve();

  // Every read-modify-write of the card runs one at a time.
  const serial = <T>(task: () => Promise<T>): Promise<T> => {
    const run = queue.then(task, task);
    queue = run.catch(() => undefined);
    return run;
  };

  const ensureLoaded = async (): Promise<Card | null> => {
    const current = store.getSnapshot();
    if (current.status === 'ready') return current.card;
    let loaded;
    try {
      loaded = await deps.storage.load(CARD_KEY, parseCard);
    } catch {
      store.set({ ...store.getSnapshot(), status: 'unavailable' });
      return null;
    }
    if (loaded.kind === 'invalid' || (loaded.kind === 'ok' && loaded.value.dropped > 0)) {
      // Keep damaged data (or the events parsing had to drop) rather than overwrite it with the next stamp.
      await deps.storage.save(`${CARD_KEY}.damaged.${deps.now()}`, loaded.raw).catch(() => undefined);
    }
    const card = loaded.kind === 'ok' ? loaded.value.card : emptyCard;
    store.set({ ...store.getSnapshot(), status: 'ready', card });
    return card;
  };

  const save = async (card: Card): Promise<boolean> => {
    try {
      await deps.storage.save(CARD_KEY, card);
    } catch {
      return false;
    }
    store.set({ ...store.getSnapshot(), card });
    return true;
  };

  const publish = (event: IntakeEvent): IntakeEvent => {
    store.set({ ...store.getSnapshot(), lastEvent: event });
    return event;
  };
  const apply = (action: RewardUseAction): void => {
    const s = store.getSnapshot();
    const using = rewardUse(s.using, action);
    if (using !== s.using) store.set({ ...s, using });
  };
  /** A tap that sent the card's stamps is over: show its outcome and move the reward on in one update. */
  const settleTap = (used: boolean, outcome: IntakeEvent): IntakeEvent => {
    const s = store.getSnapshot();
    store.set({ ...s, lastEvent: outcome, using: rewardUse(s.using, { type: 'sent', used }) });
    return outcome;
  };
  const event = (body: DistributiveOmit<IntakeEvent, 'id'>): IntakeEvent => ({ ...body, id: nextEventId++ }) as IntakeEvent;
  const failure = (error: IntakeProblem, source: IntakeSource) => event({ kind: 'error', error, source });

  const ackLink = (ack: Ack | null) => (ack ? buildAckLink(cafe.scheme, ack) : null);

  /** Shared intake for every transport. `reply` is what NFC would write back. */
  type Handled =
    | { readonly kind: 'done'; readonly event: IntakeEvent; readonly reply: string | null }
    | { readonly kind: 'redeem'; readonly plan: RedemptionPlan; readonly trigger: string };

  const handle = async (uris: readonly string[], source: IntakeSource): Promise<Handled> => {
    const card = await ensureLoaded();
    if (!card) return { kind: 'done', event: failure('storage', source), reply: null };
    const link = uris.map((u) => parseLink(cafe.scheme, u)).find((p) => p?.kind === 'token');
    if (!link || link.kind !== 'token') return { kind: 'done', event: failure('not-ours', source), reply: null };

    const decoded = decodeToken(link.token);
    const tokenNonce = decoded.ok ? nonceId(decoded.value.nonce) : null;
    const result = applyToken(card, link.token, { cafeId: cafe.cafeId, keys: deps.keys, rules: cafe.rules, now: deps.now() });

    if (!result.ok) {
      const original = result.error === 'already-used' && tokenNonce ? findEvent(card, tokenNonce) : undefined;
      if (original) {
        // Re-confirm a stamp so the counter screen shows it too.
        const summary = summarize(card, cafe.rules);
        const ack: Ack | null =
          original.kind === 'stamp'
            ? { nonceId: original.nonceId, status: 'stamped', progress: summary.progress, rewardsAvailable: summary.rewardsAvailable }
            : null;
        return { kind: 'done', event: event({ kind: 'repeat', original, source }), reply: ackLink(ack) };
      }
      const ack = tokenNonce ? ackFor(result, tokenNonce, card, cafe.rules) : null;
      return { kind: 'done', event: failure(result.error, source), reply: ackLink(ack) };
    }

    const intake = result.value;
    if (intake.kind === 'redeem-request') return { kind: 'redeem', plan: intake.plan, trigger: intake.nonceId };

    if (!(await save(intake.card))) return { kind: 'done', event: failure('storage', source), reply: null };
    return {
      kind: 'done',
      event: event({ kind: 'success', outcome: intake.outcome, source }),
      reply: ackLink(ackFor(result, intake.nonceId, intake.card, cafe.rules)),
    };
  };

  // The request reached the counter, which may already have given the reward: whatever happens here, it's used.
  const commit = (plan: RedemptionPlan, trigger: string) =>
    serial(async (): Promise<IntakeEvent> => {
      const card = await ensureLoaded();
      if (!card) return settleTap(true, failure('redeem-not-saved', 'nfc'));
      const committed = commitRedemption(card, plan, cafe.rules, { now: deps.now(), via: 'nfc', trigger });
      if (!committed.ok) {
        const original = findEvent(card, plan.request.requestId) ?? findEvent(card, trigger);
        return settleTap(true, original ? event({ kind: 'repeat', original, source: 'nfc' }) : failure(committed.error, 'nfc'));
      }
      if (!(await save(committed.value.card))) {
        // The counter has the stamps, so stop offering them: keep the spend in memory; the next save that works stores it.
        store.set({ ...store.getSnapshot(), card: committed.value.card });
        return settleTap(true, failure('redeem-not-saved', 'nfc'));
      }
      return settleTap(true, event({ kind: 'success', outcome: committed.value.outcome, source: 'nfc' }));
    });

  const spendOnCode = async (): Promise<Result<{ readonly link: string; readonly event: RedeemEvent }, CodeError>> => {
    const card = await ensureLoaded();
    if (!card) return err('storage');
    const plan = planRedemption(card, cafe.rules);
    if (!plan) return err('no-reward');
    const committed = commitRedemption(card, plan, cafe.rules, { now: deps.now(), via: 'code' });
    if (!committed.ok) return err('no-reward');
    if (!(await save(committed.value.card))) return err('storage');
    return ok({ link: buildRedeemLink(cafe.scheme, plan.request), event: committed.value.event });
  };

  return {
    ...store,

    load: () => serial(async () => void (await ensureLoaded())),

    tap: (uris) =>
      serial(async (): Promise<TapExchange> => {
        const handled = await handle(uris, 'nfc');
        if (handled.kind === 'done') {
          publish(handled.event);
          return { reply: handled.reply, finish: async () => handled.event };
        }
        // Checked and claimed in one step, with nothing awaited in between.
        const { using, lastEvent } = store.getSnapshot();
        if (!isOpen(using) || lastEvent !== null) {
          const closed = publish(failure('reward-closed', 'nfc'));
          return { reply: null, finish: async () => closed };
        }
        const { plan, trigger } = handled;
        const reply = buildRedeemLink(cafe.scheme, plan.request);
        apply({ type: 'send' });
        return {
          reply,
          finish: (delivered) => (delivered ? commit(plan, trigger) : Promise.resolve(settleTap(false, failure('not-delivered', 'nfc')))),
        };
      }),

    submit: (uris, source) =>
      serial(async () => {
        const handled = await handle(uris, source);
        // Without an NFC session there's no way to hand the counter our stamps.
        return publish(handled.kind === 'done' ? handled.event : failure('tap-again', source));
      }),

    openReward: () => apply({ type: 'open' }),
    closeReward: () => apply({ type: 'close' }),

    showCode: () => {
      if (!isOpen(store.getSnapshot().using)) return Promise.resolve(err('busy' as const));
      // Claimed now, before the save: a tap read meanwhile finds the reward busy.
      apply({ type: 'make-code' });
      return serial(async () => {
        const result = await spendOnCode();
        apply(result.ok ? { type: 'code-made', link: result.value.link } : { type: 'code-failed', error: result.error });
        return result;
      });
    },

    codeFor(redeemed) {
      const request = requestForEvent(store.getSnapshot().card, redeemed);
      return request ? buildRedeemLink(cafe.scheme, request) : null;
    },

    dismiss(eventId) {
      const s = store.getSnapshot();
      if (s.lastEvent?.id === eventId) store.set({ ...s, lastEvent: null });
    },
  };
}

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
