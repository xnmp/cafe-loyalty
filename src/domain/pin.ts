import nacl from 'tweetnacl';

import { bytesEqual, concatBytes, fromBase64Url, toBase64Url, utf8Encode } from './bytes';

/**
 * Staff PIN. Guards leaving staff mode and settings on the counter device, so
 * a customer can't wander off with it. Not a strong secret (4–8 digits);
 * hashing just keeps it out of plain sight in storage.
 */

export const PIN_PATTERN = /^\d{4,8}$/;
const ITERATIONS = 2000;

export interface PinRecord {
  readonly version: 1;
  readonly salt: string;
  readonly hash: string;
  readonly iterations: number;
}

export const isValidPin = (pin: string): boolean => PIN_PATTERN.test(pin);

function derive(pin: string, salt: Uint8Array, iterations: number): Uint8Array {
  let h = nacl.hash(concatBytes(salt, utf8Encode(pin)));
  for (let i = 1; i < iterations; i++) h = nacl.hash(concatBytes(h, salt));
  return h;
}

export function createPinRecord(pin: string, salt: Uint8Array): PinRecord {
  if (!isValidPin(pin)) throw new RangeError('PIN must be 4–8 digits');
  return { version: 1, salt: toBase64Url(salt), hash: toBase64Url(derive(pin, salt, ITERATIONS)), iterations: ITERATIONS };
}

export function verifyPin(pin: string, record: PinRecord): boolean {
  const salt = fromBase64Url(record.salt);
  const expected = fromBase64Url(record.hash);
  if (!salt || !expected || !isValidPin(pin)) return false;
  return bytesEqual(derive(pin, salt, record.iterations), expected);
}

export function parsePinRecord(value: unknown): PinRecord | null {
  if (typeof value !== 'object' || value === null) return null;
  const v = value as Partial<PinRecord>;
  return v.version === 1 &&
    typeof v.salt === 'string' &&
    typeof v.hash === 'string' &&
    typeof v.iterations === 'number' &&
    Number.isInteger(v.iterations) &&
    v.iterations > 0 &&
    v.iterations <= 100_000
    ? (v as PinRecord)
    : null;
}
