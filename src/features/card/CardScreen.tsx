import { router } from 'expo-router';
import { History, Info, Nfc, ScanLine, Smartphone } from 'lucide-react-native';
import { useCallback, useMemo } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { cafe } from '../../config';
import { summarize } from '../../domain/card';
import { rewardsUnlocked } from '../../domain/intake';
import { useStores } from '../../state/AppProviders';
import { pausesReader } from '../../state/rewardUse';
import { useStore } from '../../state/store';
import { AppText, Button, IconButton, Screen } from '../../ui/primitives';
import { Appear, NfcPulse } from '../../ui/motion';
import { RewardTicket } from '../../ui/RewardTicket';
import { StampCard } from '../../ui/StampCard';
import { space, useTheme, withAlpha } from '../../ui/theme';
import { describe, progressLine } from './feedback';
import { FeedbackSheet } from './FeedbackSheet';
import { RedeemSheet } from './RedeemSheet';
import { useTapToCollect, type TapController } from './useTapToCollect';

function greeting(date: Date): string {
  const h = date.getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

export function CardScreen() {
  const { card: cardStore } = useStores();
  const { card, lastEvent, status, using } = useStore(cardStore);
  const { stampsPerReward, rewardName } = cafe.rules;
  const summary = useMemo(() => summarize(card, cafe.rules), [card]);

  const feedback = useMemo(
    () => (lastEvent ? describe(lastEvent, { rewardName, stampsPerReward, summary }) : null),
    [lastEvent, rewardName, stampsPerReward, summary],
  );
  // Don't read the counter phone while feedback or a code is on screen.
  const tap = useTapToCollect({ paused: feedback !== null || pausesReader(using) });

  const dismiss = useCallback(() => {
    if (lastEvent) cardStore.dismiss(lastEvent.id);
  }, [cardStore, lastEvent]);

  // While a completed card is being celebrated, keep it full with the reward lit;
  // once dismissed it clears to the new progress and the ticket appears.
  const stamped = lastEvent?.kind === 'success' && lastEvent.outcome.kind === 'stamped' ? lastEvent.outcome : null;
  const celebrating = stamped !== null && rewardsUnlocked(stamped) > 0;
  const filled = celebrating ? stampsPerReward : summary.progress;
  const staggerFrom = stamped ? stamped.before.progress : 0;
  const caption = celebrating ? `Card complete — your ${rewardName} is waiting.` : progressLine(summary, stampsPerReward, rewardName);
  const rewardsShown = celebrating ? summary.rewardsAvailable - rewardsUnlocked(stamped) : summary.rewardsAvailable;

  if (status === 'loading') return <Screen>{null}</Screen>;
  if (status === 'unavailable') return <Unavailable onRetry={() => void cardStore.load()} />;

  return (
    <Screen edges={['top']}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          {/* The buttons sit beside the greeting so a long café name gets the full width. */}
          <View style={styles.headerTop}>
            <AppText variant="overline" tone="muted" style={{ flex: 1 }}>
              {greeting(new Date())}
            </AppText>
            <View style={styles.headerActions}>
              <IconButton icon={History} label="History" onPress={() => router.push('/history')} />
              <IconButton icon={Info} label={`About ${cafe.name}`} onPress={() => router.push('/about')} />
            </View>
          </View>
          <AppText variant="display" numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.8}>
            {cafe.name}
          </AppText>
        </View>

        <StampCard
          cafeName={cafe.shortName}
          stampsPerReward={stampsPerReward}
          filled={filled}
          staggerFrom={staggerFrom}
          rewardLit={celebrating}
          caption={caption}
        />

        {rewardsShown > 0 ? (
          <View style={{ marginTop: space.lg }}>
            <RewardTicket count={rewardsShown} rewardName={rewardName} onPress={cardStore.openReward} />
          </View>
        ) : null}

        {summary.totalStamps === 0 && !lastEvent ? <HowItWorks /> : null}
      </ScrollView>

      <TapPanel tap={tap} hasReward={summary.rewardsAvailable > 0} />
      <FeedbackSheet feedback={feedback} onDismiss={dismiss} />
      {/* Steps aside while a tap's feedback shows, then comes back unless the reward was used. */}
      <RedeemSheet
        using={using}
        visible={using !== null && feedback === null}
        count={summary.rewardsAvailable}
        tap={tap}
        onShowCode={() => void cardStore.showCode()}
        onClose={cardStore.closeReward}
      />
    </Screen>
  );
}

