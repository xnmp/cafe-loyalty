export interface SettingsLockout {
  readonly failures: number;
  readonly lockedUntil: number;
}

export const initialLockout: SettingsLockout = { failures: 0, lockedUntil: 0 };
export const lockoutSeconds = (state: SettingsLockout, now: number): number =>
  Math.max(0, Math.ceil((state.lockedUntil - now) / 1000));

/** Attempts during a lock neither extend it nor count toward the next lock. */
export function recordPinAttempt(state: SettingsLockout, correct: boolean, now: number): SettingsLockout {
  if (lockoutSeconds(state, now) > 0) return state;
  if (correct) return initialLockout;
  const failures = (state.lockedUntil > 0 ? 0 : state.failures) + 1;
  return failures >= 5 ? { failures: 0, lockedUntil: now + 30_000 } : { failures, lockedUntil: 0 };
}
