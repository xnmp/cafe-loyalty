import type { LucideIcon } from 'lucide-react-native';
import { useEffect, useMemo } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';

import { useTheme, withAlpha } from './theme';

/** Concentric rings radiating from an icon: "this is where to tap". */
export function NfcPulse({ icon: Icon, size = 160, active = true, tint }: { icon: LucideIcon; size?: number; active?: boolean; tint?: string }) {
  const { color } = useTheme();
  const c = tint ?? color.accent;
  const core = size * 0.42;
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {active ? [0, 1, 2].map((i) => <Ring key={i} index={i} size={size} color={c} />) : null}
      <View style={{ width: core, height: core, borderRadius: core / 2, backgroundColor: c, alignItems: 'center', justifyContent: 'center' }}>
        <Icon size={core * 0.48} color={color.onAccent} strokeWidth={2.2} />
      </View>
    </View>
  );
}

function Ring({ index, size, color }: { index: number; size: number; color: string }) {
  const reduceMotion = useReducedMotion();
  const style = useAnimatedStyle(() => {
    if (reduceMotion) return { opacity: 0.18 - index * 0.05, transform: [{ scale: 0.6 + index * 0.18 }] };
    const duration = 2400;
    return {
      opacity: withDelay(index * 800, withRepeat(withTiming(0, { duration, easing: Easing.out(Easing.quad) }), -1, false)),
      transform: [{ scale: withDelay(index * 800, withRepeat(withTiming(1, { duration, easing: Easing.out(Easing.quad) }), -1, false)) }],
    };
  }, [reduceMotion, index]);
  // Start values for the repeat: small and visible.
  return (
    <Animated.View
      style={[
        StyleSheet.absoluteFill,
        { borderRadius: size / 2, borderWidth: 2, borderColor: withAlpha(color, 0.5), backgroundColor: withAlpha(color, 0.08), opacity: 0.6, transform: [{ scale: 0.42 }] },
        style,
      ]}
    />
  );
}

/** Circular countdown ring. `progress` is a 0–1 shared value driven by the caller. */
export function CountdownRing({ size, progress, stroke = 4 }: { size: number; progress: number; stroke?: number }) {
  const { color } = useTheme();
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  return (
    <Svg width={size} height={size} style={{ transform: [{ rotate: '-90deg' }] }}>
      <Circle cx={size / 2} cy={size / 2} r={r} stroke={color.line} strokeWidth={stroke} fill="none" />
      <Circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        stroke={color.accent}
        strokeWidth={stroke}
        fill="none"
        strokeLinecap="round"
        strokeDasharray={`${circumference} ${circumference}`}
        strokeDashoffset={circumference * (1 - Math.max(0, Math.min(1, progress)))}
      />
    </Svg>
  );
}

/** A short, tasteful burst of paper confetti. Renders nothing with reduced motion. */
export function Confetti({ count = 28 }: { count?: number }) {
  const { color } = useTheme();
  const { width, height } = useWindowDimensions();
  const reduceMotion = useReducedMotion();
  const pieces = useMemo(() => {
    let s = 1234567;
    const rand = () => ((s = (Math.imul(s, 1103515245) + 12345) >>> 0) / 0x100000000);
    const palette = [color.accent, color.ink, color.success, color.line, color.accent];
    return Array.from({ length: count }, (_, i) => ({
      x: rand() * width,
      drift: (rand() - 0.5) * 120,
      delay: rand() * 350,
      duration: 1600 + rand() * 1200,
      w: 6 + rand() * 6,
      h: 10 + rand() * 8,
      spin: (rand() > 0.5 ? 1 : -1) * (360 + rand() * 540),
      color: palette[i % palette.length],
    }));
  }, [count, width, color]);
  if (reduceMotion) return null;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {pieces.map((p, i) => (
        <Piece key={i} {...p} fall={height * 0.9} />
      ))}
    </View>
  );
}

function Piece({ x, drift, delay, duration, w, h, spin, color, fall }: { x: number; drift: number; delay: number; duration: number; w: number; h: number; spin: number; color: string; fall: number }) {
  const t = useSharedValue(0);
  useEffect(() => {
    // Kick off the fall on mount (an animation side effect, not state sync).
    t.value = withDelay(delay, withTiming(1, { duration, easing: Easing.in(Easing.quad) }));
  }, [t, delay, duration]);
  const style = useAnimatedStyle(() => ({
    opacity: 1 - t.value * t.value,
    transform: [{ translateX: x + drift * t.value }, { translateY: -40 + fall * t.value }, { rotate: `${spin * t.value}deg` }],
  }));
  return <Animated.View style={[{ position: 'absolute', left: 0, top: 0, width: w, height: h, borderRadius: 2, backgroundColor: color }, style]} />;
}
