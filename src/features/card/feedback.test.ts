import { expect, test } from '@jest/globals';

import { emptyCard, summarize } from '../../domain/card';
import type { IntakeEvent, IntakeProblem } from '../../state/cardStore';
import { cardOf, rules, stamp } from '../../testing/protocol.test-utils';
import { describe, progressLine } from './feedback';

const before = summarize(emptyCard, rules);
const partial = summarize(cardOf(4), rules);
const ctx = { cafeName: 'Test Cafe', rewardName: 'free drink', stampsPerReward: 9, summary: partial };
const eventBase = { id: 1, source: 'nfc' as const };

test.each([
  [before, 'Collect 9 stamps for a free drink.'],
  [summarize(cardOf(9), rules), 'Fresh card · 9 stamps to your next free drink'],
  [partial, '4 of 9 · 5 more stamps to your free drink'],
  [summarize(cardOf(8), rules), '8 of 9 · 1 more stamp to your free drink'],
])('progressLine %#', (summary, expected) => expect(progressLine(summary, 9, 'free drink')).toBe(expected));

test.each([1, 3])('ordinary stamp feedback for %i stamps', (added) => {
  expect(describe({ ...eventBase, kind: 'success', outcome: { kind: 'stamped', added, before, after: partial } }, ctx)).toEqual({ kind: 'stamped', title: added === 1 ? 'Stamp added' : '3 stamps added', short: added === 1 ? 'Stamp added' : '3 stamps added', body: '4 of 9 · 5 more stamps to your free drink', autoDismissMs: 2600 });
});

test.each([1, 2])('unlocking %i rewards uses reward feedback', (rewardsAvailable) => {
  const after = summarize(cardOf(9 * rewardsAvailable), rules);
  expect(describe({ ...eventBase, kind: 'success', outcome: { kind: 'stamped', added: 9 * rewardsAvailable, before, after } }, { ...ctx, summary: after })).toEqual({ kind: 'unlocked', title: rewardsAvailable === 1 ? 'Your next free drink is on us' : '2 free drinks earned!', body: 'Ask at the counter whenever you like — it stays on your card until you use it.', short: 'Card complete — free drink earned!' });
});

test.each(['nfc', 'code'] as const)('redeemed via %s', (via) => {
  const event: IntakeEvent = { ...eventBase, kind: 'success', outcome: { kind: 'redeemed', via, before: summarize(cardOf(9), rules), after: before } };
  expect(describe(event, ctx)).toEqual({ kind: 'redeemed', title: 'Enjoy your free drink!', body: 'Check the counter screen. If it didn’t go through, show your code from History.', short: 'Redeemed — enjoy!' });
});

test.each([
  [stamp(1, 1), 'That stamp was added a moment ago.'],
  [{ kind: 'redeem' as const, at: 0, nonceId: 'request', via: 'nfc' as const, spends: [{ nonceId: stamp(1, 9).nonceId, stamps: 9 }] }, 'That free drink was already redeemed.'],
])('repeat feedback %#', (original, body) => {
  expect(describe({ ...eventBase, kind: 'repeat', original }, ctx)).toEqual({ kind: 'repeat', title: 'Already on your card', body, short: 'Already added', autoDismissMs: 2000 });
});

const problems: Record<IntakeProblem, readonly [string, string, string]> = {
  'not-ours': ["That's not a Test Cafe code", 'Hold your phone against the back of the counter phone, or scan the code on its screen.', 'Not a stamp code'],
  expired: ['That code has expired', 'Ask the barista to start a new stamp and try again.', 'Code expired'],
  'not-yet-valid': ["Your phone's clock looks off", 'Turn on automatic date & time in Settings, then try again.', 'Check date & time'],
  'already-used': ['That code was already used', 'Each code works once. Ask the barista for a new one.', 'Code already used'],
  'no-reward': ['Not quite there yet', 'You need 5 more stamps for a free drink.', '5 stamps to go'],
  storage: ["Couldn't save that stamp", 'Your phone may be low on storage. Free up some space and try again.', "Couldn't save"],
  'not-delivered': ['Hold still a little longer', 'Your phone moved away before it finished. Your stamps are still on your card — tap again.', 'Tap again'],
  'tap-again': ['Tap again to use your free drink', 'In this app, tap your free drink ticket, then hold your phone to the counter phone once more.', 'Tap again'],
  'reward-closed': ['Open your free drink first', 'Tap your free drink ticket, then hold your phone to the counter phone again.', 'Open your free drink first'],
  'unknown-key': ["We couldn't verify that code", 'Ask the barista to try again. If it keeps happening, update the app.', "Couldn't verify code"],
  'invalid-signature': ["We couldn't verify that code", 'Ask the barista to try again. If it keeps happening, update the app.', "Couldn't verify code"],
  malformed: ["We couldn't verify that code", 'Ask the barista to try again. If it keeps happening, update the app.', "Couldn't verify code"],
  'unsupported-version': ["We couldn't verify that code", 'Ask the barista to try again. If it keeps happening, update the app.', "Couldn't verify code"],
  'too-many-stamps': ["We couldn't verify that code", 'Ask the barista to try again. If it keeps happening, update the app.', "Couldn't verify code"],
};
test.each(Object.entries(problems) as [IntakeProblem, readonly [string, string, string]][])('problem %s has actionable copy', (error, [title, body, short]) => {
  expect(describe({ ...eventBase, kind: 'error', error }, ctx)).toEqual({ kind: 'problem', title, body, short });
});

test('one remaining stamp is singular', () => {
  expect(describe({ ...eventBase, kind: 'error', error: 'no-reward' }, { ...ctx, summary: summarize(cardOf(8), rules) })).toEqual({ kind: 'problem', title: 'Not quite there yet', body: 'You need 1 more stamp for a free drink.', short: '1 stamp to go' });
});
