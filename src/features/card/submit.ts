import * as Haptics from 'expo-haptics';

import { cafe } from '../../config';
import { summarize } from '../../domain/card';
import type { CardStore, IntakeSource, SubmitResult } from '../../state/cardStore';
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

export type FeltResult = SubmitResult & { readonly feedback: Feedback };

/** The one intake pipeline for every transport: apply, describe, buzz. */
export async function submitWithFeedback(store: CardStore, uris: readonly string[], source: IntakeSource): Promise<FeltResult> {
  const result = await store.submit(uris, source);
  const summary = summarize(store.getSnapshot().card, cafe.rules);
  const feedback = describe(result.event, {
    cafeName: cafe.name,
    rewardName: cafe.rules.rewardName,
    stampsPerReward: cafe.rules.stampsPerReward,
    summary,
  });
  const stamps = result.event.kind === 'success' && result.event.outcome.kind === 'stamped' ? result.event.outcome.added : 1;
  playHaptics(feedback, stamps);
  return { ...result, feedback };
}
