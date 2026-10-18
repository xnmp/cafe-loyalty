import { expect, jest, test } from '@jest/globals';

import { emptyCard, summarize } from '../domain/card';
import { buildTokenLink, parseLink } from '../domain/link';
import { verifyRedemption } from '../domain/redemption';
import { cafe, cardOf, ctx, keys, memoryStorage, now, token, value } from '../testing/protocol.test-utils';
import { CARD_KEY, createCardStore, type IntakeEvent } from './cardStore';

const link = (id = 20, count = 1, kind: 'stamp' | 'redeem' = 'stamp') => buildTokenLink(cafe.scheme, token(id, count, { kind }));
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
  const exchange = await store.tap([link(20, 1, 'redeem')]);
  const parsed = parseLink(cafe.scheme, exchange.reply!);
  if (parsed?.kind !== 'redeem') throw new Error('Expected redemption link');
  expect(value(verifyRedemption(parsed.request, { prior: null, spent: new Map() }, ctx)).spends).toEqual([{ nonceId: initial.events[0].nonceId, stamps: 4 }, { nonceId: initial.events[1].nonceId, stamps: 5 }]);
  expect(store.getSnapshot().card).toEqual(initial);
  expect(writes).toHaveLength(0);
  expect(await exchange.finish(true)).toMatchObject({ kind: 'success', outcome: { kind: 'redeemed', via: 'nfc' } });
  expect(await exchange.finish(true)).toMatchObject({ kind: 'repeat', original: { kind: 'redeem' } });
  const retry = await store.tap([link(20, 1, 'redeem')]);
  expect(retry.reply).toBeNull();
  expect(await retry.finish(true)).toMatchObject({ kind: 'repeat' });
  expect(store.getSnapshot().card.events.filter((e) => e.kind === 'redeem')).toHaveLength(1);
  expect(writes).toHaveLength(1);
  expect(JSON.parse(raw.get(CARD_KEY)!)).toEqual(store.getSnapshot().card);
});

test('undelivered redemption changes neither persisted nor in-memory card and can be retried', async () => {
  const initial = cardOf(9);
  const { store, writes, raw } = setup(initial);
  const exchange = await store.tap([link(20, 1, 'redeem')]);
  expect(await exchange.finish(false)).toMatchObject({ kind: 'error', error: 'not-delivered', source: 'nfc' });
  expect(store.getSnapshot().card).toEqual(initial);
  expect(JSON.parse(raw.get(CARD_KEY)!)).toEqual(initial);
  expect(writes).toHaveLength(0);
  const retry = await store.tap([link(20, 1, 'redeem')]);
  expect(await retry.finish(true)).toMatchObject({ kind: 'success', outcome: { kind: 'redeemed' } });
});

test.each(['qr', 'link'] as const)('redeem token via %s asks for another tap without spending', async (source) => {
  const initial = cardOf(9);
  const { store, writes } = setup(initial);
  expect(await store.submit([link(20, 1, 'redeem')], source)).toMatchObject({ kind: 'error', error: 'tap-again', source });
  expect(store.getSnapshot().card).toEqual(initial);
  expect(writes).toHaveLength(0);
});

test('redeemWithCode spends one reward and codeFor reproduces the link', async () => {
  const { store, raw } = setup(cardOf(9, 9));
  const result = value(await store.redeemWithCode());
  expect(result.event).toMatchObject({ kind: 'redeem', via: 'code' });
  expect(store.codeFor(result.event)).toBe(result.link);
  expect(summarize(store.getSnapshot().card, cafe.rules)).toMatchObject({ rewardsAvailable: 1, rewardsRedeemed: 1, unspentStamps: 9 });
  expect(JSON.parse(raw.get(CARD_KEY)!)).toEqual(store.getSnapshot().card);
  const parsed = parseLink(cafe.scheme, result.link);
  if (parsed?.kind !== 'redeem') throw new Error('Expected code');
  expect(verifyRedemption(parsed.request, { prior: null, spent: new Map() }, ctx).ok).toBe(true);
});

test('no reward means no code and no write', async () => {
  const { store, writes } = setup(cardOf(8));
  expect(await store.redeemWithCode()).toEqual({ ok: false, error: 'no-reward' });
  expect(writes).toHaveLength(0);
});

test('unreadable storage becomes unavailable and submissions fail without writing', async () => {
  const { store, storage, writes } = setup();
  storage.load = async () => { throw new Error('cannot read'); };
  await store.load();
  expect(store.getSnapshot().status).toBe('unavailable');
  expect(await store.submit([link()], 'qr')).toMatchObject({ kind: 'error', error: 'storage' });
  expect(await store.redeemWithCode()).toEqual({ ok: false, error: 'storage' });
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

test.each(['stamp', 'code', 'nfc'] as const)('save failure on %s leaves card unchanged', async (operation) => {
  const initial = cardOf(9);
  const { store, storage, raw } = setup(initial);
  await store.load();
  storage.save = async () => { throw new Error('full'); };
  if (operation === 'code') expect(await store.redeemWithCode()).toEqual({ ok: false, error: 'storage' });
  else if (operation === 'nfc') {
    const exchange = await store.tap([link(20, 1, 'redeem')]);
    expect(await exchange.finish(true)).toMatchObject({ kind: 'error', error: 'storage' });
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
  const exchange = await store.tap([link(20, 1, 'redeem')]);
  const events = await Promise.all([exchange.finish(true), exchange.finish(true)]);
  expect(events.map((e) => e.kind)).toEqual(['success', 'repeat']);
  expect(store.getSnapshot().card.events.filter((e) => e.kind === 'redeem')).toHaveLength(1);
  expect(JSON.parse(raw.get(CARD_KEY)!)).toEqual(store.getSnapshot().card);
  expect(writes).toHaveLength(1);
});
