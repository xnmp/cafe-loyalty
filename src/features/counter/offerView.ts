import type { ActiveOffer, RefusalReason } from '../../state/counterStore';

/**
 * What the counter overlay shows for an offer at a given moment. Pure, so the
 * barista-facing copy and the timing rules are unit tested.
 */

export type OfferStage =
  /** Waiting for a phone (NFC armed and/or QR showing). */
  | 'waiting'
  /** Redeem offer without NFC: waiting for the customer's code to be scanned. */
  | 'scan'
  /** A phone is mid-tap: read the token, reply not back yet. */
  | 'reading'
  /** Stamp offer: a phone read it but never confirmed (the tap opened the app, or the ack write failed). */
  | 'delivered'
  /** Redeem offer: a phone read the request but sent nothing back. */
  | 'stalled'
  /** Redeem offer: verifying the customer's stamps. */
  | 'checking'
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

export interface OfferViewContext {
  readonly stampsPerReward: number;
  readonly rewardName: string;
  /** Formats an epoch-ms time for "already used at …" (injected to keep this pure). */
  readonly formatWhen: (at: number) => string;
}

/** After a read with no reply for this long, assume the phone took it without confirming. */
export const ACK_GRACE_MS = 3500;

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function offerView(offer: ActiveOffer, now: number, ctx: OfferViewContext): OfferView {
  const { kind, count } = offer.record;
  const reward = ctx.rewardName;
  const total = offer.expiresAt - offer.startedAt;
  const left = Math.max(0, offer.expiresAt - now);
  const base = {
    overline: kind === 'stamp' ? `Giving ${plural(count, 'stamp', 'stamps')}` : `Redeeming a ${reward}`,
    secondsLeft: Math.ceil(left / 1000),
    remaining: total > 0 ? left / total : 0,
  };
  const outcome = offer.outcome;

  if (offer.phase === 'done' && outcome?.kind === 'ack') {
    const { status, progress, rewardsAvailable } = outcome.ack;
    const card = `Their card: ${progress} of ${ctx.stampsPerReward}${rewardsAvailable > 0 ? ` · ${plural(rewardsAvailable, 'reward', 'rewards')} ready` : ''}`;
    switch (status) {
      case 'stamped':
        return { ...base, stage: 'success', title: count > 1 ? `${count} stamps added` : 'Stamp added', body: card, autoCloseMs: 2500 };
      case 'already-used':
        return { ...base, stage: 'rejected', title: 'Already used', body: 'That code was used before. Start a new one.' };
      case 'expired':
        return { ...base, stage: 'rejected', title: 'Code expired', body: "Start a new one. If it keeps happening, check this phone's date & time." };
      case 'no-reward':
      case 'invalid':
        return { ...base, stage: 'rejected', title: "Couldn't verify", body: 'Their app may need updating. Try the QR code.' };
    }
  }

  if (offer.phase === 'done' && outcome?.kind === 'verified') {
    return {
      ...base,
      stage: 'success',
      title: `${capitalise(reward)} verified`,
      body: 'Their stamps check out. Hand it over.',
    };
  }

  if (offer.phase === 'done' && outcome?.kind === 'refused') {
    return { ...base, stage: 'rejected', ...refusal(outcome.reason, outcome.at, outcome.progress, now, ctx) };
  }

  if (offer.phase === 'checking') {
    return { ...base, stage: 'checking', title: 'Checking their stamps…', body: 'One moment.' };
  }

  if (offer.phase === 'read' && offer.readAt !== null) {
    if (now - offer.readAt < ACK_GRACE_MS) return { ...base, stage: 'reading', title: 'Phone detected…', body: 'Hold still for a moment.' };
    return kind === 'stamp'
      ? { ...base, stage: 'delivered', title: 'Sent to their phone', body: 'Check their screen shows it, then tap Done.' }
      : { ...base, stage: 'stalled', title: "Didn't hear back", body: `Ask them to open the ${reward} ticket in the app and tap again, or scan their code.` };
  }

  if (kind === 'redeem') {
    return offer.nfc
      ? { ...base, stage: 'waiting', title: 'Tap phone here', body: `On their phone: tap the ${reward} ticket, then hold it here (iPhone: press Tap the counter phone first). Or scan their code.` }
      : { ...base, stage: 'scan', title: 'Scan their code', body: `On their phone: tap the ${reward} ticket, then Show my code.` };
  }

  return {
    ...base,
    stage: 'waiting',
    title: offer.nfc ? 'Tap phone here' : 'Scan to collect',
    body: offer.nfc
      ? 'Customer holds their phone against the back of this one. iPhone: open the app and press Tap to collect.'
      : 'Customer scans this code with the app.',
  };
}

/** A redemption this recent may be one the barista never saw confirmed (missed screen, app restart). */
export const RECENT_REDEMPTION_MS = 10 * 60_000;

function refusal(reason: RefusalReason, at: number | undefined, progress: number | undefined, now: number, ctx: OfferViewContext): { title: string; body: string } {
  const reward = ctx.rewardName;
  switch (reason) {
    case 'already-redeemed':
      if (at === undefined) return { title: 'Already used', body: `This ${reward} was already given.` };
      return now - at < RECENT_REDEMPTION_MS
        ? { title: 'Already used', body: `It was verified ${ctx.formatWhen(at)}, a few minutes ago. Only give it if you're sure nobody handed it over then.` }
        : { title: 'Already used', body: `This ${reward} was given ${ctx.formatWhen(at)}.` };
    case 'stamps-used':
      return { title: 'Stamps already used', body: `Some of these stamps were spent before (perhaps copied from another phone). No ${reward}.` };
    case 'not-enough':
      return { title: 'Not enough stamps', body: `Their card doesn't have ${ctx.stampsPerReward} unused stamps yet.` };
    case 'no-reward':
      return {
        title: "Their card isn't full yet",
        body: progress !== undefined ? `They have ${progress} of ${ctx.stampsPerReward} stamps.` : `They need ${ctx.stampsPerReward} stamps.`,
      };
    case 'expired':
      return { title: 'Request expired', body: "Start again. If it keeps happening, check this phone's date & time." };
    case 'already-used':
    case 'invalid':
      return { title: "Couldn't verify", body: 'That isn’t a valid code. Ask them to update the app and try again.' };
    case 'unavailable':
      return { title: "Couldn't check", body: "This phone couldn't read its records. Try again." };
  }
}
