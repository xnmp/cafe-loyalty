import type { ActiveOffer } from '../../state/counterStore';

/**
 * What the counter overlay shows for an offer at a given moment. Pure, so the
 * barista-facing copy and the timing rules are unit tested.
 */

export type OfferStage =
  /** Waiting for a phone (NFC armed and/or QR showing). */
  | 'waiting'
  /** A phone is mid-tap: read the token, ack not back yet. */
  | 'reading'
  /** A phone read it but never confirmed (Android opened the app from the background, or the ack write failed). */
  | 'delivered'
  | 'success'
  | 'rejected';

export interface OfferView {
  readonly stage: OfferStage;
  readonly overline: string;
  readonly title: string;
  readonly body: string;
  readonly secondsLeft: number;
  /** 0–1, for the countdown ring. */
  readonly remaining: number;
  /** Close automatically after this many ms in this stage. */
  readonly autoCloseMs?: number;
}

/** After a read with no ack for this long, assume the phone took it without confirming. */
export const ACK_GRACE_MS = 3500;

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function offerView(offer: ActiveOffer, now: number, ctx: { stampsPerReward: number; rewardName: string }): OfferView {
  const { kind, count } = offer.record;
  const total = offer.expiresAt - offer.startedAt;
  const left = Math.max(0, offer.expiresAt - now);
  const base = {
    overline: kind === 'stamp' ? `Giving ${plural(count, 'stamp', 'stamps')}` : `Redeeming ${plural(count, ctx.rewardName, `${ctx.rewardName}s`)}`,
    secondsLeft: Math.ceil(left / 1000),
    remaining: total > 0 ? left / total : 0,
  };

  if (offer.phase === 'done' && offer.ack) {
    const { status, progress, rewardsAvailable } = offer.ack;
    const card = `Their card: ${progress} of ${ctx.stampsPerReward}${rewardsAvailable > 0 ? ` · ${plural(rewardsAvailable, 'reward', 'rewards')} ready` : ''}`;
    switch (status) {
      case 'stamped':
        return { ...base, stage: 'success', title: count > 1 ? `${count} stamps added` : 'Stamp added', body: card, autoCloseMs: 2500 };
      case 'redeemed':
        return { ...base, stage: 'success', title: `${capitalise(ctx.rewardName)} redeemed`, body: card, autoCloseMs: 3000 };
      case 'no-reward':
        return { ...base, stage: 'rejected', title: "Their card isn't full yet", body: `They have ${progress} of ${ctx.stampsPerReward} stamps.` };
      case 'already-used':
        return { ...base, stage: 'rejected', title: 'Already used', body: 'That code was used before. Start a new one.' };
      case 'expired':
        return { ...base, stage: 'rejected', title: 'Code expired', body: "Start a new one. If it keeps happening, check this phone's date & time." };
      case 'invalid':
        return { ...base, stage: 'rejected', title: "Couldn't verify", body: 'Their app may need updating. Try the QR code.' };
    }
  }

  if (offer.phase === 'read' && offer.readAt !== null) {
    return now - offer.readAt < ACK_GRACE_MS
      ? { ...base, stage: 'reading', title: 'Phone detected…', body: 'Hold still for a moment.' }
      : { ...base, stage: 'delivered', title: 'Sent to their phone', body: 'Check their screen shows it, then tap Done.' };
  }

  return {
    ...base,
    stage: 'waiting',
    title: offer.nfc ? 'Tap phone here' : 'Scan to collect',
    body: offer.nfc
      ? 'Customer holds their phone against the back of this one. iPhone: open the app and press Tap to collect.'
      : `Customer scans this code with the app.`,
  };
}

const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
