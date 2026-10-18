import { describe, expect, it } from '@jest/globals';

import type { CardEvent } from '../../domain/card';
import { describeEvent, groupByMonth } from './history';

const stamp = (nonceId: string, year: number, month: number, day = 1): CardEvent => ({
  kind: 'stamp', count: 1, nonceId, at: new Date(year, month - 1, day, 12).getTime(),
});

describe('groupByMonth', () => {
  it('returns no sections for an empty ledger', () => {
    expect(groupByMonth([])).toEqual([]);
  });

  it('orders months and their events newest first without changing the ledger', () => {
    const events = Object.freeze([stamp('old', 2026, 9), stamp('early', 2026, 10, 2), stamp('latest', 2026, 10, 20)]);
    const sections = groupByMonth(events, 'en-AU');
    expect(sections.map((s) => ({ key: s.key, title: s.title, ids: s.data.map((e) => e.nonceId) }))).toEqual([
      { key: '2026-10', title: 'OCTOBER 2026', ids: ['latest', 'early'] },
      { key: '2026-09', title: 'SEPTEMBER 2026', ids: ['old'] },
    ]);
    expect(events.map((e) => e.nonceId)).toEqual(['old', 'early', 'latest']);
  });

  it('separates December and January across years, including repeated month names', () => {
    const sections = groupByMonth([stamp('dec', 2025, 12, 31), stamp('old-jan', 2025, 1), stamp('jan', 2026, 1)]);
    expect(sections.map((s) => s.key)).toEqual(['2026-01', '2025-12', '2025-01']);
  });

  it('keeps input order for equal timestamps', () => {
    const events = [stamp('first', 2026, 10), stamp('second', 2026, 10), stamp('third', 2026, 10)];
    expect(groupByMonth(events)[0].data).toEqual(events);
  });

  it('uses local calendar boundaries and the requested locale', () => {
    const event = { ...stamp('midnight', 2026, 1), at: new Date(2026, 0, 1, 0, 0).getTime() };
    expect(groupByMonth([event], 'fr-FR')[0]).toMatchObject({ key: '2026-01', title: 'JANVIER 2026' });
  });

  it('groups 10,000 events within a generous performance budget', () => {
    const events = Array.from({ length: 10_000 }, (_, i) => ({ ...stamp(String(i), 2026, 1), at: new Date(2026, 0, 1).getTime() + i * 3_600_000 }));
    const start = performance.now();
    const grouped = groupByMonth(events);
    const flattened = grouped.flatMap((section) => section.data);
    expect(flattened).toHaveLength(10_000);
    expect(flattened[0].nonceId).toBe('9999');
    expect(flattened[9999].nonceId).toBe('0');
    expect(performance.now() - start).toBeLessThan(3000);
  });
});

describe('describeEvent', () => {
  it.each([1, 2, 3, 50])('describes %i stamps', (count) => {
    expect(describeEvent({ ...stamp('stamp', 2026, 10), count }, 'free drink')).toEqual({
      title: count === 1 ? '1 stamp' : `${count} stamps`, kind: 'stamp',
    });
  });

  it('capitalizes the configured reward noun for a redemption', () => {
    expect(describeEvent({ kind: 'redeem', count: 1, at: 0, nonceId: 'reward' }, ' free coffee ')).toEqual({ title: 'Free coffee redeemed', kind: 'redeem' });
  });
});
