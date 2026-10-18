import { expect, jest, test } from '@jest/globals';

import { emptyCard, summarize } from '../domain/card';
import { buildTokenLink, parseLink } from '../domain/link';
import { verifyRedemption } from '../domain/redemption';
import { cafe, cardOf, ctx, keys, memoryStorage, now, token, value } from '../testing/protocol.test-utils';
import { CARD_KEY, createCardStore, type CardStore, type IntakeEvent } from './cardStore';

const link = (id = 20, count = 1, kind: 'stamp' | 'redeem' = 'stamp') => buildTokenLink(cafe.scheme, token(id, count, { kind }));
const redeemLink = () => link(20, 1, 'redeem');
/** The customer opens their reward, then taps the counter phone's redemption request. */
const openAndTap = (store: CardStore) => {
  store.openReward();
  return store.tap([redeemLink()]);
};
function setup(initial = emptyCard) {
  const fake = memoryStorage({ [CARD_KEY]: JSON.stringify(initial) });
  const store = createCardStore({ storage: fake.storage, now: () => now, cafe, keys });
  return { ...fake, store };
}

test('QR stamps persist, publish success, repeat without writing, and reject unrelated codes', async () => {
  const { store, writes, raw } = setup();
  const published: (IntakeEvent | null)[] = [];
  const unsubscribe = store.subscribe(() => published.push(store.getSnapshot().lastEvent));
  const event = await store.submit([link(20, 3)], 'qr');
  expect(event).toMatchObject({ kind: 'success', source: 'qr', outcome: { kind: 'stamped', added: 3 } });
  expect(store.getSnapshot().lastEvent).toEqual(event);
  expect(published).toContainEqual(event);
  expect(JSON.parse(raw.get(CARD_KEY)!)).toEqual(store.getSnapshot().card);
  expect(summarize(store.getSnapshot().card, cafe.rules).totalStamps).toBe(3);
  expect(await store.submit([link(20, 3)], 'qr')).toMatchObject({ kind: 'repeat', original: { kind: 'stamp', count: 3 } });
  expect(await store.submit(['anothercafe://t/x'], 'link')).toMatchObject({ kind: 'error', error: 'not-ours' });
  expect(writes).toHaveLength(1);
  unsubscribe();
});

test('NFC stamps are saved before finish and reply with a stamped ack, including retries', async () => {
  const { store, writes } = setup();
  const exchange = await store.tap([link(20, 3)]);
  expect(writes).toHaveLength(1);
  expect(summarize(store.getSnapshot().card, cafe.rules).totalStamps).toBe(3);
  expect(parseLink(cafe.scheme, exchange.reply!)).toMatchObject({ kind: 'ack', ack: { status: 'stamped', progress: 3, rewardsAvailable: 0 } });
  expect(await exchange.finish(false)).toMatchObject({ kind: 'success' });
  const again = await store.tap([link(20, 3)]);
  expect(await again.finish(true)).toMatchObject({ kind: 'repeat' });
  expect(parseLink(cafe.scheme, again.reply!)).toMatchObject({ kind: 'ack', ack: { status: 'stamped' } });
  expect(writes).toHaveLength(1);
});

test('NFC redemption sends verifiable proofs and commits once only after delivery', async () => {
  const initial = cardOf(4, 10);
  const { store, writes, raw } = setup(initial);
  const exchange = await openAndTap(store);
  const parsed = parseLink(cafe.scheme, exchange.reply!);
  if (parsed?.kind !== 'redeem') throw new Error('Expected redemption link');
  expect(value(verifyRedemption(parsed.request, { prior: null, spent: new Map() }, ctx)).spends).toEqual([{ nonceId: initial.events[0].nonceId, stamps: 4 }, { nonceId: initial.events[1].nonceId, stamps: 5 }]);
  expect(store.getSnapshot().card).toEqual(initial);
  expect(writes).toHaveLength(0);
  expect(await exchange.finish(true)).toMatchObject({ kind: 'success', outcome: { kind: 'redeemed', via: 'nfc' } });
  expect(await exchange.finish(true)).toMatchObject({ kind: 'repeat', original: { kind: 'redeem' } });
  const retry = await openAndTap(store);
  expect(retry.reply).toBeNull();
  expect(await retry.finish(true)).toMatchObject({ kind: 'repeat' });
  expect(store.getSnapshot().card.events.filter((e) => e.kind === 'redeem')).toHaveLength(1);
  expect(writes).toHaveLength(1);
  expect(JSON.parse(raw.get(CARD_KEY)!)).toEqual(store.getSnapshot().card);
});

