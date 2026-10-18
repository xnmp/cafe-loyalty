import type { CafeConfig } from '../domain/config';
import { createPinRecord, isValidPin, parsePinRecord, verifyPin, type PinRecord } from '../domain/pin';
import { parseStaffCode, type StaffCodeError, type StaffCredentials } from '../domain/provisioning';
import { err, ok, type Result } from '../domain/result';
import type { KeyRing } from '../domain/token';
import { valueOf, type JsonStore } from '../infra/storage';
import { createStore, type Store } from './store';

/**
 * Whether this device is a customer's phone or the café's counter device, and
 * the counter device's credentials. The staff code (holding the signing seed)
 * is re-validated against the configured public keys on every launch, so
 * retiring a key in cafe.config.json and shipping an update de-provisions old
 * counter devices automatically.
 */

export const STAFF_KEY = 'staff.v1';

interface Persisted {
  readonly version: 1;
  readonly staffCode: string;
  readonly pin: PinRecord;
}

export type StaffState =
  | { readonly status: 'loading' }
  | { readonly status: 'customer'; readonly revoked: boolean }
  | { readonly status: 'counter'; readonly credentials: StaffCredentials; readonly pin: PinRecord };

export interface StaffStoreDeps {
  readonly storage: JsonStore;
  readonly cafe: CafeConfig;
  readonly keys: KeyRing;
  readonly randomBytes: (n: number) => Uint8Array;
  /** Enables/disables the HCE service component (no-op where unsupported). */
  readonly setTagServiceEnabled: (enabled: boolean) => void;
}

export interface StaffStore extends Store<StaffState> {
  load(): Promise<void>;
  /** Validates a scanned/pasted staff code without saving anything. */
  checkCode(code: string): Result<StaffCredentials, StaffCodeError>;
  /** Customer phones only: a counter must be left (with its PIN) before it can be set up again. */
  provision(code: string, pin: string): Promise<Result<void, StaffCodeError | 'invalid-pin' | 'already-counter'>>;
  checkPin(pin: string): boolean;
  changePin(current: string, next: string): Promise<Result<void, 'wrong-pin' | 'invalid-pin'>>;
  /** Turns this device back into a customer phone. Requires the PIN. */
  leaveCounterMode(pin: string): Promise<Result<void, 'wrong-pin'>>;
}

function parsePersisted(value: unknown): Persisted | null {
  if (typeof value !== 'object' || value === null) return null;
  const v = value as Partial<Persisted>;
  const pin = parsePinRecord(v.pin);
  return v.version === 1 && typeof v.staffCode === 'string' && pin ? { version: 1, staffCode: v.staffCode, pin } : null;
}

export function createStaffStore(deps: StaffStoreDeps): StaffStore {
  const store = createStore<StaffState>({ status: 'loading' });
  const expected = { cafeId: deps.cafe.cafeId, keys: deps.keys };

  const persist = (staffCode: string, pin: PinRecord) =>
    deps.storage.save(STAFF_KEY, { version: 1, staffCode, pin } satisfies Persisted);

  // Claimed synchronously, so two overlapping setups can't both pass the customer check.
  let enrolling = false;

  const current = () => {
    const s = store.getSnapshot();
    return s.status === 'counter' ? s : null;
  };

  return {
    ...store,

    async load() {
      const saved = valueOf(await deps.storage.load(STAFF_KEY, parsePersisted));
      if (!saved) {
        deps.setTagServiceEnabled(false);
        store.set({ status: 'customer', revoked: false });
        return;
      }
      const creds = parseStaffCode(saved.staffCode, expected);
      if (!creds.ok) {
        await deps.storage.remove(STAFF_KEY);
        deps.setTagServiceEnabled(false);
        store.set({ status: 'customer', revoked: true });
        return;
      }
      deps.setTagServiceEnabled(true);
      store.set({ status: 'counter', credentials: creds.value, pin: saved.pin });
    },

    checkCode: (code) => parseStaffCode(code, expected),

    async provision(code, pin) {
      // Otherwise anyone at an unlocked counter could swap in the public demo code and lock the café out.
      if (enrolling || store.getSnapshot().status !== 'customer') return err('already-counter');
      const creds = parseStaffCode(code, expected);
      if (!creds.ok) return creds;
      if (!isValidPin(pin)) return err('invalid-pin');
      enrolling = true;
      try {
        const record = createPinRecord(pin, deps.randomBytes(16));
        await persist(code.trim(), record);
        deps.setTagServiceEnabled(true);
        store.set({ status: 'counter', credentials: creds.value, pin: record });
        return ok(undefined);
      } finally {
        enrolling = false;
      }
    },

    checkPin(pin) {
      const s = current();
      return s !== null && verifyPin(pin, s.pin);
    },

    async changePin(currentPin, next) {
      const s = current();
      if (!s || !verifyPin(currentPin, s.pin)) return err('wrong-pin');
      if (!isValidPin(next)) return err('invalid-pin');
      const record = createPinRecord(next, deps.randomBytes(16));
      const code = valueOf(await deps.storage.load(STAFF_KEY, parsePersisted));
      if (!code) return err('wrong-pin');
      await persist(code.staffCode, record);
      store.set({ ...s, pin: record });
      return ok(undefined);
    },

    async leaveCounterMode(pin) {
      const s = current();
      if (!s || !verifyPin(pin, s.pin)) return err('wrong-pin');
      await deps.storage.remove(STAFF_KEY);
      deps.setTagServiceEnabled(false);
      store.set({ status: 'customer', revoked: false });
      return ok(undefined);
    },
  };
}
