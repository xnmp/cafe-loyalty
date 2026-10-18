import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

/**
 * What a load found. `invalid` keeps the raw text so a caller can preserve
 * damaged data instead of silently overwriting it.
 */
export type Loaded<T> =
  | { readonly kind: 'missing' }
  | { readonly kind: 'ok'; readonly value: T }
  | { readonly kind: 'invalid'; readonly raw: string };

/**
 * JSON persistence. `parse` validates what comes back. `load` rejects only
 * when storage itself can't be read.
 */
export interface JsonStore {
  load<T>(key: string, parse: (value: unknown) => T | null): Promise<Loaded<T>>;
  save(key: string, value: unknown): Promise<void>;
  remove(key: string): Promise<void>;
}

export function interpret<T>(raw: string | null, parse: (value: unknown) => T | null): Loaded<T> {
  if (raw === null) return { kind: 'missing' };
  try {
    const value = parse(JSON.parse(raw));
    return value === null ? { kind: 'invalid', raw } : { kind: 'ok', value };
  } catch {
    return { kind: 'invalid', raw };
  }
}

/** The value if one was stored and valid, otherwise null. */
export const valueOf = <T>(loaded: Loaded<T>): T | null => (loaded.kind === 'ok' ? loaded.value : null);

/** Ordinary app data (card ledger, counter log). Included in OS backups. */
export const appStore: JsonStore = {
  async load(key, parse) {
    return interpret(await AsyncStorage.getItem(key), parse);
  },
  save: (key, value) => AsyncStorage.setItem(key, JSON.stringify(value)),
  remove: (key) => AsyncStorage.removeItem(key),
};

const SECURE_OPTIONS: SecureStore.SecureStoreOptions = {
  // Never migrates to another device via backup.
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

/** Secrets (counter-device signing key, staff PIN). Device-bound, not backed up. */
export const secureStore: JsonStore = {
  async load(key, parse) {
    try {
      return interpret(await SecureStore.getItemAsync(key, SECURE_OPTIONS), parse);
    } catch {
      // e.g. Keystore key lost after a restore: behave as if never set.
      return { kind: 'missing' };
    }
  },
  save: (key, value) => SecureStore.setItemAsync(key, JSON.stringify(value), SECURE_OPTIONS),
  remove: (key) => SecureStore.deleteItemAsync(key, SECURE_OPTIONS),
};
