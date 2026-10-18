import { useKeepAwake } from 'expo-keep-awake';
import { router, useFocusEffect } from 'expo-router';
import { Coffee, Gift, Minus, Nfc, Plus, Settings, TriangleAlert } from 'lucide-react-native';
import { useCallback, useMemo, useState } from 'react';
import { AppState, ScrollView, StyleSheet, View } from 'react-native';

import * as hce from '../../../modules/hce';
import { cafe } from '../../config';
import { statsBetween } from '../../domain/counter';
import type { StaffCredentials } from '../../domain/provisioning';
import type { TokenKind } from '../../domain/token';
import { useStores } from '../../state/AppProviders';
import { useStore } from '../../state/store';
import { AppText, Button, IconButton, Screen, Squishy } from '../../ui/primitives';
import { font, radius, space, useTheme, withAlpha } from '../../ui/theme';
import { useNow } from '../../ui/useNow';
import { OfferOverlay } from './OfferOverlay';

type NfcStatus = 'ready' | 'off' | 'unsupported';

function readNfcStatus(): NfcStatus {
  if (!hce.isSupported()) return 'unsupported';
  return hce.isEnabled() ? 'ready' : 'off';
}

/** Tracks whether this device can serve taps; re-checked when returning from Settings. */
function useNfcStatus(): NfcStatus {
  const [status, setStatus] = useState<NfcStatus>(readNfcStatus);
  useFocusEffect(
    useCallback(() => {
      setStatus(readNfcStatus());
      const sub = AppState.addEventListener('change', (s) => s === 'active' && setStatus(readNfcStatus()));
      return () => sub.remove();
    }, []),
  );
  return status;
}

/** Local midnight `days` days from the day containing `now` (DST-safe). */
function midnight(now: number, days: number): number {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + days);
  return d.getTime();
}

export function CounterScreen({ credentials }: { credentials: StaffCredentials }) {
  useKeepAwake(); // HCE only answers while the screen is on.
  const { counter } = useStores();
  const { log, offer, status } = useStore(counter);
  // Offers wait for the log to load so a late load can't overwrite new entries.
  const loading = status !== 'ready';
  const { color } = useTheme();
  const nfc = useNfcStatus();
  const [count, setCount] = useState(1);
  const max = cafe.rules.maxStampsPerTap;
  const { rewardName } = cafe.rules;

  // Coarse clock: only needed to roll "today" over at midnight.
  const now = useNow(60_000);
  const dayStart = midnight(now, 0);
  const today = useMemo(() => statsBetween(log, dayStart, midnight(dayStart, 1)), [log, dayStart]);

  const start = (kind: TokenKind, n: number) => {
    counter.offer(credentials, kind, n);
    setCount(1);
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.scroll} bounces={false}>
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <AppText variant="overline" tone="accent">
              Counter
            </AppText>
            <AppText variant="title" numberOfLines={1}>
              {cafe.name}
            </AppText>
          </View>
          <IconButton icon={Settings} label="Counter settings" onPress={() => router.push('/counter/settings')} />
        </View>

        <View style={[styles.stats, { backgroundColor: color.surface, borderColor: color.line }]}>
          <Stat icon={Coffee} value={today.stamps} label={today.stamps === 1 ? 'stamp today' : 'stamps today'} />
          <View style={[styles.statDivider, { backgroundColor: color.line }]} />
          <Stat icon={Gift} value={today.rewards} label={today.rewards === 1 ? `${rewardName} today` : `${rewardName}s today`} />
        </View>

        {nfc !== 'ready' ? <NfcBanner status={nfc} /> : null}

        <View style={styles.stepperBlock}>
          <AppText variant="overline" tone="muted" align="center">
            How many drinks?
          </AppText>
          <View style={styles.stepper}>
            <StepButton icon={Minus} label="One fewer" disabled={count <= 1} onPress={() => setCount((c) => Math.max(1, c - 1))} />
            <AppText style={[styles.count, { color: color.ink }]} accessibilityLabel={`${count} ${count === 1 ? 'drink' : 'drinks'}`} accessibilityLiveRegion="polite">
              {count}
            </AppText>
            <StepButton icon={Plus} label="One more" disabled={count >= max} onPress={() => setCount((c) => Math.min(max, c + 1))} />
          </View>
        </View>

        <View style={{ gap: space.sm }}>
          <Button size="lg" icon={Coffee} label={count === 1 ? 'Give 1 stamp' : `Give ${count} stamps`} disabled={loading} onPress={() => start('stamp', count)} testID="give-stamps" />
          <Button size="lg" kind="secondary" icon={Gift} label={`Redeem ${rewardName}`} disabled={loading} onPress={() => start('redeem', 1)} testID="redeem" />
        </View>
      </ScrollView>

      {offer ? (
        <OfferOverlay key={offer.record.nonceId} offer={offer} onCancel={counter.cancel} onDone={counter.dismiss} onShowQr={counter.showQr} onScan={counter.scanCode} />
      ) : null}
    </Screen>
  );
}

