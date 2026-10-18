import { expect, test } from '@jest/globals';

import { summarize } from '../domain/card';
import { decodeMessage, encodeUriMessage, messageUris } from '../domain/ndef';
import { MAX_PROOFS, type RedemptionRequest } from '../domain/redemption';
import { buildRedeemLink } from '../domain/link';
import { cafe, keys, memoryStorage, now, pair, seed, token } from '../testing/protocol.test-utils';
import { createCardStore, type CardStore, type IntakeEvent } from './cardStore';
import { createCounterStore, type CounterStore, type OfferOutcome } from './counterStore';
import { createMemoryRegistry } from './testing/memoryRegistry';

/**
 * Both phones end to end, joined where the radio would be: the counter store
 * serves NDEF bytes on its tag, the customer store reads them and replies, and
 * the reply's NDEF bytes are written back to the counter. The emulated tag
 * itself (APDUs, chunking, staging) is covered by Type4TagEmulatorTest.
 */

/** Largest NDEF message the counter's emulated file holds: 4096 bytes minus the 2-byte length. */
const TAG_CAPACITY = 4096 - 2;
const DAY = 24 * 60 * 60 * 1000;
const credentials = { keyId: 1, ...pair, seed };

function world() {
  const clock = { now };
  let nonce = 1;
  return { clock, nextNonce: () => nonce++ };
}
type World = ReturnType<typeof world>;

function counterPhone(w: World) {
  let served: { readonly offerId: string; readonly ndef: Uint8Array } | null = null;
  const registry = createMemoryRegistry();
  const store = createCounterStore({
    storage: memoryStorage().storage,
    registry,
    cafe,
    keys,
    now: () => w.clock.now,
    randomBytes: (n) => {
      const bytes = new Uint8Array(n);
      new DataView(bytes.buffer).setUint32(0, w.nextNonce());
      return bytes;
    },
    tag: { available: () => true, serve: (offerId, ndef) => { served = { offerId, ndef }; }, stop: () => { served = null; } },
  });
  return { store, registry, serving: () => served };
}
type Counter = ReturnType<typeof counterPhone>;

const customerPhone = (w: World, storage = memoryStorage()) => ({ store: createCardStore({ storage: storage.storage, now: () => w.clock.now, cafe, keys }), storage });

function settled(store: CounterStore): Promise<OfferOutcome | null> {
  return new Promise((resolve) => {
    const check = () => {
      const offer = store.getSnapshot().offer;
      if (!offer || offer.phase !== 'checking') { unsubscribe(); resolve(offer?.outcome ?? null); }
    };
    const unsubscribe = store.subscribe(check);
    check();
  });
}

/**
 * One tap: the customer reads what the counter serves and writes its reply back
 * (unless the phones part too soon). `useReward`: the customer opened their reward first.
 */
async function tap(counter: Counter, customer: CardStore, { replyArrives = true, useReward = false } = {}): Promise<{ event: IntakeEvent; outcome: OfferOutcome | null } | null> {
  const served = counter.serving();
  if (!served) return null;
  const records = decodeMessage(served.ndef);
  expect(records).not.toBeNull();
  counter.store.onTagRead(served.offerId);
  const exchange = await customer.tap(messageUris(records!), { useReward });
  let delivered = false;
  if (exchange.reply) {
    const message = encodeUriMessage(exchange.reply);
    expect(message.length).toBeLessThanOrEqual(TAG_CAPACITY);
    if (replyArrives) {
      counter.store.onTagWrite(served.offerId, message);
      delivered = true;
    }
  }
  const event = await exchange.finish(delivered);
  return { event, outcome: await settled(counter.store) };
}

async function visit(w: World, counter: Counter, customer: CardStore, stamps: number) {
  w.clock.now += DAY;
  counter.store.offer(credentials, 'stamp', stamps);
  const result = await tap(counter, customer);
  counter.store.dismiss();
  return result;
}

async function setup() {
  const w = world();
  const counter = counterPhone(w);
  const customer = customerPhone(w);
  await counter.store.load();
  await customer.store.load();
  return { w, counter, customer };
}

const summary = (customer: CardStore) => summarize(customer.getSnapshot().card, cafe.rules);

test('a tap moves the stamps onto the card and the counter sees the confirmation', async () => {
  const { w, counter, customer } = await setup();
  const result = await visit(w, counter, customer.store, 3);
  expect(result?.event).toMatchObject({ kind: 'success', outcome: { kind: 'stamped' } });
  expect(result?.outcome).toMatchObject({ kind: 'ack', ack: { status: 'stamped', progress: 3 } });
  expect(summary(customer.store)).toMatchObject({ unspentStamps: 3, progress: 3, rewardsAvailable: 0 });
});