function Unavailable({ onRetry }: { onRetry: () => void }) {
  return (
    <Screen>
      <View style={styles.unavailable}>
        <AppText variant="title" align="center" accessibilityRole="header">
          Couldn&rsquo;t open your card
        </AppText>
        <AppText tone="muted" align="center">
          Your stamps are safe, but this phone couldn&rsquo;t read them just now. Restarting the app or freeing up some space usually helps.
        </AppText>
        <Button label="Try again" onPress={onRetry} style={{ alignSelf: 'stretch', marginTop: space.md }} />
      </View>
    </Screen>
  );
}

function HowItWorks() {
  const { color } = useTheme();
  const steps = [
    { n: '1', text: 'Order your drink as usual.' },
    { n: '2', text: 'Tap your phone on the counter phone (or scan its code).' },
    { n: '3', text: `Every ${cafe.rules.stampsPerReward + 1}th drink is on us.` },
  ];
  return (
    <Appear delay={200} style={{ marginTop: space.xl, gap: space.sm }}>
      <AppText variant="overline" tone="muted">
        How it works
      </AppText>
      {steps.map((s) => (
        <View key={s.n} style={styles.step}>
          <View style={[styles.stepNumber, { borderColor: withAlpha(color.accent, 0.5) }]}>
            <AppText variant="caption" tone="accent" style={{ fontWeight: '700' }}>
              {s.n}
            </AppText>
          </View>
          <AppText variant="callout" style={{ flex: 1 }}>
            {s.text}
          </AppText>
        </View>
      ))}
    </Appear>
  );
}

function TapPanel({ tap, hasReward }: { tap: TapController; hasReward: boolean }) {
  const { color } = useTheme();
  const scan = () => router.push('/scan');
  const scanLink = <Button kind="ghost" icon={ScanLine} label="Scan code instead" onPress={scan} />;

  const body = (() => {
    switch (tap.availability) {
      case 'checking':
        return <View style={{ height: 60 }} />;
      case 'unsupported':
        return <Button size="lg" icon={ScanLine} label="Scan code to collect" onPress={scan} />;
      case 'disabled':
        return (
          <>
            <AppText variant="callout" tone="muted" align="center" style={{ marginBottom: space.sm }}>
              NFC is turned off on this phone.
            </AppText>
            <Button size="lg" kind="secondary" icon={Nfc} label="Turn on NFC" onPress={tap.openSettings} />
            {scanLink}
          </>
        );
      case 'ready':
        return tap.passive ? (
          <>
            <View style={styles.passive} accessible accessibilityLabel="Ready. Hold your phone against the back of the counter phone.">
              <NfcPulse icon={Smartphone} size={64} />
              <View style={{ flex: 1 }}>
                <AppText variant="heading">Ready to tap</AppText>
                <AppText variant="caption" tone="muted" style={{ marginTop: 2 }}>
                  Hold your phone against the back of the counter phone.{hasReward ? ` To use your ${cafe.rules.rewardName}, tap its ticket first.` : ''}
                </AppText>
              </View>
            </View>
            {scanLink}
          </>
        ) : (
          <>
            <Button size="lg" icon={Nfc} label="Tap to collect" onPress={tap.startSession} busy={tap.reading} testID="tap-to-collect" />
            {scanLink}
          </>
        );
    }
  })();

  return (
    <View style={[styles.panel, { backgroundColor: color.background, borderTopColor: withAlpha(color.ink, 0.06) }]}>
      {body}
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: space.lg, paddingBottom: space.xxxl },
  unavailable: { flex: 1, justifyContent: 'center', padding: space.xl, gap: space.sm },
  header: { marginBottom: space.xl, marginTop: space.xs, gap: space.xxs },
  headerTop: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  headerActions: { flexDirection: 'row', gap: space.xs },
  step: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  stepNumber: { width: 26, height: 26, borderRadius: 13, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  panel: { paddingHorizontal: space.lg, paddingTop: space.md, paddingBottom: space.lg, borderTopWidth: StyleSheet.hairlineWidth, gap: space.xxs },
  passive: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.xxs },
});
