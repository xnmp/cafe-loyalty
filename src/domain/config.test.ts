import { expect, test } from '@jest/globals';

import realConfig from '../../cafe.config.json';
import { toBase64Url } from './bytes';
import { keyRingOf, validateConfig, type CafeConfig } from './config';
import { keyPairFromSeed } from './token';

type Mutable<T> = { -readonly [K in keyof T]: T[K] extends readonly (infer U)[] ? Mutable<U>[] : T[K] extends object ? Mutable<T[K]> : T[K] };
const copy = (): Mutable<CafeConfig> => JSON.parse(JSON.stringify(realConfig));

test('the real cafe.config.json validates', () => {
  expect(validateConfig(realConfig)).toEqual({ ok: true, value: realConfig });
});

const mutations: readonly [string, (config: Mutable<CafeConfig>) => void][] = [
  ['cafeId', (c) => { c.cafeId = 'Upper_Cafe'; }],
  ['name', (c) => { c.name = '  '; }],
  ['shortName', (c) => { c.shortName = ''; }],
  ['scheme', (c) => { c.scheme = '1Cafe'; }],
  ['bundleId', (c) => { c.bundleId = 'invalid'; }],
  ['rules.stampsPerReward', (c) => { c.rules.stampsPerReward = 1; }],
  ['rules.stampsPerReward', (c) => { c.rules.stampsPerReward = 21; }],
  ['rules.stampsPerReward', (c) => { c.rules.stampsPerReward = 9.5; }],
  ['rules.maxStampsPerTap', (c) => { c.rules.maxStampsPerTap = 0; }],
  ['rules.maxStampsPerTap', (c) => { c.rules.maxStampsPerTap = 51; }],
  ['rules.maxStampsPerTap', (c) => { c.rules.maxStampsPerTap = 1.5; }],
  ['rules.rewardName', (c) => { c.rules.rewardName = ''; }],
  ['keys', (c) => { c.keys = []; }],
  ...[-1, 256, 1.5].map((id): [string, (config: Mutable<CafeConfig>) => void] => ['key id', (c) => { c.keys[0].id = id; }]),
  ['duplicate key id', (c) => { c.keys.push({ ...c.keys[0] }); }],
  ...['!', '', toBase64Url(new Uint8Array(31)), toBase64Url(new Uint8Array(33))].map((publicKey): [string, (config: Mutable<CafeConfig>) => void] => ['publicKey', (c) => { c.keys[0].publicKey = publicKey; }]),
];

test.each(mutations)('reports a problem for invalid %s (%#)', (field, mutate) => {
  const config = copy();
  mutate(config);
  const before = JSON.stringify(config);
  const result = validateConfig(config);
  expect(result.ok).toBe(false);
  if (result.ok) throw new Error(`Invalid ${field} unexpectedly accepted`);
  expect(result.error.some((problem) => problem.includes(field))).toBe(true);
  expect(JSON.stringify(config)).toBe(before);
});

const paletteKeys = ['background', 'surface', 'paper', 'ink', 'inkMuted', 'line', 'accent', 'onAccent', 'success', 'danger'] as const;
test.each((['light', 'dark'] as const).flatMap((mode) => paletteKeys.map((key) => [mode, key] as const)))('validates palette field theme.%s.%s', (mode, key) => {
  const config = copy();
  config.theme[mode][key] = '#abc';
  const result = validateConfig(config);
  expect(result.ok).toBe(false);
  if (result.ok) throw new Error('Invalid colour unexpectedly accepted');
  expect(result.error).toContain(`theme.${mode}.${key} must be a #rrggbb colour`);
});

test('collects multiple config problems in one result', () => {
  const config = copy();
  config.name = '';
  config.scheme = '?';
  config.keys = [];
  const result = validateConfig(config);
  if (result.ok) throw new Error('Invalid config unexpectedly accepted');
  expect(result.error).toEqual(expect.arrayContaining([expect.stringContaining('name'), expect.stringContaining('scheme'), expect.stringContaining('keys')]));
});

test.each([
  [2, 1], [20, 50],
])('accepts rule boundaries: %i stamps per reward and %i per tap', (stampsPerReward, maxStampsPerTap) => {
  const config = copy();
  config.rules.stampsPerReward = stampsPerReward;
  config.rules.maxStampsPerTap = maxStampsPerTap;
  expect(validateConfig(config).ok).toBe(true);
});

test('keyRingOf keeps every valid key, including id boundaries', () => {
  const config = copy();
  const pairs = [0, 1, 255].map((id) => ({ id, pair: keyPairFromSeed(new Uint8Array(32).fill(id)) }));
  config.keys = pairs.map(({ id, pair }) => ({ id, publicKey: toBase64Url(pair.publicKey) }));
  expect(validateConfig(config).ok).toBe(true);
  const ring = keyRingOf(config);
  expect(ring.size).toBe(3);
  for (const { id, pair } of pairs) expect(ring.get(id)).toEqual(pair.publicKey);
});
