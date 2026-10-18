import * as Haptics from 'expo-haptics';

import { cafe } from '../../config';
import { summarize } from '../../domain/card';
import type { TapReply } from '../../infra/nfcReader';
import type { CardStore, IntakeEvent, IntakeSource, TapOptions } from '../../state/cardStore';
import { describe, type Feedback } from './feedback';

/** Haptic pattern per outcome: one "thump" per stamp, a flourish for rewards. */
function playHaptics(feedback: Feedback, stamps: number) {
  const thump = () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => undefined);
  switch (feedback.kind) {
    case 'stamped':
      Array.from({ length: Math.min(stamps, 5) }, (_, i) => setTimeout(thump, i * 170));
      return;
    case 'unlocked':
    case 'redeemed':
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
      return;
    case 'repeat':
      void Haptics.selectionAsync().catch(() => undefined);
      return;
    case 'problem':
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => undefined);
  }
}

/** Describes an intake event against the card as it is now, and buzzes. */
function feel(store: CardStore, event: IntakeEvent): Feedback {
  const feedback = describe(event, {
    cafeName: cafe.name,
    rewardName: cafe.rules.rewardName,
    stampsPerReward: cafe.rules.stampsPerReward,
    summary: summarize(store.getSnapshot().card, cafe.rules),
  });
  playHaptics(feedback, event.kind === 'success' && event.outcome.kind === 'stamped' ? event.outcome.added : 1);
  return feedback;
}

/** QR scans and deep links: apply, describe, buzz. */
export async function submitWithFeedback(store: CardStore, uris: readonly string[], source: Exclude<IntakeSource, 'nfc'>): Promise<Feedback> {
  return feel(store, await store.submit(uris, source));
}

/** NFC: the reply to write back, and the iOS sheet text once it's settled. */
export async function tapWithFeedback(store: CardStore, uris: readonly string[], options: TapOptions): Promise<TapReply> {
  const exchange = await store.tap(uris, options);
  return {
    write: exchange.reply,
    async settle(written) {
      const feedback = feel(store, await exchange.finish(written));
      return feedback.kind === 'problem' ? { errorMessage: feedback.short } : { successMessage: feedback.short };
    },
  };
}
