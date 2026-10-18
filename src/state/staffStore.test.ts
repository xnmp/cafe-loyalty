import { expect, test } from '@jest/globals';

import { buildStaffCode, demoStaffCode } from '../domain/provisioning';
import { cafe, deferred, keys, memoryStorage, seed } from '../testing/protocol.test-utils';
import { createStaffStore } from './staffStore';

const realCode = buildStaffCode(cafe.cafeId, 1, seed);
const demoCode = demoStaffCode(cafe.cafeId);

function phone(storage = memoryStorage()) {
  const tagService: boolean[] = [];
  const store = createStaffStore({ storage: storage.storage, cafe, keys, randomBytes: (n) => new Uint8Array(n).fill(9), setTagServiceEnabled: (on) => { tagService.push(on); } });
  return { store, storage, tagService };
}

const counterOf = (store: ReturnType<typeof phone>['store']) => {
  const s = store.getSnapshot();
  if (s.status !== 'counter') throw new Error(`expected a counter, got ${s.status}`);
  return s.credentials;
};

test('the demo code makes a demo counter, and it stays one after a restart', async () => {
  const first = phone();
  await first.store.load();
  expect(await first.store.provision(demoCode, '1234')).toEqual({ ok: true, value: undefined });
  expect(counterOf(first.store)).toMatchObject({ keyId: 0, demo: true });

  const restarted = phone(first.storage);
  await restarted.store.load();
  expect(counterOf(restarted.store)).toMatchObject({ keyId: 0, demo: true });
});

test("a counter can't be set up again, even with the demo code, until it's left with its PIN", async () => {
  const { store } = phone();
  await store.load();
  await store.provision(realCode, '1234');
  expect(await store.provision(demoCode, '9999')).toEqual({ ok: false, error: 'already-counter' });
  expect(counterOf(store)).toMatchObject({ keyId: 1, demo: false });
  expect(store.checkPin('1234')).toBe(true);
  expect(store.checkPin('9999')).toBe(false);

  expect(await store.leaveCounterMode('1234')).toEqual({ ok: true, value: undefined });
  expect(await store.provision(demoCode, '9999')).toEqual({ ok: true, value: undefined });
  expect(counterOf(store).demo).toBe(true);
});

test('nothing is provisioned before the saved state has loaded', async () => {
  const { store } = phone();
  expect(await store.provision(realCode, '1234')).toEqual({ ok: false, error: 'already-counter' });
});

test('of two overlapping setups only the first wins, even while its save is slow', async () => {
  const storage = memoryStorage();
  const { store } = phone(storage);
  await store.load();
  const slow = deferred<void>();
  const save = storage.storage.save;
  storage.storage.save = async (key, data) => { await slow.promise; return save(key, data); };
  const first = store.provision(realCode, '1234');
  const second = store.provision(demoCode, '9999');
  slow.resolve();
  expect(await second).toEqual({ ok: false, error: 'already-counter' });
  expect(await first).toEqual({ ok: true, value: undefined });
  expect(counterOf(store)).toMatchObject({ keyId: 1, demo: false });

  const restarted = phone(storage);
  await restarted.store.load();
  expect(counterOf(restarted.store)).toMatchObject({ keyId: 1, demo: false });
  expect(restarted.store.checkPin('1234')).toBe(true);
});
