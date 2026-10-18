import { beforeEach, expect, test } from '@jest/globals';

import type { RedemptionRegistry } from '../counterStore';

/** Shared observable contract for durable and in-memory registry implementations. */
export function registryContract(create: () => Promise<RedemptionRegistry> | RedemptionRegistry): void {
  let registry: RedemptionRegistry;
  beforeEach(async () => {
    registry = await create();
  });

  test('an empty registry has no prior redemption or spent stamps', async () => {
    expect(await registry.view('missing', ['a', 'b'])).toEqual({ prior: null, spent: new Map() });
    expect(await registry.view('missing', [])).toEqual({ prior: null, spent: new Map() });
  });

  test('records the original timestamp and sums spends within and across redemptions', async () => {
    expect(await registry.record({ requestId: 'first', at: 0, spends: [
      { nonceId: 'a', stamps: 2 }, { nonceId: 'a', stamps: 3 }, { nonceId: 'b', stamps: 1 },
    ] })).toBe('recorded');
    expect(await registry.record({ requestId: 'second', at: 200, spends: [{ nonceId: 'a', stamps: 4 }] })).toBe('recorded');
    expect(await registry.view('first', ['a', 'b', 'missing'])).toEqual({ prior: { at: 0 }, spent: new Map([['a', 9], ['b', 1]]) });
    expect(await registry.view('second', ['a'])).toEqual({ prior: { at: 200 }, spent: new Map([['a', 9]]) });
  });

  test('a duplicate request preserves its timestamp and inserts no spends', async () => {
    await registry.record({ requestId: 'first', at: 100, spends: [{ nonceId: 'a', stamps: 2 }] });
    expect(await registry.record({ requestId: 'first', at: 200, spends: [
      { nonceId: 'a', stamps: 5 }, { nonceId: 'b', stamps: 3 },
    ] })).toBe('duplicate');
    // Duplicate detection precedes spend insertion (and its constraints).
    expect(await registry.record({ requestId: 'first', at: 300, spends: [{ nonceId: 'c', stamps: 0 }] })).toBe('duplicate');
    expect(await registry.view('first', ['a', 'b', 'c'])).toEqual({ prior: { at: 100 }, spent: new Map([['a', 2]]) });
  });

  test('a failed spend leaves neither a redemption nor any partial spends, and can be retried', async () => {
    await registry.record({ requestId: 'earlier', at: 50, spends: [{ nonceId: 'a', stamps: 1 }] });
    await expect(registry.record({ requestId: 'failed', at: 100, spends: [
      { nonceId: 'a', stamps: 2 }, { nonceId: 'b', stamps: 0 },
    ] })).rejects.toThrow();
    expect(await registry.view('failed', ['a', 'b'])).toEqual({ prior: null, spent: new Map([['a', 1]]) });
    expect(await registry.record({ requestId: 'failed', at: 200, spends: [{ nonceId: 'b', stamps: 3 }] })).toBe('recorded');
    expect(await registry.view('failed', ['a', 'b'])).toEqual({ prior: { at: 200 }, spent: new Map([['a', 1], ['b', 3]]) });
  });

  test('only reports requested nonce ids, including duplicates and SQL metacharacters', async () => {
    const id = "nonce'); DROP TABLE spends; --";
    await registry.record({ requestId: "request'", at: 100, spends: [{ nonceId: id, stamps: 2 }, { nonceId: 'hidden', stamps: 3 }] });
    expect(await registry.view("request'", [id, 'missing', id])).toEqual({ prior: { at: 100 }, spent: new Map([[id, 2]]) });
    expect(await registry.view("request'", [])).toEqual({ prior: { at: 100 }, spent: new Map() });
    expect(await registry.view('other', ['hidden'])).toEqual({ prior: null, spent: new Map([['hidden', 3]]) });
  });

  test('handles a large requested nonce list without losing or double-counting spends', async () => {
    // Exceeds Node SQLite's default 32766-variable limit as well as older mobile limits.
    const ids = Array.from({ length: 33_000 }, (_, i) => `nonce-${i}`);
    await registry.record({ requestId: 'large', at: 100, spends: [
      { nonceId: ids[0], stamps: 1 }, { nonceId: ids[999], stamps: 2 }, { nonceId: ids[32_999], stamps: 3 },
    ] });
    expect(await registry.view('large', [...ids, ids[0]])).toEqual({
      prior: { at: 100 }, spent: new Map([[ids[0], 1], [ids[999], 2], [ids[32_999], 3]]),
    });
  });

  test('records a request with no spends', async () => {
    expect(await registry.record({ requestId: 'empty', at: 100, spends: [] })).toBe('recorded');
    expect(await registry.view('empty', ['a'])).toEqual({ prior: { at: 100 }, spent: new Map() });
    expect(await registry.record({ requestId: 'empty', at: 200, spends: [] })).toBe('duplicate');
  });

  test('does not retain mutable input or expose mutable stored state', async () => {
    const spend = { nonceId: 'a', stamps: 2 };
    const redemption = { requestId: 'first', at: 100, spends: [spend] };
    await registry.record(redemption);
    spend.stamps = 99;
    redemption.at = 999;
    const view = await registry.view('first', ['a']);
    // A returned Map can be mutated by a JavaScript consumer despite the readonly port type.
    (view.spent as Map<string, number>).set('a', 50);
    expect(await registry.view('first', ['a'])).toEqual({ prior: { at: 100 }, spent: new Map([['a', 2]]) });
  });
}
