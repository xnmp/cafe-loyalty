import { Gift, Nfc, QrCode, Smartphone } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import { cafe } from '../../config';
import { useStores } from '../../state/AppProviders';
import { Appear, NfcPulse } from '../../ui/motion';
import { AppText, Button } from '../../ui/primitives';
import { Sheet } from '../../ui/Sheet';
import { elevation, radius, space, useTheme, withAlpha } from '../../ui/theme';
import type { TapController } from './useTapToCollect';

type Step = { readonly kind: 'intro'; readonly error?: string } | { readonly kind: 'code'; readonly link: string };

/**
 * Using a reward. While this is open a tap on the counter phone may spend it
 * (the caller passes that to the tap controller); nothing else can. Or the
 * customer shows a code and the counter phone scans it. Showing the code spends
 * the reward on this phone; it stays in History so it can be shown again if it
 * was never scanned. Mount with a fresh `key` each time it opens.
 */
export function RedeemSheet({
  visible,
  count,
  tap,
  onCodeShown,
  onClose,
}: {
  visible: boolean;
  count: number;
  tap: TapController;
  onCodeShown: () => void;
  onClose: () => void;
}) {
  const { card } = useStores();
  const [step, setStep] = useState<Step>({ kind: 'intro' });
  const [busy, setBusy] = useState(false);
  const { rewardName } = cafe.rules;
  const nfcReady = tap.availability === 'ready';

  const showCode = async () => {
    if (busy) return;
    setBusy(true);
    const result = await card.redeemWithCode();
    setBusy(false);
    if (result.ok) {
      setStep({ kind: 'code', link: result.value.link });
      onCodeShown();
    } else setStep({ kind: 'intro', error: result.error === 'no-reward' ? `There's no ${rewardName} on your card right now.` : "Couldn't save that. Free up some space and try again." });
  };

  return (
    <Sheet visible={visible} onDismiss={onClose}>
      {step.kind === 'code' ? (
        <RedemptionCode link={step.link} onDone={onClose} />
      ) : (
        <View style={styles.content}>
          <GiftBadge />
          <AppText variant="title" align="center" style={{ marginTop: space.lg }}>
            {count > 1 ? `${count} ${rewardName}s ready` : `Your ${rewardName}`}
          </AppText>
          <AppText tone="muted" align="center" style={styles.body}>
            {nfcReady
              ? 'Ask for it when you order. When the barista is ready, hold your phone to the counter phone.'
              : 'Ask for it when you order. When the barista is ready, show them your code.'}
          </AppText>
          {step.error ? (
            <AppText variant="callout" tone="danger" align="center" accessibilityLiveRegion="polite" style={{ marginTop: space.sm }}>
              {step.error}
            </AppText>
          ) : null}
          {nfcReady ? (
            tap.passive ? (
              <ReadyToTap />
            ) : (
              <Button icon={Nfc} label="Tap the counter phone" busy={tap.reading} onPress={tap.startSession} style={styles.primary} />
            )
          ) : null}
          <Button
            icon={QrCode}
            kind={nfcReady ? 'secondary' : 'primary'}
            label="Show my code"
            busy={busy}
            onPress={() => void showCode()}
            style={nfcReady ? styles.secondary : styles.primary}
          />
          <AppText variant="caption" tone="muted" align="center" style={{ marginTop: space.xs }}>
            {`Showing the code uses ${count > 1 ? `one ${rewardName}` : `your ${rewardName}`}.`}
          </AppText>
          <Button kind="ghost" label="Not now" onPress={onClose} style={{ alignSelf: 'stretch', marginTop: space.xs }} />
        </View>
      )}
    </Sheet>
  );
}

/** A past redemption's code, shown again from History. */
export function CodeSheet({ link, onClose }: { link: string | null; onClose: () => void }) {
  return (
    <Sheet visible={link !== null} onDismiss={onClose}>
      {link ? <RedemptionCode link={link} onDone={onClose} again /> : null}
    </Sheet>
  );
}

function RedemptionCode({ link, onDone, again = false }: { link: string; onDone: () => void; again?: boolean }) {
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const size = Math.min(width - space.xxl * 2 - space.md * 2, 300);
  return (
    <Appear style={styles.content}>
      <View style={[styles.qrCard, elevation(theme, 2)]} accessible accessibilityLabel={`${cafe.rules.rewardName} code`}>
        {/* Dense code (it carries the signed stamps); low error correction keeps the modules large. */}
        <QRCode value={link} size={size} color="#1A120D" backgroundColor="#FFFFFF" ecl="L" quietZone={10} />
      </View>
      <AppText variant="title" align="center" style={{ marginTop: space.lg }}>
        Show this to the barista
      </AppText>
      <AppText tone="muted" align="center" style={styles.body}>
        {again
          ? "If it was used before, the counter phone will say so."
          : 'They scan it with the counter phone. If it isn’t scanned, you can show it again from History.'}
      </AppText>
      <Button label="Done" onPress={onDone} style={styles.primary} />
    </Appear>
  );
}

/** Android keeps reading while the sheet is open, so there's nothing to press. */
function ReadyToTap() {
  const { color } = useTheme();
  return (
    <View
      style={[styles.ready, { borderColor: withAlpha(color.accent, 0.35), backgroundColor: withAlpha(color.accent, 0.06) }]}
      accessible
      accessibilityLabel="Ready. Hold your phone against the back of the counter phone."
    >
      <NfcPulse icon={Smartphone} size={52} />
      <View style={{ flex: 1 }}>
        <AppText variant="heading">Ready to tap</AppText>
        <AppText variant="caption" tone="muted" style={{ marginTop: 2 }}>
          Hold it against the back of the counter phone.
        </AppText>
      </View>
    </View>
  );
}

function GiftBadge() {
  const { color } = useTheme();
  return (
    <Appear from="pop" style={[styles.badge, { backgroundColor: color.accent }]}>
      <Gift size={40} color={color.onAccent} strokeWidth={2} />
    </Appear>
  );
}

const styles = StyleSheet.create({
  content: { alignItems: 'center', paddingBottom: space.xs },
  body: { marginTop: space.xs, maxWidth: 320 },
  primary: { alignSelf: 'stretch', marginTop: space.xl },
  secondary: { alignSelf: 'stretch', marginTop: space.md },
  ready: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    marginTop: space.xl,
    padding: space.md,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth * 2,
  },
  badge: { width: 88, height: 88, borderRadius: 44, alignItems: 'center', justifyContent: 'center' },
  qrCard: { backgroundColor: '#FFFFFF', borderRadius: radius.lg, padding: space.md, marginTop: space.sm },
});
