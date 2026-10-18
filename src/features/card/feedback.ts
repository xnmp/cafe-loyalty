import type { CardSummary } from '../../domain/card';
import { rewardsUnlocked } from '../../domain/intake';
import type { IntakeEvent } from '../../state/cardStore';

/**
 * Everything the customer sees after a tap or scan, derived from the intake
 * event. Pure, so the in-app sheet and the iOS NFC sheet say the same thing.
 */

export type FeedbackKind = 'stamped' | 'unlocked' | 'redeemed' | 'repeat' | 'problem';

export interface Feedback {
  readonly kind: FeedbackKind;
  readonly title: string;
  readonly body: string;
  /** One line for the iOS system NFC sheet. */
  readonly short: string;
  /** Close automatically after this many ms; undefined = wait for the customer. */
  readonly autoDismissMs?: number;
}

export interface FeedbackContext {
  readonly rewardName: string;
  readonly stampsPerReward: number;
  /** Card summary after the event. */
  readonly summary: CardSummary;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function progressLine(summary: CardSummary, stampsPerReward: number, rewardName: string): string {
  const left = stampsPerReward - summary.progress;
  if (summary.progress === 0 && summary.totalStamps === 0) return `Collect ${stampsPerReward} stamps for a ${rewardName}.`;
  if (summary.progress === 0) return `Fresh card · ${stampsPerReward} stamps to your next ${rewardName}`;
  return `${summary.progress} of ${stampsPerReward} · ${plural(left, 'more stamp', 'more stamps')} to your ${rewardName}`;
}

export function describe(event: IntakeEvent, ctx: FeedbackContext): Feedback {
  const { rewardName, stampsPerReward, summary } = ctx;

  if (event.kind === 'success') {
    const o = event.outcome;
    if (o.kind === 'redeemed') {
      return {
        kind: 'redeemed',
        title: `Enjoy your ${rewardName}!`,
        body: 'Check the counter screen. If it didn’t go through, show your code from History.',
        short: 'Redeemed — enjoy!',
      };
    }
    const unlocked = rewardsUnlocked(o);
    if (unlocked > 0) {
      return {
        kind: 'unlocked',
        title: unlocked > 1 ? `${unlocked} ${rewardName}s earned!` : `Your next ${rewardName} is on us`,
        body: 'Ask at the counter whenever you like — it stays on your card until you use it.',
        short: `Card complete — ${rewardName} earned!`,
      };
    }
    return {
      kind: 'stamped',
      title: o.added > 1 ? `${o.added} stamps added` : 'Stamp added',
      body: progressLine(summary, stampsPerReward, rewardName),
      short: o.added > 1 ? `${o.added} stamps added` : 'Stamp added',
      autoDismissMs: 2600,
    };
  }

  if (event.kind === 'repeat') {
    return {
      kind: 'repeat',
      title: 'Already on your card',
      body: event.original.kind === 'stamp' ? 'That stamp was added a moment ago.' : `That ${rewardName} was already redeemed.`,
      short: 'Already added',
      autoDismissMs: 2000,
    };
  }

  switch (event.error) {
    case 'not-ours':
      return problem("That code isn't one of ours", 'Hold your phone against the back of the counter phone, or scan the code on its screen.', 'Not a stamp code');
    case 'expired':
      return problem('That code has expired', 'Ask the barista to start a new stamp and try again.', 'Code expired');
    case 'not-yet-valid':
      return problem("Your phone's clock looks off", 'Turn on automatic date & time in Settings, then try again.', 'Check date & time');
    case 'already-used':
      return problem('That code was already used', 'Each code works once. Ask the barista for a new one.', 'Code already used');
    case 'no-reward': {
      const left = stampsPerReward - summary.progress;
      return problem('Not quite there yet', `You need ${plural(left, 'more stamp', 'more stamps')} for a ${rewardName}.`, `${plural(left, 'stamp', 'stamps')} to go`);
    }
    case 'storage':
      return problem("Couldn't save that stamp", 'Your phone may be low on storage. Free up some space and try again.', "Couldn't save");
    case 'not-delivered':
      return problem('Hold still a little longer', 'Your phone moved away before it finished. Your stamps are still on your card — tap again.', 'Tap again');
    case 'tap-again':
      return problem(`Use your ${rewardName} from its ticket`, `In this app, tap your ${rewardName} ticket and use it from there.`, 'Open your ticket');
    case 'reward-closed':
      return problem(`Open your ${rewardName} first`, `Tap your ${rewardName} ticket, then tap the counter phone from there.`, `Open your ${rewardName} first`);
    case 'redeem-not-saved':
      return problem('Check the counter phone', `This phone couldn't save that it used your ${rewardName}. If the counter phone says verified, it's yours. Then free up some space on this phone.`, 'Check the counter phone');
    case 'unknown-key':
    case 'invalid-signature':
    case 'malformed':
    case 'unsupported-version':
    case 'too-many-stamps':
      return problem("We couldn't verify that code", 'Ask the barista to try again. If it keeps happening, update the app.', "Couldn't verify code");
  }
}

const problem = (title: string, body: string, short: string): Feedback => ({ kind: 'problem', title, body, short });