test('undelivered redemption changes neither persisted nor in-memory card and can be retried', async () => {
  const initial = cardOf(9);
  const { store, writes, raw } = setup(initial);
  const exchange = await openAndTap(store);
  expect(await exchange.finish(false)).toMatchObject({ kind: 'error', error: 'not-delivered', source: 'nfc' });
  expect(store.getSnapshot().card).toEqual(initial);
  expect(JSON.parse(raw.get(CARD_KEY)!)).toEqual(initial);
  expect(writes).toHaveLength(0);
  store.dismiss(store.getSnapshot().lastEvent!.id);
  const retry = await openAndTap(store);
  expect(await retry.finish(true)).toMatchObject({ kind: 'success', outcome: { kind: 'redeemed' } });
});

test('a redemption request sends no stamps unless the customer opened their reward', async () => {
  const initial = cardOf(9);
  const { store, writes } = setup(initial);
  const closed = await store.tap([redeemLink()]);
  expect(closed.reply).toBeNull();
  expect(await closed.finish(true)).toMatchObject({ kind: 'error', error: 'reward-closed', source: 'nfc' });
  expect(store.getSnapshot().card).toEqual(initial);
  expect(writes).toHaveLength(0);

  // The same request, once they've read that and opened the reward, goes through.
  store.dismiss(store.getSnapshot().lastEvent!.id);
  const opened = await openAndTap(store);
  expect(parseLink(cafe.scheme, opened.reply!)).toMatchObject({ kind: 'redeem' });
  expect(await opened.finish(true)).toMatchObject({ kind: 'success', outcome: { kind: 'redeemed' } });
  expect(store.getSnapshot().using).toBeNull();
});

test('a tap can’t use a reward while something else is on screen over it', async () => {
  const { store } = setup(cardOf(9));
  store.openReward();
  await store.submit([link(21, 1)], 'qr'); // a stamp's feedback is now showing
  const exchange = await store.tap([redeemLink()]);
  expect(exchange.reply).toBeNull();
  expect(summarize(store.getSnapshot().card, cafe.rules).rewardsAvailable).toBe(1);
});

test('making a code claims the reward at once: a tap meanwhile gets no stamps, and one reward is used', async () => {
  const { store } = setup(cardOf(9, 9));
  store.openReward();
  const code = store.showCode();
  expect(store.getSnapshot().using).toEqual({ kind: 'preparing' });
  const exchange = await store.tap([redeemLink()]);
  expect(exchange.reply).toBeNull();
  expect((await code).ok).toBe(true);
  expect(summarize(store.getSnapshot().card, cafe.rules)).toMatchObject({ rewardsAvailable: 1, rewardsRedeemed: 1 });
});

test('a tap handing over the stamps blocks a code until it settles', async () => {
  const { store } = setup(cardOf(9, 9));
  const exchange = await openAndTap(store);
  expect(exchange.reply).not.toBeNull();
  expect(await store.showCode()).toEqual({ ok: false, error: 'busy' });
  expect(await exchange.finish(true)).toMatchObject({ kind: 'success', outcome: { kind: 'redeemed' } });
  expect(summarize(store.getSnapshot().card, cafe.rules)).toMatchObject({ rewardsAvailable: 1, rewardsRedeemed: 1 });
});

