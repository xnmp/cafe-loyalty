import { expect, jest, test } from '@jest/globals';

import { buildAckLink, buildRedeemLink } from '../domain/link';
import { decodeMessage, encodeUriMessage, messageUris } from '../domain/ndef';
import { planRedemption, type RegistryView } from '../domain/redemption';
import { cafe, cardOf, deferred, keys, memoryStorage, nonce, now, pair, seed, stamp, token } from '../testing/protocol.test-utils';
import { COUNTER_KEY, createCounterStore, type CounterStore, type OfferOutcome, type RedemptionRegistry } from './counterStore';
import { createMemoryRegistry } from './testing/memoryRegistry';

const credentials = { keyId: 1, ...pair, seed, demo: false };
const plan = planRedemption(cardOf(4, 5), cafe.rules)!;
const code = buildRedeemLink(cafe.scheme, plan.request);
function setup(available = true, registry = createMemoryRegistry()) {
  const fake = memoryStorage();
  let time = now;
  let nextNonce = 100;
  const tag = { available: () => available, serve: jest.fn<(id: string, ndef: Uint8Array) => void>(), stop: jest.fn<() => void>() };
  const store = createCounterStore({ storage: fake.storage, registry, cafe, keys, now: () => time, randomBytes: () => nonce(nextNonce++), tag });
  return { ...fake, store, tag, registry, setTime: (next: number) => { time = next; } };
}
const active = (store: CounterStore) => {
  const offer = store.getSnapshot().offer;
  if (!offer) throw new Error('Expected active offer');
  return offer;
};
// Await the observable transition: no timers or assumed number of microtasks.
function done(store: CounterStore): Promise<OfferOutcome> {
  return new Promise((resolve) => {
    const inspect = () => {
      const offer = store.getSnapshot().offer;
      if (offer?.phase === 'done' && offer.outcome) { unsubscribe(); resolve(offer.outcome); }
    };
    const unsubscribe = store.subscribe(inspect);
    inspect();
  });
}
const writeCode = (store: CounterStore, text = code) => store.onTagWrite(active(store).record.nonceId, encodeUriMessage(text));
const writeAck = (store: CounterStore, status: 'stamped' | 'no-reward' = 'stamped', id = active(store).record.nonceId) =>
  writeCode(store, buildAckLink(cafe.scheme, { nonceId: id, status, progress: 4, rewardsAvailable: 0 }));

test('offers ignored until load resolves, then served as the actual NDEF token', async () => {
  const { store, storage, tag } = setup();
  const gate = deferred<void>();
  const original = storage.load;
  storage.load = async (key, parse) => { await gate.promise; return original(key, parse); };
  store.offer(credentials, 'stamp', 3);
  const loading = store.load();
  store.offer(credentials, 'stamp', 3);
  expect(store.getSnapshot().offer).toBeNull();
  expect(tag.serve).not.toHaveBeenCalled();
  gate.resolve();
  await loading;
  store.offer(credentials, 'stamp', 3);
  const offer = active(store);
  expect(offer).toMatchObject({ nfc: true, qrVisible: false, phase: 'waiting' });
  expect(tag.serve).toHaveBeenCalledTimes(1);
  const [id, bytes] = tag.serve.mock.calls[0];
  expect(id).toBe(offer.record.nonceId);
  expect(messageUris(decodeMessage(bytes)!)).toEqual([offer.link]);
});

test.each(['stamp', 'redeem'] as const)('without NFC, %s offers show only the appropriate QR', async (kind) => {
  const { store, tag } = setup(false);
  await store.load();
  store.offer(credentials, kind, 1);
  expect(active(store)).toMatchObject({ nfc: false, qrVisible: kind === 'stamp' });
  expect(tag.serve).not.toHaveBeenCalled();
  expect(tag.stop).toHaveBeenCalled();
  store.showQr();
  expect(active(store).qrVisible).toBe(kind === 'stamp');
});

test('stamp ack must match the offer nonce, finishes it, persists delivery evidence and stops tag', async () => {
  const { store, tag, raw } = setup();
  await store.load();
  store.offer(credentials, 'stamp', 3);
  const id = active(store).record.nonceId;
  writeAck(store, 'stamped', cardOf(1).events[0].nonceId);
  expect(active(store).phase).toBe('waiting');
  store.onTagRead('unrelated');
  expect(active(store).phase).toBe('waiting');
  store.onTagRead(id);
  expect(active(store)).toMatchObject({ phase: 'read', readAt: now });
  writeAck(store);
  expect(active(store)).toMatchObject({ phase: 'done', outcome: { kind: 'ack', ack: { nonceId: id, status: 'stamped' } } });
  expect(store.getSnapshot().log.issued[0]).toMatchObject({ status: 'acked', ack: { status: 'stamped' } });
  expect(JSON.parse(raw.get(COUNTER_KEY)!)).toEqual(store.getSnapshot().log);
  expect(tag.stop).toHaveBeenCalled();
});

