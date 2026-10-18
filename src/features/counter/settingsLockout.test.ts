import { describe, expect, it } from '@jest/globals';

import { initialLockout, lockoutSeconds, recordPinAttempt } from './settingsLockout';

const fail = (count: number, now: number) => Array.from({ length: count }).reduce<typeof initialLockout>(
  (state) => recordPinAttempt(state, false, now), initialLockout,
);

describe('settings PIN lockout', () => {
  it('allows four failures and locks on the fifth for exactly 30 seconds', () => {
    expect(lockoutSeconds(fail(4, 1000), 1000)).toBe(0);
    const locked = fail(5, 1000);
    expect(lockoutSeconds(locked, 1000)).toBe(30);
    expect(lockoutSeconds(locked, 30999)).toBe(1);
    expect(lockoutSeconds(locked, 31000)).toBe(0);
    expect(lockoutSeconds(locked, Number.MAX_SAFE_INTEGER)).toBe(0);
  });

  it('ignores every attempt during a lock without extending the wait', () => {
    const locked = fail(5, 1000);
    expect(recordPinAttempt(locked, false, 2000)).toEqual(locked);
    expect(recordPinAttempt(locked, true, 2000)).toEqual(locked);
  });

  it('resets consecutive failures after success', () => {
    const correct = recordPinAttempt(fail(4, 1000), true, 1001);
    expect(lockoutSeconds(recordPinAttempt(correct, false, 1002), 1002)).toBe(0);
    expect(recordPinAttempt(correct, false, 1002).failures).toBe(1);
  });

  it('starts a fresh set of five attempts at the exact expiry boundary', () => {
    let state = recordPinAttempt(fail(5, 0), false, 30000);
    expect(state.failures).toBe(1);
    for (let i = 0; i < 3; i++) state = recordPinAttempt(state, false, 30000);
    expect(lockoutSeconds(state, 30000)).toBe(0);
    expect(lockoutSeconds(recordPinAttempt(state, false, 30000), 30000)).toBe(30);
  });
});
