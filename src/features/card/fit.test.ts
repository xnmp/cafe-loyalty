import { describe, expect, test } from '@jest/globals';

import { COMFORTABLE_STAMP_SIZE, fitCard, headerHeightsAt, MIN_STAMP_SIZE, rememberHeaderHeight, type Fit, type FitInput, type HeaderMemo } from './fit';

/** A card screen: a body that is `rest` tall plus two rows of stamps, under one of two headers. */
interface Screen {
  readonly rest: number;
  readonly full: number;
  readonly compact: number;
}
const rows = 2;
const phone: Screen = { rest: 300, full: 150, compact: 96 };

const heightOf = (screen: Screen, fit: Fit) => (fit.compactHeader ? screen.compact : screen.full) + screen.rest + rows * fit.stampSize;

/** What the app's state holds between layouts. */
interface Measured {
  readonly memo: HeaderMemo;
  readonly body: FitInput['body'];
  /** The body height last laid out: React Native only reports a layout that changed. */
  readonly bodyHeight: number | null;
}
const nothingMeasured: Measured = { memo: { key: '', heights: {} }, body: null, bodyHeight: null };

/**
 * Lays the screen out the way the app does: render, report what was laid
 * out, fit again, until nothing changes. The header reports on every switch
 * (it's a new view per variant); the body only when its height changes.
 * `key` stands for the screen width and text size.
 */
function settle(screen: Screen, room: number, { widthLimit = 64, key = 'normal', start = nothingMeasured } = {}) {
  let { memo, body, bodyHeight } = start;
  const fitNow = () => fitCard({ widthLimit, room, header: headerHeightsAt(memo, key), body, rows });
  let fit = fitNow();
  for (let pass = 1; pass <= 5; pass++) {
    memo = rememberHeaderHeight(memo, key, fit.compactHeader ? 'compact' : 'full', fit.compactHeader ? screen.compact : screen.full);
    const height = screen.rest + rows * fit.stampSize;
    if (height !== bodyHeight) body = { height, stamp: fit.stampSize };
    bodyHeight = height;
    const next = fitNow();
    if (next.compactHeader === fit.compactHeader && next.stampSize === fit.stampSize) {
      return { fit, passes: pass, scrolls: heightOf(screen, fit) > room, measured: { memo, body, bodyHeight } };
    }
    fit = next;
  }
  throw new Error('layout never settled');
}

describe('fitCard', () => {
  test('starts with the full header and the widest stamps, before anything is measured', () => {
    expect(fitCard({ widthLimit: 64, room: 0, header: {}, body: null, rows })).toEqual({ compactHeader: false, stampSize: 64 });
    expect(fitCard({ widthLimit: 64, room: 600, header: { full: 150 }, body: null, rows })).toEqual({ compactHeader: false, stampSize: 64 });
  });

  test('keeps the full header and full-size stamps on a tall phone', () => {
    const { fit, scrolls } = settle(phone, 800);
    expect(fit).toEqual({ compactHeader: false, stampSize: 64 });
    expect(scrolls).toBe(false);
  });

  test('shrinks the stamps a little before touching the header', () => {
    const { fit, scrolls } = settle(phone, 560);
    expect(fit.compactHeader).toBe(false);
    expect(fit.stampSize).toBeGreaterThanOrEqual(COMFORTABLE_STAMP_SIZE);
    expect(fit.stampSize).toBeLessThan(64);
    expect(scrolls).toBe(false);
  });

  test('uses the compact header when the full one would squeeze the stamps', () => {
    const room = 500; // full header leaves 25 per stamp
    const { fit, scrolls } = settle(phone, room);
    expect(fit.compactHeader).toBe(true);
    expect(fit.stampSize).toBe(52);
    expect(scrolls).toBe(false);
  });

  test('settles within a few passes and stays put', () => {
    for (const room of [300, 450, 500, 517, 560, 640, 900]) {
      const { passes } = settle(phone, room);
      expect(passes).toBeLessThanOrEqual(3);
    }
  });

  test('goes back to the full header when the body gets shorter', () => {
    const before = settle(phone, 500);
    expect(before.fit.compactHeader).toBe(true);
    // The reward ticket was used: 100 less body, measured while the compact header shows.
    const after = settle({ ...phone, rest: 200 }, 500, { start: before.measured });
    expect(after.fit).toEqual({ compactHeader: false, stampSize: 64 });
    expect(after.scrolls).toBe(false);
  });

  test('goes back to the full header when the text gets smaller', () => {
    // Large text: taller headers and body, so the compact header was needed.
    const large = settle({ rest: 360, full: 230, compact: 130 }, 560, { key: 'large text' });
    expect(large.fit.compactHeader).toBe(true);
    // Back to normal text. The full header's old, taller height must not keep it compact.
    const normal = settle(phone, 560, { key: 'normal text', start: large.measured });
    expect(normal.fit.compactHeader).toBe(false);
    expect(normal.scrolls).toBe(false);
  });

  test('stops shrinking at the minimum and lets the screen scroll instead', () => {
    const { fit, scrolls } = settle(phone, 300);
    expect(fit).toEqual({ compactHeader: true, stampSize: MIN_STAMP_SIZE });
    expect(scrolls).toBe(true);
  });

  test('never makes stamps bigger than the width allows', () => {
    const { fit } = settle(phone, 2000, { widthLimit: 47 });
    expect(fit.stampSize).toBe(47);
  });

  test('keeps the full header on a narrow phone whose widest stamp is below comfortable', () => {
    const { fit, scrolls } = settle(phone, 560, { widthLimit: 44 });
    expect(fit).toEqual({ compactHeader: false, stampSize: 44 });
    expect(scrolls).toBe(false);
  });

  test('never exceeds a width limit that is itself below the minimum', () => {
    expect(settle(phone, 300, { widthLimit: 30 }).fit.stampSize).toBe(30);
  });

  test('passes through a zero width limit (not laid out yet)', () => {
    expect(fitCard({ widthLimit: 0, room: 500, header: { full: 150 }, body: { height: 800, stamp: 64 }, rows })).toEqual({ compactHeader: false, stampSize: 0 });
  });

  test('copes with nonsense measurements without producing a negative size', () => {
    const fit = fitCard({ widthLimit: 64, room: 100, header: { full: 5000, compact: 4000 }, body: { height: 99999, stamp: 64 }, rows });
    expect(fit).toEqual({ compactHeader: true, stampSize: MIN_STAMP_SIZE });
  });
});

describe('header heights', () => {
  test('are only used at the width and text size they were measured at', () => {
    const memo = rememberHeaderHeight({ key: '', heights: {} }, '360@1', 'full', 150);
    expect(headerHeightsAt(memo, '360@1')).toEqual({ full: 150 });
    expect(headerHeightsAt(memo, '360@1.3')).toEqual({});
    expect(headerHeightsAt(rememberHeaderHeight(memo, '360@1.3', 'compact', 120), '360@1.3')).toEqual({ compact: 120 });
  });

  test('keep both variants side by side', () => {
    const both = rememberHeaderHeight(rememberHeaderHeight({ key: '', heights: {} }, 'k', 'full', 150), 'k', 'compact', 96);
    expect(headerHeightsAt(both, 'k')).toEqual({ full: 150, compact: 96 });
  });

  test('come back unchanged when the same height is reported again, so nothing re-renders', () => {
    const memo = rememberHeaderHeight({ key: '', heights: {} }, 'k', 'full', 150);
    expect(rememberHeaderHeight(memo, 'k', 'full', 150)).toBe(memo);
  });
});
