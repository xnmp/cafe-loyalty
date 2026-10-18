import { router } from 'expo-router';
import { Coffee, Gift, Stamp } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { ActivityIndicator, SectionList, StyleSheet, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { cafe } from '../../config';
import { summarize, type CardEvent, type RedeemEvent } from '../../domain/card';
import { useStores } from '../../state/AppProviders';
import { useStore } from '../../state/store';
import { AppText, Group, Row, Screen, ScreenHeader } from '../../ui/primitives';
import { font, radius, space, useTheme } from '../../ui/theme';
import { CodeSheet } from '../card/RedeemSheet';
import { describeEvent, groupByMonth } from './history';

export function HistoryScreen() {
  const { card: cardStore } = useStores();
  const { card, status } = useStore(cardStore);
  const [code, setCode] = useState<string | null>(null);
  const showCode = (event: RedeemEvent) => setCode(cardStore.codeFor(event));
  const { color } = useTheme();
  const sections = useMemo(() => groupByMonth(card.events), [card.events]);
  const summary = useMemo(() => summarize(card, cafe.rules), [card]);
  const oldest = sections[sections.length - 1]?.data;
  const firstEvent = oldest?.[oldest.length - 1];
  const memberSince = firstEvent ? new Date(firstEvent.at).toLocaleDateString(undefined, { month: 'long', year: 'numeric' }) : null;
  const rewardsLabel = `${cafe.rules.rewardName.charAt(0).toUpperCase()}${cafe.rules.rewardName.slice(1)}s`;

  return (
    <Screen>
      <ScreenHeader title="History" onBack={() => router.back()} />
      {status === 'loading' ? <ActivityIndicator color={color.accent} accessibilityLabel="Loading history" /> : (
        <SectionList
          sections={sections}
          keyExtractor={(event) => event.nonceId}
          stickySectionHeadersEnabled={false}
          contentContainerStyle={styles.list}
          ListHeaderComponent={
            <Group style={styles.summary}>
              <View style={styles.summaryRow}>
                <SummaryColumn value={summary.totalStamps.toLocaleString()} label="Stamps" />
                <View style={[styles.divider, { backgroundColor: color.line }]} />
                <SummaryColumn value={summary.rewardsRedeemed.toLocaleString()} label={rewardsLabel} />
              </View>
              {memberSince ? (
                <AppText variant="caption" tone="muted" align="center" style={[styles.memberSince, { borderTopColor: color.line }]}>
                  Member since {memberSince}
                </AppText>
              ) : null}
            </Group>
          }
          renderSectionHeader={({ section }) => (
            <AppText variant="overline" tone="muted" accessibilityRole="header" style={styles.sectionTitle}>{section.title}</AppText>
          )}
          renderItem={({ item, index, section }) => (
            <HistoryRow event={item} first={index === 0} last={index === section.data.length - 1} onShowCode={showCode} />
          )}
          ListEmptyComponent={<EmptyHistory />}
          showsVerticalScrollIndicator={false}
        />
      )}
      <CodeSheet link={code} onClose={() => setCode(null)} />
    </Screen>
  );
}

function SummaryColumn({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.summaryColumn} accessible accessibilityLabel={`${label}: ${value}`} accessibilityLiveRegion="polite">
      <AppText variant="display" align="center" numberOfLines={1} adjustsFontSizeToFit style={{ fontFamily: font.displayBold, fontVariant: ['tabular-nums'] }}>{value}</AppText>
      <AppText variant="caption" tone="muted" align="center" numberOfLines={1}>{label}</AppText>
    </View>
  );
}

function HistoryRow({ event, first, last, onShowCode }: { event: CardEvent; first: boolean; last: boolean; onShowCode: (event: RedeemEvent) => void }) {
  const { color } = useTheme();
  const { title, kind } = describeEvent(event, cafe.rules.rewardName);
  const date = new Date(event.at);
  const when = `${date.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })} · ${date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`;
  // A code may never have been scanned, so it can be shown again.
  const codeRedemption = event.kind === 'redeem' && event.via === 'code' ? event : null;
  const detail = codeRedemption ? `${when} · Code — tap to show again` : when;
  return (
    <View style={[
      styles.event,
      { backgroundColor: color.surface, borderColor: color.line },
      first && styles.firstEvent,
      last && styles.lastEvent,
    ]}>
      <Row icon={kind === 'stamp' ? Stamp : Gift} title={title} detail={detail} last={last} onPress={codeRedemption ? () => onShowCode(codeRedemption) : undefined} />
    </View>
  );
}

function EmptyHistory() {
  const { color } = useTheme();
  const size = space.xxxl * 2;
  return (
    <View style={styles.empty}>
      <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
        <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
          <Circle cx={size / 2} cy={size / 2} r={size * 0.44} stroke={color.line} strokeWidth={1.5} strokeDasharray="3 4" fill="none" />
        </Svg>
        <Coffee size={space.xxl} color={color.inkMuted} strokeWidth={2} />
      </View>
      <AppText variant="title" align="center">No stamps yet</AppText>
      <AppText tone="muted" align="center">Your stamps will appear here after your first visit.</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  list: { paddingHorizontal: space.lg, paddingBottom: space.xxl, flexGrow: 1 },
  summary: { marginBottom: space.xs },
  summaryRow: { flexDirection: 'row', paddingVertical: space.lg },
  summaryColumn: { flex: 1, alignItems: 'center', gap: space.xxs, paddingHorizontal: space.sm },
  memberSince: { borderTopWidth: StyleSheet.hairlineWidth, paddingVertical: space.sm },
  divider: { width: StyleSheet.hairlineWidth, alignSelf: 'stretch' },
  sectionTitle: { marginTop: space.xl, marginBottom: space.sm },
  event: { borderLeftWidth: StyleSheet.hairlineWidth, borderRightWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  firstEvent: { borderTopWidth: StyleSheet.hairlineWidth, borderTopLeftRadius: radius.md, borderTopRightRadius: radius.md },
  lastEvent: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomLeftRadius: radius.md, borderBottomRightRadius: radius.md },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.sm, paddingVertical: space.xxxl, paddingHorizontal: space.lg },
});
