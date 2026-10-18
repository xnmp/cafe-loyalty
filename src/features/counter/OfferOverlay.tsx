import { Check, CircleAlert, QrCode, ScanLine, Smartphone, X } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Modal, StyleSheet, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { cafe } from '../../config';
import type { ActiveOffer, ScanResult } from '../../state/counterStore';
import { Appear, CountdownRing, NfcPulse } from '../../ui/motion';
import { AppText, Button } from '../../ui/primitives';
import { elevation, radius, space, useTheme, withAlpha } from '../../ui/theme';
import { useNow } from '../../ui/useNow';
import { QrScanner } from '../scan/QrScanner';
import { offerView, type OfferStage } from './offerView';

const formatWhen = (at: number): string => {
  const d = new Date(at);
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  if (d.toDateString() === new Date().toDateString()) return `today at ${time}`;
  return `on ${d.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' })} at ${time}`;
};

const FINISHED: readonly OfferStage[] = ['success', 'rejected', 'delivered'];
/** Stages where the barista can still choose how the customer responds. */
const OPEN: readonly OfferStage[] = ['waiting', 'scan', 'stalled'];

interface OfferOverlayProps {
  readonly offer: ActiveOffer;
  readonly onCancel: () => void;
  readonly onDone: () => void;
  readonly onShowQr: () => void;
  readonly onScan: (text: string) => Promise<ScanResult>;
}

/** Mount with `key={offer.record.nonceId}` so each offer starts fresh. */
export function OfferOverlay({ offer, onCancel, onDone, onShowQr, onScan }: OfferOverlayProps) {
  const theme = useTheme();
  const { color } = theme;
  const now = useNow(500);
  const view = offerView(offer, now, { ...cafe.rules, formatWhen });
  const finished = FINISHED.includes(view.stage);
  const redeem = offer.record.kind === 'redeem';
  // Redemptions without NFC go straight to the camera.
  const [scanning, setScanning] = useState(redeem && !offer.nfc);
  const showScanner = redeem && scanning && OPEN.includes(view.stage);

  // Timers that end the offer: expiry while open, auto-close after success.
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

  const closeScanner = () => (offer.nfc ? setScanning(false) : onCancel());

  return (
    <Modal visible animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={finished ? onDone : showScanner ? closeScanner : onCancel}>
      {showScanner ? (
        <RedeemScanner onScan={onScan} onClose={closeScanner} />
      ) : (
        <SafeAreaView style={[styles.root, { backgroundColor: color.background }]}>
          <View style={styles.top}>
            <AppText variant="overline" tone="accent">
              {view.overline}
            </AppText>
            {OPEN.includes(view.stage) ? (
              <View style={styles.countdown} accessibilityLabel={`${view.secondsLeft} seconds left`}>
                <CountdownRing size={40} progress={view.remaining} />
                <AppText variant="caption" tone="muted" style={styles.countdownText}>
                  {view.secondsLeft}
                </AppText>
              </View>
            ) : null}
          </View>

          <View style={styles.center} accessibilityLiveRegion="assertive">
            <Visual offer={offer} stage={view.stage} />
            <AppText variant="display" align="center" style={{ marginTop: space.xl }}>
              {view.title}
            </AppText>
            <AppText variant="body" tone="muted" align="center" style={{ marginTop: space.xs, maxWidth: 340 }}>
              {view.stage === 'waiting' && offer.qrVisible && offer.nfc ? `Scan with the ${cafe.shortName} app, or tap phones.` : view.body}
            </AppText>
          </View>

          <View style={styles.actions}>
            {finished ? (
              <Button size="lg" label="Done" onPress={onDone} />
            ) : view.stage === 'checking' || view.stage === 'reading' ? null : (
              <>
                {redeem ? (
                  <Button size="lg" kind="secondary" icon={ScanLine} label="Scan their code" onPress={() => setScanning(true)} />
                ) : offer.nfc && !offer.qrVisible ? (
                  <Button size="lg" kind="secondary" icon={QrCode} label="Show QR code instead" onPress={onShowQr} />
                ) : null}
                <Button size="lg" kind="ghost" icon={X} label="Cancel" onPress={onCancel} />
              </>
            )}
          </View>
        </SafeAreaView>
      )}
    </Modal>
  );
}