test('NFC redemption passes through checking, records registry/log and stops tag', async () => {
  const { store, tag, registry, raw } = setup();
  const phases: string[] = [];
  store.subscribe(() => { const offer = store.getSnapshot().offer; if (offer) phases.push(offer.phase); });
  await store.load();
  store.offer(credentials, 'redeem', 1);
  const completed = done(store);
  writeCode(store);
  expect(active(store).phase).toBe('checking');
  expect(await completed).toEqual({ kind: 'verified', at: now });
  expect(phases).toEqual(expect.arrayContaining(['checking', 'done']));
  const view = await registry.view(plan.request.requestId, plan.spends.map((s) => s.nonceId));
  expect(view.prior).toEqual({ at: now });
  expect(view.spent).toEqual(new Map(plan.spends.map((s) => [s.nonceId, s.stamps])));
  expect(store.getSnapshot().log.redemptions).toEqual([{ requestId: plan.request.requestId, at: now }]);
  expect(JSON.parse(raw.get(COUNTER_KEY)!)).toEqual(store.getSnapshot().log);
  expect(tag.stop).toHaveBeenCalled();
});

test('re-showing the same code in a later offer is refused with original time', async () => {
  const { store, setTime } = setup();
  await store.load();
  store.offer(credentials, 'redeem', 1);
  await store.scanCode(code);
  setTime(now + 1);
  store.offer(credentials, 'redeem', 1);
  await store.scanCode(code);
  expect(active(store).outcome).toEqual({ kind: 'refused', reason: 'already-redeemed', at: now });
  expect(store.getSnapshot().log.redemptions).toHaveLength(1);
});

test('a finished offer ignores further requests and records the redemption once', async () => {
  const { store, registry } = setup();
  await store.load();
  store.offer(credentials, 'redeem', 1);
  const first = done(store);
  writeCode(store);
  await first;
  writeCode(store);
  expect(await store.scanCode(code)).toBe('ignored');
  expect(active(store)).toMatchObject({ phase: 'done', outcome: { kind: 'verified', at: now } });
  expect(store.getSnapshot().log.redemptions).toHaveLength(1);
  expect((await registry.view(plan.request.requestId, plan.spends.map((s) => s.nonceId))).prior).toEqual({ at: now });
});

test.each([0, -1000])('new offers refuse an old request when clock changes by %i ms', async (offset) => {
  const { store, setTime } = setup();
  await store.load();
  store.offer(credentials, 'redeem', 1);
  await store.scanCode(code);
  setTime(now + offset);
  store.offer(credentials, 'redeem', 1);
  await store.scanCode(code);
  expect(active(store).outcome).toEqual({ kind: 'refused', reason: 'already-redeemed', at: now });
});

test('forged redemption proofs are refused, with no registry spend or redemption log', async () => {
  const { store, registry } = setup();
  await store.load();
  store.offer(credentials, 'redeem', 1);
  const forged = token(1, 9).slice();
  forged[83] ^= 1;
  const request = { requestId: plan.request.requestId, proofs: [forged] };
  const completed = done(store);
  writeCode(store, buildRedeemLink(cafe.scheme, request));
  expect(await completed).toEqual({ kind: 'refused', reason: 'invalid' });
  expect((await registry.view(request.requestId, plan.spends.map((s) => s.nonceId))).prior).toBeNull();
  expect(store.getSnapshot().log.redemptions).toEqual([]);
});

test('stamped ack cannot redeem a reward; no-reward ack refuses with reported progress', async () => {
  const { store, tag } = setup();
  await store.load();
  store.offer(credentials, 'redeem', 1);
  writeAck(store);
  expect(active(store)).toMatchObject({ phase: 'waiting', outcome: null });
  expect(tag.stop).not.toHaveBeenCalled();
  writeAck(store, 'no-reward');
  expect(active(store).outcome).toEqual({ kind: 'refused', reason: 'no-reward', progress: 4 });
  expect(store.getSnapshot().log.redemptions).toEqual([]);
  expect(tag.stop).toHaveBeenCalled();
});

