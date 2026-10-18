import { fromBase64Url } from '../../src/domain/bytes';
import type { CafeConfig } from '../../src/domain/config';
import { DEMO_PUBLIC_KEY, demoStaffCode } from '../../src/domain/provisioning';
import { addPublicKey, nextKeyId, removeKey, renderProvisioningPage } from './cafeKeys';

const fixture = (ids: readonly number[]): CafeConfig => ({
  cafeId: 'test-cafe', name: 'Test Café', shortName: 'Test Café', tagline: '', scheme: 'testcafe', bundleId: 'com.test.cafe',
  rules: { stampsPerReward: 8, maxStampsPerTap: 1, rewardName: 'drink' },
  contact: { address: '', hours: [], phone: '', website: '', instagram: '' },
  theme: { light: {} as CafeConfig['theme']['light'], dark: {} as CafeConfig['theme']['dark'] },
  keys: ids.map((id) => ({ id, publicKey: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' })),
});

describe('nextKeyId', () => {
  test.each([
    [[], 1], [[0], 1], [[4, 1, 7], 8], [[254], 255],
  ])('allocates above the highest existing id: %j', (ids, expected) => {
    expect(nextKeyId(fixture(ids))).toBe(expected);
  });
  test('refuses exhausted ids even when there are gaps', () => {
    expect(() => nextKeyId(fixture([255, 1]))).toThrow(/255/);
  });
});

describe('addPublicKey', () => {
  test('appends a base64url public key without changing the config or supplied bytes', () => {
    const config = fixture([1]);
    const before = JSON.stringify(config);
    Object.freeze(config.keys[0]);
    Object.freeze(config.keys);
    Object.freeze(config);
    const bytes = new Uint8Array(32).fill(255);
    const result = addPublicKey(config, 2, bytes);
    expect(result.keys.map((key) => key.id)).toEqual([1, 2]);
    expect(result.keys[1].publicKey).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(fromBase64Url(result.keys[1].publicKey)).toEqual(bytes);
    expect(bytes).toEqual(new Uint8Array(32).fill(255));
    expect(JSON.stringify(config)).toBe(before);
    bytes.fill(0);
    expect(fromBase64Url(result.keys[1].publicKey)).toEqual(new Uint8Array(32).fill(255));
  });
  test('rejects duplicate ids', () => {
    expect(() => addPublicKey(fixture([1]), 1, new Uint8Array(32))).toThrow(/already exists/);
  });
  test.each([-1, 0, 256, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER])('rejects invalid id %s', (id) => {
    expect(() => addPublicKey(fixture([1]), id, new Uint8Array(32))).toThrow(/1–255/);
  });
  test('refuses to trust the public demo key', () => {
    expect(() => addPublicKey(fixture([1]), 2, DEMO_PUBLIC_KEY)).toThrow(/demo key/);
  });
  test.each([0, 31, 33, 100_000])('rejects public key length %s', (length) => {
    expect(() => addPublicKey(fixture([1]), 2, new Uint8Array(length))).toThrow(/32 bytes/);
  });
});

describe('removeKey', () => {
  test('removes only the selected key without mutating the original', () => {
    const config = fixture([1, 2, 3]);
    const before = JSON.stringify(config);
    Object.freeze(config.keys);
    Object.freeze(config);
    const result = removeKey(config, 2);
    expect(result.keys.map((key) => key.id)).toEqual([1, 3]);
    expect(result.name).toBe(config.name);
    expect(JSON.stringify(config)).toBe(before);
  });
  test('refuses removal of the last key', () => {
    expect(() => removeKey(fixture([1]), 1)).toThrow(/last key/);
  });
  test.each([{ ids: [] }, { ids: [1] }, { ids: [1, 2] }])('rejects missing id in $ids', ({ ids }) => {
    expect(() => removeKey(fixture(ids), 9)).toThrow(/does not exist/);
  });
});

describe('renderProvisioningPage', () => {
  const page = { cafeName: 'Test Café', cafeId: 'test-cafe', keyId: 2, staffCode: 'CAFESTAFF1.test-cafe.2.seed',
    qrSvg: '<svg viewBox="0 0 1 1"><path d="M0 0h1v1H0z"/></svg>', generatedAt: '2026-10-18T00:00:00.000Z' };

  test('contains printable inline QR, metadata, instructions, warning, and manual code', () => {
    const html = renderProvisioningPage(page);
    for (const text of [page.cafeName, page.cafeId, page.generatedAt, page.staffCode, page.qrSvg,
      'Key id: 2', '6cm', '@media print', 'monospace', 'Install the app on the counter phone',
      'Open About', 'Press and hold the version number', 'Scan staff code', 'scan this code',
      'Choose a 4-digit staff PIN', 'Anyone with this code can issue stamps', 'Keep it private', 'Store it like a key']) {
      expect(html).toContain(text);
    }
    expect(html).not.toMatch(/<(script|link|img)\b|@import|url\(/i);
  });
  test('only the demo code itself is called safe to share', () => {
    const demoCode = demoStaffCode(page.cafeId);
    const demo = renderProvisioningPage({ ...page, keyId: 0, staffCode: demoCode });
    for (const text of ['Counter mode demo', 'Key id: 0 (demo)', 'safe to share', 'reject its stamps', demoCode, 'Scan staff code']) {
      expect(demo).toContain(text);
    }
    expect(demo).not.toContain('PRIVATE KEY');
    for (const staffCode of [page.staffCode, demoStaffCode('other-cafe')]) {
      const html = renderProvisioningPage({ ...page, keyId: 0, staffCode });
      expect(html).toContain('PRIVATE KEY');
      expect(html).not.toContain('safe to share');
    }
  });
  test('escapes every text field while preserving the trusted QR SVG markup', () => {
    const unsafe = `<script>&"'`;
    const escaped = '&lt;script&gt;&amp;&quot;&#39;';
    const html = renderProvisioningPage({ ...page, cafeName: unsafe, cafeId: unsafe, staffCode: unsafe, generatedAt: unsafe });
    expect(html).not.toContain(unsafe);
    expect(html.match(new RegExp(escaped, 'g'))).toHaveLength(5);
    expect(html).toContain(page.qrSvg);
  });
});
import { describe, expect, test } from '@jest/globals';

