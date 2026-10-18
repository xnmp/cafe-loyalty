import { expect, test } from '@jest/globals';

import { closedFlow, pausesReader, redeemFlow, tapMayUseReward, type RedeemAction, type RedeemFlow } from './redeemFlow';

const run = (...actions: RedeemAction[]): RedeemFlow => actions.reduce(redeemFlow, closedFlow);
const open: RedeemAction = { type: 'open' };
const close: RedeemAction = { type: 'close' };
const showCode: RedeemAction = { type: 'show-code' };
const made: RedeemAction = { type: 'code-made', link: 'cafe://r/x' };

test('only an open reward lets a tap use it', () => {
  expect(tapMayUseReward(closedFlow)).toBe(false);
  expect(tapMayUseReward(run(open))).toBe(true);
  expect(tapMayUseReward(run(open, close))).toBe(false);
});

test('choosing a code stops taps from using a reward before the code is saved', () => {
  const preparing = run(open, showCode);
  expect(tapMayUseReward(preparing)).toBe(false);
  expect(pausesReader(preparing)).toBe(true);
  const shown = redeemFlow(preparing, made);
  expect(shown).toEqual({ kind: 'code', link: 'cafe://r/x' });
  expect(tapMayUseReward(shown)).toBe(false);
  expect(pausesReader(shown)).toBe(true);
});

test('the sheet stays open while a code is being saved, so a late result has somewhere to go', () => {
  expect(run(open, showCode, close)).toEqual({ kind: 'preparing' });
  expect(run(open, showCode, close, made)).toEqual({ kind: 'code', link: 'cafe://r/x' });
  expect(run(open, showCode, open)).toEqual({ kind: 'preparing' });
});

test('a failed code goes back to the open reward with the reason', () => {
  const failed = run(open, showCode, { type: 'code-failed', error: 'storage' });
  expect(failed).toEqual({ kind: 'ready', error: 'storage' });
  expect(tapMayUseReward(failed)).toBe(true);
});

test('code results that arrive when no code is being made change nothing', () => {
  for (const state of [closedFlow, run(open), run(open, showCode, made)]) {
    expect(redeemFlow(state, made)).toBe(state);
    expect(redeemFlow(state, { type: 'code-failed', error: 'no-reward' })).toBe(state);
  }
});

test('a second code request while one is pending or shown is ignored', () => {
  expect(run(open, showCode, showCode)).toEqual({ kind: 'preparing' });
  expect(run(open, showCode, made, showCode)).toEqual({ kind: 'code', link: 'cafe://r/x' });
});

test('reopening after a code starts fresh', () => {
  expect(run(open, showCode, made, close, open)).toEqual({ kind: 'ready' });
});
