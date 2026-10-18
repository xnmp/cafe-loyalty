import { describe, expect, it } from '@jest/globals';

import { acceptScan } from './scanThrottle';

describe('QR scan repeat window', () => {
  it('accepts the same code again at exactly 2.5 seconds', () => {
    const recent = acceptScan(new Map(), 'code', 100)!;
    expect(acceptScan(recent, 'code', 2599)).toBeNull();
    expect(acceptScan(recent, 'code', 2600)?.get('code')).toBe(2600);
    expect(recent.get('code')).toBe(100);
  });

  it('accepts different codes without allowing alternating repeat scans', () => {
    const a = acceptScan(new Map(), 'a', 0)!;
    const b = acceptScan(a, 'b', 10)!;
    expect(b.get('b')).toBe(10);
    expect(acceptScan(b, 'a', 20)).toBeNull();
  });

  it('expires old entries and safely handles empty or large scan data', () => {
    const recent = acceptScan(new Map([['expired', 0]]), '', 3000)!;
    expect(recent.has('expired')).toBe(false);
    expect(acceptScan(recent, 'a'.repeat(10000), 3001)?.size).toBe(2);
  });
});