test('nine visits earn a reward, and redeeming it by tap is verified once', async () => {
  const { w, counter, customer } = await setup();
  for (let i = 0; i < 9; i++) await visit(w, counter, customer.store, 1);
  expect(summary(customer.store).rewardsAvailable).toBe(1);

  counter.store.offer(credentials, 'redeem', 1);
  const redeemed = await tap(counter, customer.store, { useReward: true });
  expect(redeemed?.outcome).toEqual({ kind: 'verified', at: w.clock.now });
  expect(redeemed?.event).toMatchObject({ kind: 'success', outcome: { kind: 'redeemed', via: 'nfc' } });
  expect(summary(customer.store)).toMatchObject({ rewardsAvailable: 0, rewardsRedeemed: 1, unspentStamps: 0 });
  expect(counter.store.getSnapshot().log.redemptions).toHaveLength(1);

  // The code in History is the same reward: the counter refuses it.
  counter.store.dismiss();
  const event = customer.store.getSnapshot().card.events.find((e) => e.kind === 'redeem');
  const code = event?.kind === 'redeem' ? customer.store.codeFor(event) : null;
  counter.store.offer(credentials, 'redeem', 1);
  expect(await counter.store.scanCode(code!)).toBe('checked');
  expect(counter.store.getSnapshot().offer?.outcome).toMatchObject({ kind: 'refused', reason: 'already-redeemed' });
});

test('a stamp lands even when the reply is lost as the phones part', async () => {
  const { w, counter, customer } = await setup();
  w.clock.now += DAY;
  counter.store.offer(credentials, 'stamp', 2);
  const result = await tap(counter, customer.store, { replyArrives: false });
  expect(result?.event).toMatchObject({ kind: 'success' });
  expect(summary(customer.store).unspentStamps).toBe(2);
  // The counter knows the token was read, just not confirmed.
  expect(counter.store.getSnapshot().offer).toMatchObject({ phase: 'read', outcome: null });
});

test('a redemption cut off mid-write keeps the reward, and tapping again redeems it', async () => {
  const { w, counter, customer } = await setup();
  await visit(w, counter, customer.store, 9);
  counter.store.offer(credentials, 'redeem', 1);
  const cut = await tap(counter, customer.store, { replyArrives: false, useReward: true });
  expect(cut?.event).toMatchObject({ kind: 'error', error: 'not-delivered' });
  expect(summary(customer.store).rewardsAvailable).toBe(1);

  const retry = await tap(counter, customer.store, { useReward: true });
  expect(retry?.outcome).toMatchObject({ kind: 'verified' });
  expect(summary(customer.store).rewardsAvailable).toBe(0);
});

test('a card copied to a second phone gets one free drink, not two', async () => {
  const { w, counter, customer } = await setup();
  await visit(w, counter, customer.store, 9);
  const copy = customerPhone(w, memoryStorage(Object.fromEntries(customer.storage.raw)));
  await copy.store.load();
  expect(summary(copy.store).rewardsAvailable).toBe(1);

  counter.store.offer(credentials, 'redeem', 1);
  expect((await tap(counter, customer.store, { useReward: true }))?.outcome).toMatchObject({ kind: 'verified' });
  counter.store.dismiss();

  counter.store.offer(credentials, 'redeem', 1);
  expect((await tap(counter, copy.store, { useReward: true }))?.outcome).toMatchObject({ kind: 'refused', reason: 'already-redeemed' });
});

test('a counter request replayed from another device takes nothing from a card that is just on screen', async () => {
  const { w, counter, customer } = await setup();
  await visit(w, counter, customer.store, 9);
  counter.store.offer(credentials, 'redeem', 1);
  // Someone reads the counter phone's request and plays it to a customer's phone from their own device.
  const captured = messageUris(decodeMessage(counter.serving()!.ndef)!);
  const bumped = await customer.store.tap(captured, { useReward: false });
  expect(bumped.reply).toBeNull();
  expect(await bumped.finish(true)).toMatchObject({ kind: 'error', error: 'reward-closed' });
  expect(summary(customer.store).rewardsAvailable).toBe(1);

  // Tapping the real counter without opening the reward doesn't use it either; opening it first does.
  expect((await tap(counter, customer.store))?.outcome).toBeNull();
  expect(counter.store.getSnapshot().offer).toMatchObject({ phase: 'read', outcome: null });
  expect((await tap(counter, customer.store, { useReward: true }))?.outcome).toMatchObject({ kind: 'verified' });
});

test('a phone with no reward is told so, and the counter shows why', async () => {
  const { w, counter, customer } = await setup();
  await visit(w, counter, customer.store, 4);
  counter.store.offer(credentials, 'redeem', 1);
  const result = await tap(counter, customer.store);
  expect(result?.event).toMatchObject({ kind: 'error', error: 'no-reward' });
  expect(result?.outcome).toMatchObject({ kind: 'refused', reason: 'no-reward', progress: 4 });
});

test('the largest possible redemption still fits on the counter phone’s emulated tag', () => {
  const request: RedemptionRequest = { requestId: 'AAAAAAAAAAAAAAAA', proofs: Array.from({ length: MAX_PROOFS }, (_, i) => token(i + 1, 1)) };
  expect(encodeUriMessage(buildRedeemLink(cafe.scheme, request)).length).toBeLessThanOrEqual(TAG_CAPACITY);
});
