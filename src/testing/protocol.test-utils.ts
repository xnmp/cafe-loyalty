// Deterministic fixtures shared only by protocol tests.
import { jest } from '@jest/globals';
// Only interpret is used; the AsyncStorage adapter must not load a native module.
jest.mock('@react-native-async-storage/async-storage', () => ({}));
import config from '../../cafe.config.json';
import { toBase64Url } from '../domain/bytes';
import { type Card, type StampEvent } from '../domain/card';
import type { CafeConfig } from '../domain/config';
import type { Result } from '../domain/result';
import { keyPairFromSeed, nonceId, signToken, type TokenClaims } from '../domain/token';
import { interpret, type JsonStore, type Loaded } from '../infra/storage';

export const now = 1_700_000_000_999;
export const seed = new Uint8Array(32).fill(3);
export const pair = keyPairFromSeed(seed);
export const keys = new Map([[1, pair.publicKey]]);
export const rules = { stampsPerReward: 9, maxStampsPerTap: 10 };
export const cafe: CafeConfig = { ...config, cafeId: 'test-cafe', scheme: 'testcafe', rules: { ...rules, rewardName: 'free drink' }, keys: [{ id: 1, publicKey: toBase64Url(pair.publicKey) }] };
export const ctx = { cafeId: cafe.cafeId, keys, rules, now };
export const nonce = (id: number): Uint8Array => {
  const bytes = new Uint8Array(12);
  new DataView(bytes.buffer).setUint32(8, id);
  return bytes;
};
export const token = (id = 1, count = 1, overrides: Partial<TokenClaims> = {}, cafeId = cafe.cafeId): Uint8Array =>
  signToken({ kind: 'stamp', keyId: 1, count, issuedAt: Math.floor(now / 1000), nonce: nonce(id), ...overrides }, pair.secretKey, cafeId);
export const stamp = (id: number, count: number, at = now + id): StampEvent => ({ kind: 'stamp', nonceId: nonceId(nonce(id)), count, at, proof: toBase64Url(token(id, count)) });
export const cardOf = (...counts: number[]): Card => ({ version: 2, events: counts.map((count, i) => stamp(i + 1, count)) });
export function value<T, E>(result: Result<T, E>): T {
  if (!result.ok) throw new Error(`Expected success: ${JSON.stringify(result.error)}`);
  return result.value;
}
export function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
export function memoryStorage(initial: Readonly<Record<string, string>> = {}) {
  const raw = new Map(Object.entries(initial));
  const writes: { key: string; value: unknown }[] = [];
  const storage: JsonStore = {
    async load<T>(key: string, parse: (v: unknown) => T | null): Promise<Loaded<T>> { return interpret(raw.get(key) ?? null, parse); },
    async save(key, data) { writes.push({ key, value: JSON.parse(JSON.stringify(data)) }); raw.set(key, JSON.stringify(data)); },
    async remove(key) { raw.delete(key); },
  };
  return { storage, raw, writes };
}