function Stat({ icon: Icon, value, label }: { icon: typeof Coffee; value: number; label: string }) {
  const { color } = useTheme();
  return (
    <View style={styles.stat} accessible accessibilityLabel={`${value} ${label}`}>
      <Icon size={18} color={color.accent} strokeWidth={2} />
      <AppText style={{ fontFamily: font.displayBold, fontSize: 22, lineHeight: 26, color: color.ink }}>{value}</AppText>
      <AppText variant="caption" tone="muted" numberOfLines={1} style={{ flexShrink: 1 }}>
        {label}
      </AppText>
    </View>
  );
}

function StepButton({ icon: Icon, label, disabled, onPress }: { icon: typeof Minus; label: string; disabled: boolean; onPress: () => void }) {
  const { color } = useTheme();
  return (
    <Squishy
      onPress={onPress}
      disabled={disabled}
      accessibilityLabel={label}
      style={[styles.stepButton, { borderColor: color.line, backgroundColor: color.surface, opacity: disabled ? 0.35 : 1 }]}
    >
      <Icon size={28} color={color.ink} strokeWidth={2.2} />
    </Squishy>
  );
}

function NfcBanner({ status }: { status: Exclude<NfcStatus, 'ready'> }) {
  const { color } = useTheme();
  return (
    <View style={[styles.banner, { backgroundColor: withAlpha(color.accent, 0.1), borderColor: withAlpha(color.accent, 0.3) }]}>
      <TriangleAlert size={20} color={color.accent} strokeWidth={2} />
      <View style={{ flex: 1, gap: 2 }}>
        <AppText variant="bodyStrong">{status === 'off' ? 'NFC is off' : 'No tap-to-collect on this phone'}</AppText>
        <AppText variant="caption" tone="muted">
          {status === 'off' ? 'Turn it on so customers can tap. Until then they can scan a QR code.' : "This phone can't act as a tap point, so customers will scan a QR code instead."}
        </AppText>
        {status === 'off' ? <Button kind="ghost" icon={Nfc} label="Turn on NFC" onPress={hce.openNfcSettings} style={{ alignSelf: 'flex-start', paddingHorizontal: 0, height: 36 }} /> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: space.lg, gap: space.lg, flexGrow: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  stats: { flexDirection: 'row', alignItems: 'center', borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth, paddingVertical: space.sm, paddingHorizontal: space.md },
  stat: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.xs },
  statDivider: { width: StyleSheet.hairlineWidth, alignSelf: 'stretch', marginHorizontal: space.sm },
  stepperBlock: { flex: 1, justifyContent: 'center', gap: space.sm, minHeight: 200 },
  stepper: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.xl },
  stepButton: { width: 64, height: 64, borderRadius: 32, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  count: { fontFamily: font.displayBold, fontSize: 88, lineHeight: 100, minWidth: 90, textAlign: 'center', fontVariant: ['tabular-nums'] },
  banner: { flexDirection: 'row', gap: space.sm, borderRadius: radius.md, borderWidth: 1, padding: space.md },
});