test('scanCode accepts redemption codes only during an open redeem offer and garbage keeps it open', async () => {
  const { store } = setup(false);
  expect(await store.scanCode(code)).toBe('ignored');
  await store.load();
  store.offer(credentials, 'stamp', 1);
  expect(await store.scanCode(code)).toBe('ignored');
  store.offer(credentials, 'redeem', 1);
  for (const input of ['', 'garbage', '!'.repeat(100000), buildAckLink(cafe.scheme, { nonceId: active(store).record.nonceId, status: 'stamped', progress: 0, rewardsAvailable: 1 })]) {
    expect(await store.scanCode(input)).toBe('not-a-code');
    expect(active(store).phase).toBe('waiting');
  }
  expect(await store.scanCode(code)).toBe('checked');
  expect(active(store).outcome).toEqual({ kind: 'verified', at: now });
});

test('checks serialize concurrent requests sharing a copied proof', async () => {
  const memory = createMemoryRegistry();
  const entered = deferred<void>();
  const release = deferred<void>();
  let views = 0;
  const registry: RedemptionRegistry = {
    async view(requestId, ids) {
      views++;
      if (views === 1) { entered.resolve(); await release.promise; }
      return memory.view(requestId, ids);
    },
    record: (r) => memory.record(r),
  };
  const { store, setTime } = setup(false, registry);
  await store.load();
  store.offer(credentials, 'redeem', 1);
  const first = store.scanCode(code);
  await entered.promise;
  setTime(now + 1);
  store.offer(credentials, 'redeem', 1);
  const copiedRequest = planRedemption({ version: 2, events: [stamp(1, 4), stamp(3, 5)] }, cafe.rules)!.request;
  expect(copiedRequest.requestId).not.toBe(plan.request.requestId);
  const second = store.scanCode(buildRedeemLink(cafe.scheme, copiedRequest));
  expect(active(store).phase).toBe('checking');
  expect(views).toBe(1);
  release.resolve();
  expect(await Promise.all([first, second])).toEqual(['checked', 'checked']);
  expect(views).toBe(2);
  expect(active(store).outcome).toEqual({ kind: 'refused', reason: 'stamps-used' });
  expect((await memory.view(plan.request.requestId, plan.spends.map((s) => s.nonceId))).spent).toEqual(new Map(plan.spends.map((s) => [s.nonceId, s.stamps])));
  expect(store.getSnapshot().log.redemptions).toHaveLength(1);
});

test.each(['view', 'record'] as const)('registry %s failure refuses as unavailable', async (method) => {
  const registry = createMemoryRegistry();
  registry[method] = async () => { throw new Error('unavailable'); };
  const { store } = setup(true, registry);
  await store.load();
  store.offer(credentials, 'redeem', 1);
  await store.scanCode(code);
  expect(active(store).outcome).toEqual({ kind: 'refused', reason: 'unavailable' });
  expect(store.getSnapshot().log.redemptions).toEqual([]);
});

test('cancel and dismiss cannot close an offer while verification is pending', async () => {
  const memory = createMemoryRegistry();
  const gate = deferred<RegistryView>();
  const { store, tag } = setup(true, { view: () => gate.promise, record: (r) => memory.record(r) });
  await store.load();
  store.offer(credentials, 'redeem', 1);
  const checking = store.scanCode(code);
  const id = active(store).record.nonceId;
  const stopped = tag.stop.mock.calls.length;
  store.cancel();
  store.dismiss();
  expect(active(store)).toMatchObject({ phase: 'checking', record: { nonceId: id } });
  expect(tag.stop).toHaveBeenCalledTimes(stopped);
  gate.resolve({ prior: null, spent: new Map() });
  await checking;
  expect(active(store).outcome).toMatchObject({ kind: 'verified' });
  store.dismiss();
  expect(store.getSnapshot().offer).toBeNull();
});

test('unreadable storage still becomes ready but never overwrites the unreadable log', async () => {
  const { store, storage, writes, raw } = setup();
  raw.set(COUNTER_KEY, 'unreadable data');
  storage.load = async () => { throw new Error('cannot read'); };
  await store.load();
  expect(store.getSnapshot().status).toBe('ready');
  store.offer(credentials, 'stamp', 1);
  writeAck(store);
  store.offer(credentials, 'redeem', 1);
  await store.scanCode(code);
  expect(store.getSnapshot().log.redemptions).toHaveLength(1);
  expect(writes).toHaveLength(0);
  expect(raw.get(COUNTER_KEY)).toBe('unreadable data');
});
