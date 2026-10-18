import { CameraView, useCameraPermissions } from 'expo-camera';
import { Camera, X } from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Linking, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import { AppText, Button, IconButton, Screen } from '../../ui/primitives';
import { radius, space, ThemeContext, themeFor, useTheme, withAlpha } from '../../ui/theme';
import { acceptScan } from './scanThrottle';

interface QrScannerProps {
  readonly onScan: (data: string) => void;
  readonly guide: string;
  readonly onClose: () => void;
  /** Shown when asking for camera access. */
  readonly permissionReason?: string;
}

export function QrScanner({ onScan, guide, onClose, permissionReason = 'The camera is only used to scan the code on the counter screen or a staff code.' }: QrScannerProps) {
  const { color } = useTheme();
  const [permission, requestPermission, refreshPermission] = useCameraPermissions();
  const [error, setError] = useState<string>();
  const [requesting, setRequesting] = useState(false);
  const recent = useRef<ReadonlyMap<string, number>>(new Map());
  const window = useWindowDimensions();
  const [layout, setLayout] = useState<{ width: number; height: number }>();
  const { width, height } = layout ?? window;
  const scannerTheme = themeFor(false);
  const insets = useSafeAreaInsets();
  const side = Math.min(width * 0.7, height * 0.45);
  const left = (width - side) / 2;
  const top = (height - side) / 2 - space.xl;
  const r = radius.lg;
  const mask = withAlpha(themeFor(true).color.background, 0.82);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refreshPermission().catch(() => setError('Camera access could not be checked. Try again.'));
    });
    return () => sub.remove();
  }, [refreshPermission]);

  const scanned = useCallback(({ data }: { data: string }) => {
    const next = acceptScan(recent.current, data, Date.now());
    if (!next) return;
    recent.current = next;
    onScan(data);
  }, [onScan]);

  if (!permission?.granted) {
    const blocked = permission?.canAskAgain === false;
    const allow = async () => {
      if (requesting) return;
      setRequesting(true);
      setError(undefined);
      try {
        if (blocked) await Linking.openSettings();
        else await requestPermission();
      } catch {
        setError(blocked ? 'Settings could not be opened. Try again.' : 'Camera access could not be requested. Try again.');
      } finally {
        setRequesting(false);
      }
    };
    return (
      <Screen>
        <View style={[styles.close, { top: insets.top + space.xs }]}><IconButton icon={X} label="Close scanner" onPress={onClose} /></View>
        <ScrollView contentContainerStyle={styles.permission}>
          <View style={[styles.cameraIcon, { backgroundColor: color.accentSoft }]}><Camera size={space.xxxl} color={color.accent} strokeWidth={2} /></View>
          <AppText variant="title" accessibilityRole="header" align="center">Allow camera</AppText>
          <AppText tone="muted" align="center">{permissionReason}</AppText>
          {blocked ? <AppText variant="callout" tone="muted" align="center">Allow camera access in your phone’s settings.</AppText> : null}
          {error ? <AppText tone="danger" accessibilityLiveRegion="polite">{error}</AppText> : null}
          <Button label={blocked ? 'Open Settings' : 'Allow camera'} busy={requesting} onPress={() => void allow()} />
          <Button label="Not now" kind="ghost" onPress={onClose} />
        </ScrollView>
      </Screen>
    );
  }

  // The inner subpath is a rounded square cut out of the mask.
  const cutout = `M${left + r},${top} H${left + side - r} Q${left + side},${top} ${left + side},${top + r} V${top + side - r} Q${left + side},${top + side} ${left + side - r},${top + side} H${left + r} Q${left},${top + side} ${left},${top + side - r} V${top + r} Q${left},${top} ${left + r},${top} Z`;
  return (
    <ThemeContext.Provider value={scannerTheme}>
      <View onLayout={({ nativeEvent }) => setLayout(nativeEvent.layout)} style={[styles.fill, { backgroundColor: themeFor(true).color.background }]}>
        <CameraView style={StyleSheet.absoluteFill} facing="back" barcodeScannerSettings={{ barcodeTypes: ['qr'] }} onBarcodeScanned={scanned} onMountError={() => setError('The camera could not start. Close the scanner and try again.')} />
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
          <Svg width={width} height={height}><Path d={`M0,0 H${width} V${height} H0 Z ${cutout}`} fill={mask} fillRule="evenodd" /></Svg>
          <View style={{ position: 'absolute', top, left, width: side, height: side }}>
            {(['tl', 'tr', 'bl', 'br'] as const).map((corner) => <View key={corner} style={[styles.bracket, { borderColor: scannerTheme.color.onAccent }, corner[0] === 't' ? styles.top : styles.bottom, corner[1] === 'l' ? styles.left : styles.right]} />)}
          </View>
          <View style={[styles.guide, { top: top + side + space.xl }]}>
            <AppText tone="onAccent" align="center">{guide}</AppText>
            {error ? <AppText tone="onAccent" align="center" accessibilityLiveRegion="polite" style={{ marginTop: space.md }}>{error}</AppText> : null}
          </View>
        </View>
        <View style={[styles.close, { top: insets.top + space.xs }]}><IconButton icon={X} label="Close scanner" onPress={onClose} tone="onAccent" /></View>
      </View>
    </ThemeContext.Provider>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  close: { paddingHorizontal: space.lg, paddingTop: space.xs, position: 'absolute', top: space.xs, left: 0, zIndex: 1 },
  permission: { flexGrow: 1, justifyContent: 'center', padding: space.xl, gap: space.md, paddingTop: space.xxxl * 2 },
  cameraIcon: { width: space.xxxl * 2, height: space.xxxl * 2, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginBottom: space.sm },
  guide: { position: 'absolute', left: space.xxl, right: space.xxl },
  bracket: { position: 'absolute', width: space.xxxl, height: space.xxxl },
  top: { top: 0, borderTopWidth: 2 },
  bottom: { bottom: 0, borderBottomWidth: 2 },
  left: { left: 0, borderLeftWidth: 2, borderTopLeftRadius: radius.lg, borderBottomLeftRadius: radius.lg },
  right: { right: 0, borderRightWidth: 2, borderTopRightRadius: radius.lg, borderBottomRightRadius: radius.lg },
});
