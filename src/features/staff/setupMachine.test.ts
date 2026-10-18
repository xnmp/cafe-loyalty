import { describe, expect, it } from '@jest/globals';

import { initialSetup, setupReducer, staffCodeMessage, type SetupState } from './setupMachine';

const choosePin = (code: string): SetupState => setupReducer(
  setupReducer(initialSetup, { type: 'scan' }), { type: 'code-accepted', code },
);

describe('staff setup', () => {
  it.each(['scan', 'paste'] as const)('accepts a validated code from %s and finishes only after matching PINs', (source) => {
    const start = setupReducer(initialSetup, { type: source });
    const pin = setupReducer(start, { type: 'code-accepted', code: ' staff-code ' });
    const confirm = setupReducer(pin, { type: 'pin-entered', pin: '0123' });
    expect(confirm.step).toBe('confirm-pin');
    expect(setupReducer(confirm, { type: 'pin-entered', pin: '0123' })).toEqual({ step: 'done', code: 'staff-code', pin: '0123' });
  });

  it('requires choosing both PINs again after a mismatch', () => {
    const confirm = setupReducer(choosePin('code'), { type: 'pin-entered', pin: '0123' });
    const retry = setupReducer(confirm, { type: 'pin-entered', pin: '9999' });
    expect(retry).toEqual({ step: 'pin', code: 'code', error: "Those PINs didn't match" });
    const next = setupReducer(retry, { type: 'pin-entered', pin: '5678' });
    expect(setupReducer(next, { type: 'pin-entered', pin: '5678' }).step).toBe('done');
  });

  it.each(['', ' ', '12a4', '123', '12345', '1'.repeat(10000)])('rejects invalid PIN %#', (pin) => {
    const state = choosePin('code');
    expect(setupReducer(state, { type: 'pin-entered', pin })).toBe(state);
  });

  it('never accepts a PIN or code out of sequence', () => {
    expect(setupReducer(initialSetup, { type: 'pin-entered', pin: '1234' })).toBe(initialSetup);
    expect(setupReducer(initialSetup, { type: 'code-accepted', code: 'code' })).toBe(initialSetup);
    const scan = setupReducer(initialSetup, { type: 'scan' });
    expect(setupReducer(scan, { type: 'code-accepted', code: '  ' })).toBe(scan);
  });

  it('drops codes and PINs when cancelled or validation fails', () => {
    const state = setupReducer(choosePin('secret'), { type: 'pin-entered', pin: '1234' });
    expect(setupReducer(state, { type: 'back' })).toEqual({ step: 'intro' });
    expect(setupReducer(state, { type: 'failed', message: staffCodeMessage['wrong-cafe'] })).toEqual({ step: 'intro', error: 'That code is for a different café.' });
  });
});
