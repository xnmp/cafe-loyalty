import { Gift, QrCode } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import { cafe } from '../../config';
import { useStores } from '../../state/AppProviders';
import { Appear } from '../../ui/motion';
import { AppText, Button } from '../../ui/primitives';
import { Sheet } from '../../ui/Sheet';
import { elevation, radius, space, useTheme } from '../../ui/theme';

type Step = { readonly kind: 'intro'; readonly error?: string } | { readonly kind: 'code'; readonly link: string };

/**
 * Using a reward without NFC: the customer shows a code and the counter phone
 * scans it. Showing the code spends the reward on this phone; it stays in
 * History so it can be shown again if it was never scanned. Mount with a fresh
 * `key` each time it opens.
 */
export function RedeemSheet({ visible, count, onClose }: { visible: boolean; count: number; onClose: () => void }) {
  const { card } = useStores();
  const [step, setStep] = useState<Step>({ kind: 'intro' });
  const [busy, setBusy] = useState(false);
  const { rewardName } = cafe.rules;

  const showCode = async () => {
    if (busy) return;
    setBusy(true);
    const result = await card.redeemWithCode();
    setBusy(false);
    if (result.ok) setStep({ kind: 'code', link: result.value.link });
    else setStep({ kind: 'intro', error: result.error === 'no-reward' ? `There's no ${rewardName} on your card right now.` : "Couldn't save that. Free up some space and try again." });
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
            Ask for it when you order. When the barista is ready, tap your phone on the counter phone — or show them a code.
          </AppText>
          {step.error ? (
            <AppText variant="callout" tone="danger" align="center" accessibilityLiveRegion="polite" style={{ marginTop: space.sm }}>
              {step.error}
            </AppText>
          ) : null}
          <Button icon={QrCode} label="Show my code" busy={busy} onPress={() => void showCode()} style={styles.primary} />
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
          ? "If it was scanned before, the counter phone will say so."
          : 'They scan it with the counter phone. If it isn’t scanned, you can show it again from History.'}
      </AppText>
      <Button label="Done" onPress={onDone} style={styles.primary} />
    </Appear>
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
  badge: { width: 88, height: 88, borderRadius: 44, alignItems: 'center', justifyContent: 'center' },
  qrCard: { backgroundColor: '#FFFFFF', borderRadius: radius.lg, padding: space.md, marginTop: space.sm },
});
