import type { LucideIcon } from 'lucide-react-native';
import { useEffect, useMemo, type ReactNode } from 'react';
import { StyleSheet, View, useWindowDimensions, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  Reanimated3DefaultSpringConfig,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';

import { useTheme, withAlpha } from './theme';

/**
 * `withSpring` on Reanimated 3's defaults (mass 1, stiffness 100, damping 10),
 * which every spring in the app is tuned against. Reanimated 4 changed them to
 * mass 4, stiffness 900 and damping 120, which made those springs twice as slow
 * and far bouncier: the bottom sheet flew a third of the screen past its place.
 * Use this, never `withSpring` directly (lint enforces it).
 */
export function spring(toValue: number, config: { damping?: number; stiffness?: number; mass?: number } = {}) {
  'worklet';
  return withSpring(toValue, { ...Reanimated3DefaultSpringConfig, ...config });
}

export type AppearFrom = 'fade' | 'zoom' | 'pop' | 'rise';

/**
 * Animates its content in when it mounts. Use this instead of Reanimated
 * `entering` layout animations: inside an Android Modal those intermittently
 * leave the view stuck at its start values (invisible).
 */
export function Appear({ from = 'fade', delay = 0, style, children }: { from?: AppearFrom; delay?: number; style?: StyleProp<ViewStyle>; children?: ReactNode }) {
  const reduceMotion = useReducedMotion();
  const p = useSharedValue(reduceMotion ? 1 : 0);
  useEffect(() => {
    if (reduceMotion) return;
    // Kick off the entrance on mount (an animation side effect, not state sync).
    const to =
      from === 'fade' ? withTiming(1, { duration: 200, easing: Easing.out(Easing.quad) })
      : from === 'pop' ? spring(1, { damping: 9, stiffness: 200 })
      : from === 'zoom' ? spring(1, { damping: 14, stiffness: 180 })
      : spring(1, { damping: 16, stiffness: 160 });
    p.set(delay > 0 ? withDelay(delay, to) : to);
  }, [p, from, delay, reduceMotion]);
  const animated = useAnimatedStyle(() => {
    const v = p.get();
    const opacity = Math.min(1, v * 2);
    if (from === 'fade') return { opacity: v };
    if (from === 'rise') return { opacity, transform: [{ translateY: (1 - v) * 24 }] };
    return { opacity, transform: [{ scale: 0.3 + 0.7 * v }] };
  });
  return <Animated.View style={[style, animated]}>{children}</Animated.View>;
}

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

/** Stable pseudo-random number in [0, 1) for an integer (integer hash), so the burst looks the same every time. */
function noise(n: number): number {
  let h = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 0x100000000;
}

/** A short, tasteful burst of paper confetti. Renders nothing with reduced motion. */
export function Confetti({ count = 28 }: { count?: number }) {
  const { color } = useTheme();
  const { width, height } = useWindowDimensions();
  const reduceMotion = useReducedMotion();
  const pieces = useMemo(() => {
    const palette = [color.accent, color.ink, color.success, color.line, color.accent];
    return Array.from({ length: count }, (_, i) => {
      const r = (k: number) => noise(i * 8 + k);
      return {
        x: r(0) * width,
        drift: (r(1) - 0.5) * 120,
        delay: r(2) * 350,
        duration: 1600 + r(3) * 1200,
        w: 6 + r(4) * 6,
        h: 10 + r(5) * 8,
        spin: (r(6) > 0.5 ? 1 : -1) * (360 + r(7) * 540),
        color: palette[i % palette.length],
      };
    });
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
    t.set(withDelay(delay, withTiming(1, { duration, easing: Easing.in(Easing.quad) })));
  }, [t, delay, duration]);
  const style = useAnimatedStyle(() => ({
    opacity: 1 - t.value * t.value,
    transform: [{ translateX: x + drift * t.value }, { translateY: -40 + fall * t.value }, { rotate: `${spin * t.value}deg` }],
  }));
  return <Animated.View style={[{ position: 'absolute', left: 0, top: 0, width: w, height: h, borderRadius: 2, backgroundColor: color }, style]} />;
}