function Visual({ offer, stage }: { offer: ActiveOffer; stage: OfferStage }) {
  const theme = useTheme();
  const { color } = theme;
  switch (stage) {
    case 'success':
      return (
        <Appear from="pop" style={[styles.badge, { backgroundColor: color.success }]}>
          <Check size={72} color={color.paper} strokeWidth={3} />
        </Appear>
      );
    case 'rejected':
      return (
        <Appear from="zoom" style={[styles.badge, { backgroundColor: withAlpha(color.danger, 0.14) }]}>
          <CircleAlert size={72} color={color.danger} strokeWidth={2.4} />
        </Appear>
      );
    case 'delivered':
      return (
        <Appear from="zoom" style={[styles.badge, { backgroundColor: color.accentSoft }]}>
          <Check size={72} color={color.accent} strokeWidth={3} />
        </Appear>
      );
    case 'reading':
    case 'checking':
      return (
        <View style={[styles.badge, { backgroundColor: color.accentSoft }]}>
          <ActivityIndicator size="large" color={color.accent} />
        </View>
      );
    case 'stalled':
      return (
        <View style={[styles.badge, { backgroundColor: color.accentSoft }]}>
          <Smartphone size={72} color={color.accent} strokeWidth={2} />
        </View>
      );
    case 'scan':
    case 'waiting':
      return offer.qrVisible ? (
        <Appear style={[styles.qrCard, { backgroundColor: '#FFFFFF' }, elevation(theme, 2)]}>
          <QRCode value={offer.link} size={232} color="#1A120D" backgroundColor="#FFFFFF" ecl="M" quietZone={8} />
        </Appear>
      ) : (
        <NfcPulse icon={Smartphone} size={240} />
      );
  }
}

/** Camera for the customer's redemption code, with a hint when something else is scanned. */
function RedeemScanner({ onScan, onClose }: { onScan: (text: string) => Promise<ScanResult>; onClose: () => void }) {
  const { color } = useTheme();
  const insets = useSafeAreaInsets();
  const [hint, setHint] = useState<string>();
  const busy = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // Clears the hint timer on unmount (a timer is an external resource).
  useEffect(() => () => clearTimeout(timer.current), []);

  const scanned = async (text: string) => {
    if (busy.current) return;
    busy.current = true;
    const result = await onScan(text).finally(() => {
      busy.current = false;
    });
    if (result === 'not-a-code') {
      clearTimeout(timer.current);
      setHint(`That's not a ${cafe.rules.rewardName} code`);
      timer.current = setTimeout(() => setHint(undefined), 2500);
    }
  };

  return (
    <View style={styles.fill}>
      <QrScanner
        guide={`Point at the ${cafe.rules.rewardName} code on their phone`}
        permissionReason={`The camera is only used to scan customers' ${cafe.rules.rewardName} codes.`}
        onScan={(text) => void scanned(text)}
        onClose={onClose}
      />
      {hint ? (
        <View pointerEvents="none" style={[styles.hint, { bottom: insets.bottom + space.xxl, backgroundColor: color.surface }]}>
          <AppText align="center" variant="callout" accessibilityLiveRegion="polite">
            {hint}
          </AppText>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  root: { flex: 1, paddingHorizontal: space.lg },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 56, paddingTop: space.sm },
  countdown: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  countdownText: { position: 'absolute', fontVariant: ['tabular-nums'], fontWeight: '600' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  badge: { width: 160, height: 160, borderRadius: 80, alignItems: 'center', justifyContent: 'center' },
  qrCard: { padding: space.md, borderRadius: radius.lg },
  actions: { gap: space.xs, paddingBottom: space.md },
  hint: { position: 'absolute', alignSelf: 'center', left: space.xl, right: space.xl, borderRadius: radius.pill, padding: space.md },
});
