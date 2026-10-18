import { getRandomBytes } from 'expo-crypto';

/** Cryptographically secure random bytes from the platform CSPRNG. */
export const randomBytes = (length: number): Uint8Array => getRandomBytes(length);
