import { router } from 'expo-router';
import { History, Info, MessageSquareWarning, Nfc, ScanLine, Smartphone } from 'lucide-react-native';
import { useCallback, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, useWindowDimensions, View, type LayoutChangeEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { cafe } from '../../config';
import { summarize } from '../../domain/card';
import { rewardsUnlocked } from '../../domain/intake';
import { useStores } from '../../state/AppProviders';
import { pausesReader } from '../../state/rewardUse';
import { useStore } from '../../state/store';
import { AppText, Button, IconButton, Screen } from '../../ui/primitives';
import { NfcPulse } from '../../ui/motion';
import { RewardTicket } from '../../ui/RewardTicket';
import { gridFor, StampCard, stampSizeForWidth } from '../../ui/StampCard';
import { space, useTheme, withAlpha } from '../../ui/theme';
import { describe, progressLine } from './feedback';
import { FeedbackSheet } from './FeedbackSheet';
import { fitCard, headerHeightsAt, rememberHeaderHeight, type FitInput, type HeaderMemo } from './fit';
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

  // The stamps shrink, then the header, rather than make the screen scroll (fit.ts).
  const [gridWidth, setGridWidth] = useState(0);
  const [room, setRoom] = useState(0);
  const [headerMemo, setHeaderMemo] = useState<HeaderMemo>({ key: '', heights: {} });
  const [body, setBody] = useState<FitInput['body']>(null);
  // The name wraps differently at another width or text size, so header heights only hold for these.
  const { width, fontScale } = useWindowDimensions();
  const headerKey = `${width}@${fontScale}`;
  const grid = gridFor(stampsPerReward + 1);
  const { compactHeader, stampSize } = fitCard({
    widthLimit: stampSizeForWidth(gridWidth, grid.cols),
    room,
    header: headerHeightsAt(headerMemo, headerKey),
    body,
    rows: grid.rows,
  });
  const onHeaderLayout = (e: LayoutChangeEvent) => {
    const { height } = e.nativeEvent.layout;
    setHeaderMemo((memo) => rememberHeaderHeight(memo, headerKey, compactHeader ? 'compact' : 'full', height));
  };
  const onBodyLayout = (e: LayoutChangeEvent) => {
    // Before the grid is laid out the card holds a placeholder, which says nothing about stamp size.
    if (stampSize > 0) setBody({ height: e.nativeEvent.layout.height, stamp: stampSize });
  };

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
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        onLayout={(e) => setRoom(e.nativeEvent.layout.height - SCROLL_PADDING_TOP - SCROLL_PADDING_BOTTOM)}
      >
        {/* A new view per variant, so a switch always reports the new header's height. */}
        <CardHeader key={compactHeader ? 'compact' : 'full'} compact={compactHeader} onLayout={onHeaderLayout} />

        <View onLayout={onBodyLayout}>
          <StampCard
            cafeName={cafe.shortName}
            stampsPerReward={stampsPerReward}
            filled={filled}
            staggerFrom={staggerFrom}
            rewardLit={celebrating}
            caption={caption}
            stampSize={stampSize}
            onGridWidth={setGridWidth}
          />

          {rewardsShown > 0 ? (
            <View style={{ marginTop: space.lg }}>
              <RewardTicket count={rewardsShown} rewardName={rewardName} onPress={cardStore.openReward} />
            </View>
          ) : null}
        </View>
      </ScrollView>

      <TapPanel tap={tap} />
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

/**
 * The greeting, the café's name, and the History and About buttons. Compact on
 * short screens: the name moves up beside the buttons in a smaller size.
 */
function CardHeader({ compact, onLayout }: { compact: boolean; onLayout: (e: LayoutChangeEvent) => void }) {
  const hello = (
    <AppText variant="overline" tone="muted">
      {greeting(new Date())}
    </AppText>
  );
  const actions = (
    <View style={styles.headerActions}>
      <IconButton icon={History} label="History" onPress={() => router.push('/history')} />
      <IconButton icon={Info} label={`About ${cafe.name}`} onPress={() => router.push('/about')} />
    </View>
  );
  return compact ? (
    <View style={[styles.header, styles.headerRow, { paddingBottom: space.md }]} onLayout={onLayout}>
      <View style={{ flex: 1, gap: space.xxs }}>
        {hello}
        <AppText variant="title" numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.8}>
          {cafe.name}
        </AppText>
      </View>
      {actions}
    </View>
  ) : (
    <View style={[styles.header, { paddingBottom: space.xl }]} onLayout={onLayout}>
      {/* The buttons sit beside the greeting so a long café name gets the full width. */}
      <View style={styles.headerRow}>
        <View style={{ flex: 1 }}>{hello}</View>
        {actions}
      </View>
      <AppText variant="display" numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.8}>
        {cafe.name}
      </AppText>
    </View>
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
        {cafe.supportEmail ? <Button label="Report a problem" kind="ghost" icon={MessageSquareWarning} onPress={() => router.push('/report')} /> : null}
      </View>
    </Screen>
  );
}

function TapPanel({ tap }: { tap: TapController }) {
  const { color } = useTheme();
  // Clear of the navigation bar or gesture handle: with edge-to-edge the screen runs under it.
  const insets = useSafeAreaInsets();
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
                  Hold your phone against the back of the counter phone.
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
    <View style={[styles.panel, { backgroundColor: color.background, borderTopColor: withAlpha(color.ink, 0.06), paddingBottom: Math.max(insets.bottom, space.md) }]}>
      {body}
    </View>
  );
}

const SCROLL_PADDING_TOP = space.sm;
const SCROLL_PADDING_BOTTOM = space.lg;

const styles = StyleSheet.create({
  scroll: { paddingHorizontal: space.lg, paddingTop: SCROLL_PADDING_TOP, paddingBottom: SCROLL_PADDING_BOTTOM },
  unavailable: { flex: 1, justifyContent: 'center', padding: space.xl, gap: space.sm },
  header: { gap: space.xxs },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  headerActions: { flexDirection: 'row', gap: space.xs },
  panel: { paddingHorizontal: space.lg, paddingTop: space.md, borderTopWidth: StyleSheet.hairlineWidth, gap: space.xxs },
  passive: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.xxs },
});
