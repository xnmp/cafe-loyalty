import { Delete } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';

import { AppText, Squishy } from './primitives';
import { radius, space, useTheme } from './theme';

interface PinPadProps {
  readonly title: string;
  readonly subtitle?: string;
  readonly length?: number;
  readonly error?: string;
  readonly onComplete: (pin: string) => void;
  readonly disabled?: boolean;
}

export function PinPad({ title, subtitle, length = 4, error, onComplete, disabled }: PinPadProps) {
  const { color } = useTheme();
  const { height, width } = useWindowDimensions();
  const [availableHeight, setAvailableHeight] = useState(height);
  const [headingHeight, setHeadingHeight] = useState(180);
  const digits = useRef('');
  const [entry, setEntry] = useState('');
  const [previousError, setPreviousError] = useState(error);
  const reduceMotion = useReducedMotion();
  const offset = useSharedValue(0);
  const animated = useAnimatedStyle(() => ({ transform: [{ translateX: offset.value }] }));
  const count = Number.isInteger(length) && length > 0 && length <= 8 ? length : 4;
  // Reserve room for the modal header, safe areas, title, subtitle and error.
  const keySize = Math.max(44, Math.min(76, (availableHeight - headingHeight - space.lg * 2 - space.sm * 3) / 4, (width - space.xxxl * 2) / 3));

  if (previousError !== error) {
    setPreviousError(error);
    if (error) {
      digits.current = '';
      setEntry('');
    }
  }

  useEffect(() => {
    if (!error || disabled) return;
    offset.value = reduceMotion ? 0 : withSequence(
      withTiming(-space.xs, { duration: 60 }), withTiming(space.xs, { duration: 90 }),
      withTiming(-space.xxs, { duration: 70 }), withTiming(0, { duration: 60 }),
    );
  }, [disabled, error, offset, reduceMotion]);

  const enter = (digit: string) => {
    if (disabled || digits.current.length >= count) return;
    const next = digits.current + digit;
    digits.current = next;
    setEntry(next);
    if (next.length === count) onComplete(next);
  };
  const remove = () => {
    if (disabled) return;
    digits.current = digits.current.slice(0, -1);
    setEntry(digits.current);
  };

  return (
    <ScrollView onLayout={({ nativeEvent }) => setAvailableHeight(nativeEvent.layout.height)} contentContainerStyle={styles.scroll} bounces={false}>
      <View onLayout={({ nativeEvent }) => setHeadingHeight(nativeEvent.layout.height)} style={styles.heading}>
        <AppText variant="title" align="center" accessibilityRole="header">{title}</AppText>
        {subtitle ? <AppText tone="muted" align="center" style={styles.subtitle}>{subtitle}</AppText> : null}
        <Animated.View style={[styles.dots, animated]} accessible accessibilityLabel={`${entry.length} of ${count} digits entered`} accessibilityLiveRegion="polite">
          {Array.from({ length: count }, (_, i) => <View key={i} style={[styles.dot, { borderColor: i < entry.length ? color.ink : color.line, backgroundColor: i < entry.length ? color.ink : 'transparent' }]} />)}
        </Animated.View>
        <AppText variant="callout" tone="danger" align="center" accessibilityLiveRegion="polite" style={styles.error}>{error ?? ' '}</AppText>
      </View>
      <View style={[styles.keys, { width: keySize * 3 + space.sm * 2 }]}>
        {['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'delete'].map((key, i) => (
          <View key={key || `empty-${i}`} style={{ width: keySize, height: keySize }}>
            {key ? <Squishy accessibilityLabel={key === 'delete' ? 'Delete last digit' : key} disabled={disabled} onPress={() => key === 'delete' ? remove() : enter(key)} style={[styles.key, { backgroundColor: color.surface, borderColor: color.line, opacity: disabled ? 0.45 : 1 }]}>
              {key === 'delete' ? <Delete size={space.xl} color={color.ink} strokeWidth={2} /> : <AppText variant="display">{key}</AppText>}
            </Squishy> : null}
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: space.lg },
  heading: { alignSelf: 'stretch', alignItems: 'center' },
  subtitle: { marginTop: space.xs, maxWidth: 360 },
  dots: { flexDirection: 'row', gap: space.md, marginTop: space.xl },
  dot: { width: 14, height: 14, borderRadius: radius.pill, borderWidth: StyleSheet.hairlineWidth },
  error: { marginTop: space.sm, marginBottom: space.md },
  keys: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: space.sm, maxWidth: 76 * 3 + space.sm * 2 },
  key: { flex: 1, borderRadius: radius.pill, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center' },
});