test('pressing Show my code twice uses one reward', async () => {
  const { store } = setup(cardOf(9, 9));
  store.openReward();
  const results = await Promise.all([store.showCode(), store.showCode()]);
  expect(results.map((r) => (r.ok ? 'ok' : r.error))).toEqual(['ok', 'busy']);
  expect(summarize(store.getSnapshot().card, cafe.rules).rewardsAvailable).toBe(1);
});

test('the reward stays open after a cut-off tap, closes once used, and can’t close mid-save', async () => {
  const { store } = setup(cardOf(9, 9));
  const cut = await openAndTap(store);
  await cut.finish(false);
  expect(store.getSnapshot().using).toEqual({ kind: 'open' });

  store.dismiss(store.getSnapshot().lastEvent!.id);
  const code = store.showCode();
  store.closeReward();
  expect(store.getSnapshot().using).toEqual({ kind: 'preparing' });
  const made = value(await code);
  expect(store.getSnapshot().using).toEqual({ kind: 'code', link: made.link });
  store.closeReward();
  expect(store.getSnapshot().using).toBeNull();
});

test('closing the reward mid-tap still records a tap that reached the counter', async () => {
  const { store } = setup(cardOf(9));
  const exchange = await openAndTap(store);
  store.closeReward();
  expect(await exchange.finish(true)).toMatchObject({ kind: 'success', outcome: { kind: 'redeemed' } });
  expect(summarize(store.getSnapshot().card, cafe.rules).rewardsAvailable).toBe(0);
});

test('without a reward, a redemption request is answered with progress only', async () => {
  const { store } = setup(cardOf(4));
  const exchange = await store.tap([redeemLink()]);
  expect(parseLink(cafe.scheme, exchange.reply!)).toMatchObject({ kind: 'ack', ack: { status: 'no-reward', progress: 4 } });
  expect(await exchange.finish(true)).toMatchObject({ kind: 'error', error: 'no-reward' });
});

test.each(['qr', 'link'] as const)('redeem token via %s asks for another tap without spending', async (source) => {
  const initial = cardOf(9);
  const { store, writes } = setup(initial);
  expect(await store.submit([link(20, 1, 'redeem')], source)).toMatchObject({ kind: 'error', error: 'tap-again', source });
  expect(store.getSnapshot().card).toEqual(initial);
  expect(writes).toHaveLength(0);
});

test('showCode spends one reward and codeFor reproduces the link', async () => {
  const { store, raw } = setup(cardOf(9, 9));
  store.openReward();
  const result = value(await store.showCode());
  expect(result.event).toMatchObject({ kind: 'redeem', via: 'code' });
  expect(store.codeFor(result.event)).toBe(result.link);
  expect(summarize(store.getSnapshot().card, cafe.rules)).toMatchObject({ rewardsAvailable: 1, rewardsRedeemed: 1, unspentStamps: 9 });
  expect(JSON.parse(raw.get(CARD_KEY)!)).toEqual(store.getSnapshot().card);
  const parsed = parseLink(cafe.scheme, result.link);
  if (parsed?.kind !== 'redeem') throw new Error('Expected code');
  expect(verifyRedemption(parsed.request, { prior: null, spent: new Map() }, ctx).ok).toBe(true);
});

test('no reward means no code and no write, and the reward stays open with the reason', async () => {
  const { store, writes } = setup(cardOf(8));
  store.openReward();
  expect(await store.showCode()).toEqual({ ok: false, error: 'no-reward' });
  expect(store.getSnapshot().using).toEqual({ kind: 'open', error: 'no-reward' });
  expect(writes).toHaveLength(0);
});

test('a code needs the reward opened first', async () => {
  const { store, writes } = setup(cardOf(9));
  expect(await store.showCode()).toEqual({ ok: false, error: 'busy' });
  expect(writes).toHaveLength(0);
});

test('unreadable storage becomes unavailable and submissions fail without writing', async () => {
  const { store, storage, writes } = setup();
  storage.load = async () => { throw new Error('cannot read'); };
  await store.load();
  expect(store.getSnapshot().status).toBe('unavailable');
  expect(await store.submit([link()], 'qr')).toMatchObject({ kind: 'error', error: 'storage' });
  store.openReward();
  expect(await store.showCode()).toEqual({ ok: false, error: 'storage' });
  expect(writes).toHaveLength(0);
});

