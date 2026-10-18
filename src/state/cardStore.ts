import { emptyCard, parseCard, summarize, type Card, type CardEvent } from '../domain/card';
import type { CafeConfig } from '../domain/config';
import { ackFor, applyToken, type IntakeError, type IntakeOutcome } from '../domain/intake';
import { parseLink, type Ack } from '../domain/link';
import { decodeToken, nonceId, type KeyRing } from '../domain/token';
import type { JsonStore } from '../infra/storage';
import { createStore, type Store } from './store';

export const CARD_KEY = 'card.v1';

export type IntakeSource = 'nfc' | 'qr' | 'link';

/** What the UI reacts to after a tap/scan. `id` lets the UI tell repeats apart. */
export type IntakeEvent =
  | { readonly id: number; readonly kind: 'success'; readonly outcome: IntakeOutcome; readonly source: IntakeSource }
  /** Same token applied again (e.g. a second tap after a flaky first one). Harmless. */
  | { readonly id: number; readonly kind: 'repeat'; readonly original: CardEvent; readonly source: IntakeSource }
  | { readonly id: number; readonly kind: 'error'; readonly error: IntakeError | 'not-ours' | 'storage'; readonly source: IntakeSource };

export interface CardState {
  readonly status: 'loading' | 'ready';
  readonly card: Card;
  readonly lastEvent: IntakeEvent | null;
}

export interface SubmitResult {
  readonly event: IntakeEvent;
  /** Ack to write back to the counter device, when the input was one of our tokens. */
  readonly ack: Ack | null;
}

export interface CardStoreDeps {
  readonly storage: JsonStore;
  readonly now: () => number;
  readonly cafe: CafeConfig;
  readonly keys: KeyRing;
}

export interface CardStore extends Store<CardState> {
  load(): Promise<void>;
  /** Applies the first of our token links among `uris`. Serialised: concurrent calls run one at a time. */
  submit(uris: readonly string[], source: IntakeSource): Promise<SubmitResult>;
  dismiss(eventId: number): void;
}

export function createCardStore(deps: CardStoreDeps): CardStore {
  const store = createStore<CardState>({ status: 'loading', card: emptyCard, lastEvent: null });
  let nextEventId = 1;
  let queue: Promise<unknown> = Promise.resolve();

  const serial = <T>(task: () => Promise<T>): Promise<T> => {
    const run = queue.then(task, task);
    queue = run.catch(() => undefined);
    return run;
  };

  const ensureLoaded = async (): Promise<Card> => {
    const current = store.getSnapshot();
    if (current.status === 'ready') return current.card;
    const card = (await deps.storage.load(CARD_KEY, parseCard)) ?? emptyCard;
    store.set({ ...store.getSnapshot(), status: 'ready', card });
    return card;
  };

  const publish = (event: IntakeEvent, ack: Ack | null): SubmitResult => {
    store.set({ ...store.getSnapshot(), lastEvent: event });
    return { event, ack };
  };

  const submitOne = async (uris: readonly string[], source: IntakeSource): Promise<SubmitResult> => {
    const card = await ensureLoaded();
    const id = nextEventId++;
    const token = uris
      .map((u) => parseLink(deps.cafe.scheme, u))
      .find((p) => p?.kind === 'token');
    if (!token || token.kind !== 'token') return publish({ id, kind: 'error', error: 'not-ours', source }, null);

    const decoded = decodeToken(token.token);
    const tokenNonce = decoded.ok ? nonceId(decoded.value.nonce) : null;
    const result = applyToken(card, token.token, {
      cafeId: deps.cafe.cafeId,
      keys: deps.keys,
      rules: deps.cafe.rules,
      now: deps.now(),
    });

    if (!result.ok) {
      const original = result.error === 'already-used' ? card.events.find((e) => e.nonceId === tokenNonce) : undefined;
      if (original) {
        // Re-confirm the original success so the counter screen shows it too.
        const summary = summarize(card, deps.cafe.rules);
        const ack: Ack = {
          nonceId: original.nonceId,
          status: original.kind === 'stamp' ? 'stamped' : 'redeemed',
          progress: summary.progress,
          rewardsAvailable: summary.rewardsAvailable,
        };
        return publish({ id, kind: 'repeat', original, source }, ack);
      }
      const ack = tokenNonce ? ackFor(result, tokenNonce, card, deps.cafe.rules) : null;
      return publish({ id, kind: 'error', error: result.error, source }, ack);
    }

    try {
      await deps.storage.save(CARD_KEY, result.value.card);
    } catch {
      return publish({ id, kind: 'error', error: 'storage', source }, null);
    }
    store.set({ ...store.getSnapshot(), card: result.value.card });
    return publish(
      { id, kind: 'success', outcome: result.value.outcome, source },
      ackFor(result, result.value.nonceId, result.value.card, deps.cafe.rules),
    );
  };

  return {
    ...store,
    load: () => serial(async () => void (await ensureLoaded())),
    submit: (uris, source) => serial(() => submitOne(uris, source)),
    dismiss(eventId) {
      const s = store.getSnapshot();
      if (s.lastEvent?.id === eventId) store.set({ ...s, lastEvent: null });
    },
  };
}
