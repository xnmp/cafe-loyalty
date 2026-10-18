import { Check, CircleAlert, QrCode, Smartphone, X } from 'lucide-react-native';
import { useEffect } from 'react';
import { ActivityIndicator, Modal, StyleSheet, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import Animated, { FadeIn, ZoomIn } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { cafe } from '../../config';
import type { ActiveOffer } from '../../state/counterStore';
import { AppText, Button } from '../../ui/primitives';
import { CountdownRing, NfcPulse } from '../../ui/motion';
import { useNow } from '../../ui/useNow';
import { elevation, radius, space, useTheme, withAlpha } from '../../ui/theme';
import { offerView } from './offerView';

/** Ticks once a second while mounted (subscription to wall-clock time). */
export function OfferOverlay({ offer, onCancel, onDone, onShowQr }: { offer: ActiveOffer; onCancel: () => void; onDone: () => void; onShowQr: () => void }) {
  const theme = useTheme();
  const { color } = theme;
  const now = useNow(500);
  const view = offerView(offer, now, cafe.rules);
  const finished = view.stage === 'success' || view.stage === 'rejected' || view.stage === 'delivered';

  // Timers that end the offer: expiry while waiting, auto-close after success.
  useEffect(() => {
    if (finished) return;
    const id = setTimeout(onCancel, Math.max(0, offer.expiresAt - Date.now()));
    return () => clearTimeout(id);
  }, [finished, offer.expiresAt, onCancel]);
  useEffect(() => {
    if (!view.autoCloseMs) return;
    const id = setTimeout(onDone, view.autoCloseMs);
    return () => clearTimeout(id);
  }, [view.autoCloseMs, onDone]);

  const qrSize = 232;

  return (
    <Modal visible animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={finished ? onDone : onCancel}>
      <SafeAreaView style={[styles.root, { backgroundColor: color.background }]}>
        <View style={styles.top}>
          <AppText variant="overline" tone="accent">
            {view.overline}
          </AppText>
          {view.stage === 'waiting' ? (
            <View style={styles.countdown} accessibilityLabel={`${view.secondsLeft} seconds left`}>
              <CountdownRing size={40} progress={view.remaining} />
              <AppText variant="caption" tone="muted" style={styles.countdownText}>
                {view.secondsLeft}
              </AppText>
            </View>
          ) : null}
        </View>

        <View style={styles.center} accessibilityLiveRegion="assertive">
          {view.stage === 'success' ? (
            <Animated.View entering={ZoomIn.springify().damping(10)} style={[styles.badge, { backgroundColor: color.success }]}>
              <Check size={72} color={color.paper} strokeWidth={3} />
            </Animated.View>
          ) : view.stage === 'rejected' ? (
            <Animated.View entering={ZoomIn} style={[styles.badge, { backgroundColor: withAlpha(color.danger, 0.14) }]}>
              <CircleAlert size={72} color={color.danger} strokeWidth={2.4} />
            </Animated.View>
          ) : view.stage === 'delivered' ? (
            <Animated.View entering={ZoomIn} style={[styles.badge, { backgroundColor: color.accentSoft }]}>
              <Check size={72} color={color.accent} strokeWidth={3} />
            </Animated.View>
          ) : view.stage === 'reading' ? (
            <View style={[styles.badge, { backgroundColor: color.accentSoft }]}>
              <ActivityIndicator size="large" color={color.accent} />
            </View>
          ) : offer.qrVisible ? (
            <Animated.View entering={FadeIn} style={[styles.qrCard, { backgroundColor: '#FFFFFF' }, elevation(theme, 2)]}>
              <QRCode value={offer.link} size={qrSize} color="#1A120D" backgroundColor="#FFFFFF" ecl="M" quietZone={8} />
            </Animated.View>
          ) : (
            <NfcPulse icon={Smartphone} size={240} />
          )}

          <AppText variant="display" align="center" style={{ marginTop: space.xl }}>
            {view.title}
          </AppText>
          <AppText variant="body" tone="muted" align="center" style={{ marginTop: space.xs, maxWidth: 340 }}>
            {view.stage === 'waiting' && offer.qrVisible && offer.nfc ? `Scan with the ${cafe.name} app, or tap phones.` : view.body}
          </AppText>
        </View>

        <View style={styles.actions}>
          {finished ? (
            <Button size="lg" label="Done" onPress={onDone} />
          ) : (
            <>
              {offer.nfc && !offer.qrVisible && view.stage === 'waiting' ? (
                <Button size="lg" kind="secondary" icon={QrCode} label="Show QR code instead" onPress={onShowQr} />
              ) : null}
              <Button size="lg" kind="ghost" icon={X} label="Cancel" onPress={onCancel} />
            </>
          )}
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: space.lg },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 56, paddingTop: space.sm },
  countdown: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  countdownText: { position: 'absolute', fontVariant: ['tabular-nums'], fontWeight: '600' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  badge: { width: 160, height: 160, borderRadius: 80, alignItems: 'center', justifyContent: 'center' },
  qrCard: { padding: space.md, borderRadius: radius.lg },
  actions: { gap: space.xs, paddingBottom: space.md },
});