test.each(['{not json', 'null', '{"version":1,"events":[]}', '"not a card"'])('preserves damaged raw data %s before starting empty', async (damaged) => {
  const { store, raw } = setup();
  raw.set(CARD_KEY, damaged);
  await store.load();
  expect(store.getSnapshot()).toMatchObject({ status: 'ready', card: emptyCard });
  expect(JSON.parse(raw.get(`${CARD_KEY}.damaged.${now}`)!)).toBe(damaged);
  expect(await store.submit([link()], 'qr')).toMatchObject({ kind: 'success' });
  expect(JSON.parse(raw.get(`${CARD_KEY}.damaged.${now}`)!)).toBe(damaged);
});

test('keeps the original data when loading had to drop damaged events, and backs nothing up for a clean card', async () => {
  const card = cardOf(4, 3);
  const damaged = JSON.stringify({ ...card, events: [card.events[0], { ...card.events[1], count: 0 }] });
  const { store, raw } = setup();
  raw.set(CARD_KEY, damaged);
  await store.load();
  expect(summarize(store.getSnapshot().card, cafe.rules).unspentStamps).toBe(4);
  expect(await store.submit([link()], 'qr')).toMatchObject({ kind: 'success' });
  expect(JSON.parse(raw.get(`${CARD_KEY}.damaged.${now}`)!)).toBe(damaged);

  const clean = setup(card);
  await clean.store.load();
  expect([...clean.raw.keys()]).toEqual([CARD_KEY]);
});

test.each(['stamp', 'code', 'nfc'] as const)('save failure on %s leaves card unchanged', async (operation) => {
  const initial = cardOf(9);
  const { store, storage, raw } = setup(initial);
  await store.load();
  storage.save = async () => { throw new Error('full'); };
  if (operation === 'code') {
    store.openReward();
    expect(await store.showCode()).toEqual({ ok: false, error: 'storage' });
  } else if (operation === 'nfc') {
    const exchange = await openAndTap(store);
    // The counter may already have taken it, so the customer is told to check there.
    expect(await exchange.finish(true)).toMatchObject({ kind: 'error', error: 'redeem-not-saved' });
    expect(store.getSnapshot().using).toBeNull();
  } else expect(await store.submit([link()], 'qr')).toMatchObject({ kind: 'error', error: 'storage' });
  expect(store.getSnapshot().card).toEqual(initial);
  expect(JSON.parse(raw.get(CARD_KEY)!)).toEqual(initial);
});

test('concurrent stamp submissions are serialized and do not lose either stamp', async () => {
  const { store } = setup();
  const events = await Promise.all([store.submit([link(20, 3)], 'qr'), store.submit([link(21, 4)], 'link')]);
  expect(events.map((e) => e.kind)).toEqual(['success', 'success']);
  expect(summarize(store.getSnapshot().card, cafe.rules).totalStamps).toBe(7);
  const notify = jest.fn();
  store.subscribe(notify);
  store.dismiss(events[0].id);
  expect(notify).not.toHaveBeenCalled();
  store.dismiss(events[1].id);
  expect(store.getSnapshot().lastEvent).toBeNull();
});

test('simultaneous NFC completions spend and persist exactly once', async () => {
  const { store, writes, raw } = setup(cardOf(9));
  const exchange = await openAndTap(store);
  const events = await Promise.all([exchange.finish(true), exchange.finish(true)]);
  expect(events.map((e) => e.kind)).toEqual(['success', 'repeat']);
  expect(store.getSnapshot().card.events.filter((e) => e.kind === 'redeem')).toHaveLength(1);
  expect(JSON.parse(raw.get(CARD_KEY)!)).toEqual(store.getSnapshot().card);
  expect(writes).toHaveLength(1);
});
