import { expect, jest, test } from '@jest/globals';

import type { AckStatus } from '../../domain/link';
import { cafe, now } from '../../testing/protocol.test-utils';
import type { ActiveOffer, RefusalReason } from '../../state/counterStore';
import { ACK_GRACE_MS, offerView } from './offerView';

const ctx = { stampsPerReward: 9, rewardName: 'free drink', formatWhen: jest.fn((at: number) => `at ${at}`) };
const offer: ActiveOffer = {
  record: { nonceId: 'offer', kind: 'stamp', count: 1, issuedAt: now, status: 'offered', shownAsQr: false, ack: null },
  link: `${cafe.scheme}://t/token`, startedAt: now, expiresAt: now + 90000, phase: 'waiting', readAt: null, nfc: true, qrVisible: false, outcome: null,
};
const redeem: ActiveOffer = { ...offer, record: { ...offer.record, kind: 'redeem' } };
const view = (value: ActiveOffer, at = now) => offerView(value, at, ctx);

test.each([
  [offer, 'Giving 1 stamp', 'waiting', 'Tap phone here', 'Customer holds their phone against the back of this one. iPhone: open the app and press Tap to collect.'],
  [{ ...offer, record: { ...offer.record, count: 3 }, nfc: false, qrVisible: true }, 'Giving 3 stamps', 'waiting', 'Scan to collect', 'Customer scans this code with the app.'],
  [redeem, 'Redeeming a free drink', 'waiting', 'Tap phone here', 'Or scan their free drink code: on their phone, tap the free drink ticket, then Show code.'],
  [{ ...redeem, nfc: false }, 'Redeeming a free drink', 'scan', 'Scan their code', 'On their phone: tap the free drink ticket, then Show code.'],
] as const)('waiting copy %#', (input, overline, stage, title, body) => {
  expect(view(input)).toEqual({ overline, stage, title, body, secondsLeft: 90, remaining: 1 });
});

test.each(['stamp', 'redeem'] as const)('read %s transitions at the exact grace boundary', (kind) => {
  const input: ActiveOffer = { ...offer, record: { ...offer.record, kind }, phase: 'read', readAt: now };
  expect(view(input, now + ACK_GRACE_MS - 1)).toMatchObject({ stage: 'reading', title: 'Phone detected…', body: 'Hold still for a moment.' });
  const expected = kind === 'stamp'
    ? { stage: 'delivered', title: 'Sent to their phone', body: 'Check their screen shows it, then tap Done.' }
    : { stage: 'stalled', title: "Didn't hear back", body: 'Ask them to keep the app open and tap again, or scan their code.' };
  expect(view(input, now + ACK_GRACE_MS)).toMatchObject(expected);
  expect(view(input, now + ACK_GRACE_MS + 1)).toMatchObject(expected);
});

test('checking takes precedence over read timing; read without time still waits', () => {
  expect(view({ ...redeem, phase: 'checking', readAt: now }, now + 10000)).toMatchObject({ stage: 'checking', title: 'Checking their stamps…', body: 'One moment.' });
  expect(view({ ...offer, phase: 'read' }).stage).toBe('waiting');
});

test.each([
  [1, 0, 'Stamp added', 'Their card: 4 of 9'],
  [2, 1, '2 stamps added', 'Their card: 4 of 9 · 1 reward ready'],
  [3, 2, '3 stamps added', 'Their card: 4 of 9 · 2 rewards ready'],
])('stamp success pluralizes count %i / rewards %i', (count, rewardsAvailable, title, body) => {
  expect(view({ ...offer, record: { ...offer.record, count }, phase: 'done', outcome: { kind: 'ack', ack: { nonceId: 'offer', status: 'stamped', progress: 4, rewardsAvailable } } })).toMatchObject({ stage: 'success', title, body, autoCloseMs: 2500 });
});

test.each([
  ['already-used', 'Already used', 'That code was used before. Start a new one.'],
  ['expired', 'Code expired', "Start a new one. If it keeps happening, check this phone's date & time."],
  ['no-reward', "Couldn't verify", 'Their app may need updating. Try the QR code.'],
  ['invalid', "Couldn't verify", 'Their app may need updating. Try the QR code.'],
] satisfies [AckStatus, string, string][])('ack %s rejection copy', (status, title, body) => {
  expect(view({ ...offer, phase: 'done', outcome: { kind: 'ack', ack: { nonceId: 'offer', status, progress: 0, rewardsAvailable: 0 } } })).toEqual({ overline: 'Giving 1 stamp', secondsLeft: 90, remaining: 1, stage: 'rejected', title, body });
});

test('verified copy', () => {
  expect(view({ ...redeem, phase: 'done', outcome: { kind: 'verified', at: now } })).toMatchObject({ stage: 'success', title: 'Free drink verified', body: 'Their stamps check out. Hand it over.', autoCloseMs: 4000 });
});

test.each([
  ['already-redeemed', 'Already used', 'This free drink was already given.'],
  ['stamps-used', 'Stamps already used', 'Some of these stamps were spent before (perhaps copied from another phone). No free drink.'],
  ['not-enough', 'Not enough stamps', "Their card doesn't have 9 unused stamps yet."],
  ['no-reward', "Their card isn't full yet", 'They need 9 stamps.'],
  ['expired', 'Request expired', "Start again. If it keeps happening, check this phone's date & time."],
  ['already-used', "Couldn't verify", 'That isn’t a valid code. Ask them to update the app and try again.'],
  ['invalid', "Couldn't verify", 'That isn’t a valid code. Ask them to update the app and try again.'],
  ['unavailable', "Couldn't check", "This phone couldn't read its records. Try again."],
] satisfies [RefusalReason, string, string][])('refused %s copy', (reason, title, body) => {
  expect(view({ ...redeem, phase: 'done', outcome: { kind: 'refused', reason } })).toEqual({ overline: 'Redeeming a free drink', secondsLeft: 90, remaining: 1, stage: 'rejected', title, body });
});

test('already-redeemed uses injected formatting, including epoch zero', () => {
  expect(view({ ...redeem, phase: 'done', outcome: { kind: 'refused', reason: 'already-redeemed', at: 0 } }).body).toBe('This free drink was given at 0.');
  expect(ctx.formatWhen).toHaveBeenCalledWith(0);
});

test('no-reward includes reported progress even when zero', () => {
  for (const progress of [0, 8]) expect(view({ ...redeem, phase: 'done', outcome: { kind: 'refused', reason: 'no-reward', progress } }).body).toBe(`They have ${progress} of 9 stamps.`);
});

test.each([[0, 90, 1], [1, 90, 89999 / 90000], [45000, 45, 0.5], [89999, 1, 1 / 90000], [90000, 0, 0], [100000, 0, 0]])('countdown at +%i ms', (offset, secondsLeft, remaining) => {
  expect(view(offer, now + offset)).toMatchObject({ secondsLeft, remaining });
});

test('zero or negative offer durations have no countdown fraction', () => {
  for (const expiresAt of [now, now - 1]) expect(view({ ...offer, expiresAt })).toMatchObject({ secondsLeft: 0, remaining: 0 });
});
