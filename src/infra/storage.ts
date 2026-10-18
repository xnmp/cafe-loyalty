import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

/**
 * JSON persistence. `parse` validates what comes back; anything unreadable is
 * treated as absent rather than crashing the app.
 */
export interface JsonStore {
  load<T>(key: string, parse: (value: unknown) => T | null): Promise<T | null>;
  save(key: string, value: unknown): Promise<void>;
  remove(key: string): Promise<void>;
}

const safeParse = (raw: string | null): unknown => {
  if (raw === null) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

/** Ordinary app data (card ledger, counter log). Included in OS backups. */
export const appStore: JsonStore = {
  async load(key, parse) {
    return parse(safeParse(await AsyncStorage.getItem(key)));
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
      return parse(safeParse(await SecureStore.getItemAsync(key, SECURE_OPTIONS)));
    } catch {
      // e.g. Keystore key lost after a restore: behave as if never set.
      return null;
    }
  },
  save: (key, value) => SecureStore.setItemAsync(key, JSON.stringify(value), SECURE_OPTIONS),
  remove: (key) => SecureStore.deleteItemAsync(key, SECURE_OPTIONS),
};
