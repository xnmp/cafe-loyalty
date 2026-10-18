import { router } from 'expo-router';
import { Coffee, Gift, Stamp } from 'lucide-react-native';
import { useMemo } from 'react';
import { ActivityIndicator, SectionList, StyleSheet, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { cafe } from '../../config';
import { summarize, type CardEvent } from '../../domain/card';
import { useStores } from '../../state/AppProviders';
import { useStore } from '../../state/store';
import { AppText, Group, Row, Screen, ScreenHeader } from '../../ui/primitives';
import { font, radius, space, useTheme } from '../../ui/theme';
import { describeEvent, groupByMonth } from './history';

export function HistoryScreen() {
  const { card: cardStore } = useStores();
  const { card, status } = useStore(cardStore);
  const { color } = useTheme();
  const sections = useMemo(() => groupByMonth(card.events), [card.events]);
  const summary = useMemo(() => summarize(card, cafe.rules), [card]);
  const oldest = sections[sections.length - 1]?.data;
  const firstEvent = oldest?.[oldest.length - 1];
  const memberSince = firstEvent ? new Date(firstEvent.at).toLocaleDateString(undefined, { month: 'short', year: 'numeric' }) : '—';

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
              <SummaryColumn value={summary.totalStamps.toLocaleString()} label="Stamps collected" />
              <View style={[styles.divider, { backgroundColor: color.line }]} />
              <SummaryColumn value={summary.rewardsRedeemed.toLocaleString()} label="Rewards redeemed" />
              <View style={[styles.divider, { backgroundColor: color.line }]} />
              <SummaryColumn value={memberSince} label="Member since" />
            </Group>
          }
          renderSectionHeader={({ section }) => (
            <AppText variant="overline" tone="muted" accessibilityRole="header" style={styles.sectionTitle}>{section.title}</AppText>
          )}
          renderItem={({ item, index, section }) => (
            <HistoryRow event={item} first={index === 0} last={index === section.data.length - 1} />
          )}
          ListEmptyComponent={<EmptyHistory />}
          showsVerticalScrollIndicator={false}
        />
      )}
    </Screen>
  );
}

function SummaryColumn({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.summaryColumn} accessible accessibilityLabel={`${label}: ${value}`} accessibilityLiveRegion="polite">
      <AppText variant="title" align="center" style={{ fontFamily: font.displayBold }}>{value}</AppText>
      <AppText variant="caption" tone="muted" align="center">{label}</AppText>
    </View>
  );
}

function HistoryRow({ event, first, last }: { event: CardEvent; first: boolean; last: boolean }) {
  const { color } = useTheme();
  const { title, kind } = describeEvent(event, cafe.rules.rewardName);
  const date = new Date(event.at);
  const detail = `${date.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })} · ${date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`;
  return (
    <View style={[
      styles.event,
      { backgroundColor: color.surface, borderColor: color.line },
      first && styles.firstEvent,
      last && styles.lastEvent,
    ]}>
      <Row icon={kind === 'stamp' ? Stamp : Gift} title={title} detail={detail} last={last} />
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
  summary: { flexDirection: 'row', paddingVertical: space.md, marginBottom: space.xs },
  summaryColumn: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.xxs, paddingHorizontal: space.xs },
  divider: { width: StyleSheet.hairlineWidth, alignSelf: 'stretch' },
  sectionTitle: { marginTop: space.xl, marginBottom: space.sm },
  event: { borderLeftWidth: StyleSheet.hairlineWidth, borderRightWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  firstEvent: { borderTopWidth: StyleSheet.hairlineWidth, borderTopLeftRadius: radius.md, borderTopRightRadius: radius.md },
  lastEvent: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomLeftRadius: radius.md, borderBottomRightRadius: radius.md },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.sm, paddingVertical: space.xxxl, paddingHorizontal: space.lg },
});
