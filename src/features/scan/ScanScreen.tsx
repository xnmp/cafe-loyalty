import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { cafe } from '../../config';
import { parseLink } from '../../domain/link';
import { useStores } from '../../state/AppProviders';
import { AppText } from '../../ui/primitives';
import { radius, space, useTheme } from '../../ui/theme';
import { submitWithFeedback } from '../card/submit';
import { QrScanner } from './QrScanner';

export function ScanScreen() {
  const stores = useStores();
  const { color } = useTheme();
  const insets = useSafeAreaInsets();
  const submitting = useRef(false);
  const active = useRef(true);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [message, setMessage] = useState<string>();
  useEffect(() => {
    active.current = true;
    return () => { active.current = false; clearTimeout(timer.current); };
  }, []);

  const showMessage = (text: string) => {
    clearTimeout(timer.current);
    setMessage(text);
    timer.current = setTimeout(() => setMessage(undefined), 2500);
  };
  const scan = async (data: string) => {
    if (submitting.current) return;
    if (parseLink(cafe.scheme, data)?.kind !== 'token') {
      showMessage("That code isn't one of ours");
      return;
    }
    submitting.current = true;
    try {
      await submitWithFeedback(stores.card, [data], 'qr');
      if (active.current) router.back();
    } catch {
      submitting.current = false;
      if (active.current) showMessage('That stamp could not be saved. Please scan again.');
    }
  };
  return (
    <View style={styles.fill}>
      <QrScanner guide="Point at the code on the counter screen" onScan={(data) => void scan(data)} onClose={() => { active.current = false; router.back(); }} />
      {message ? <View pointerEvents="none" style={[styles.message, { bottom: insets.bottom + space.xxl, backgroundColor: color.surface }]}><AppText align="center" variant="callout" accessibilityLiveRegion="polite">{message}</AppText></View> : null}
    </View>
  );
}
const styles = StyleSheet.create({
  fill: { flex: 1 },
  message: { position: 'absolute', alignSelf: 'center', left: space.xl, right: space.xl, borderRadius: radius.pill, padding: space.md },
});
