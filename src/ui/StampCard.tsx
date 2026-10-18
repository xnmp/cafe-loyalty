import { Coffee, Gift } from 'lucide-react-native';
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Path } from 'react-native-svg';

import { AppText } from './primitives';
import { elevation, font, radius, space, useTheme, withAlpha } from './theme';

/**
 * The hero object: a paper punch card. Collected stamps look hand-inked —
 * slightly wobbly edge, missing-ink speckles, a little rotation — and land
 * with a rubber-stamp thump. The last slot is the reward.
 */

/** Deterministic PRNG so every slot always looks the same. */
function prng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s ^ (s >>> 15), 0x2c1b3c6d) + 0x9e3779b9) >>> 0;
    return s / 0x100000000;
  };
}

/** A closed, slightly irregular circle, like an inked rubber stamp edge. */
function inkedCirclePath(cx: number, cy: number, r: number, seed: number): string {
  const rand = prng(seed);
  const n = 30;
  const pts = Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    const rr = r * (1 + (rand() - 0.5) * 0.06);
    return [cx + Math.cos(a) * rr, cy + Math.sin(a) * rr] as const;
  });
  const mid = (i: number) => {
    const [x1, y1] = pts[i % n];
    const [x2, y2] = pts[(i + 1) % n];
    return [(x1 + x2) / 2, (y1 + y2) / 2] as const;
  };
  const [sx, sy] = mid(n - 1);
  const segments = pts.map(([x, y], i) => {
    const [mx, my] = mid(i);
    return `Q${x.toFixed(2)} ${y.toFixed(2)} ${mx.toFixed(2)} ${my.toFixed(2)}`;
  });
  return `M${sx.toFixed(2)} ${sy.toFixed(2)} ${segments.join(' ')} Z`;
}

function speckles(size: number, seed: number) {
  const rand = prng(seed * 7919);
  return Array.from({ length: 9 }, () => {
    const a = rand() * Math.PI * 2;
    const d = Math.sqrt(rand()) * size * 0.42;
    return { cx: size / 2 + Math.cos(a) * d, cy: size / 2 + Math.sin(a) * d, r: 0.5 + rand() * size * 0.025 };
  });
}

const ROTATIONS = [-14, 9, -6, 12, -10, 5, -12, 8, -4, 11, -8, 6, -13, 10, -5, 7, -11, 4, -7, 13];

export function InkedStamp({ size, index }: { size: number; index: number }) {
  const { color } = useTheme();
  const path = useMemo(() => inkedCirclePath(size / 2, size / 2, size * 0.46, index + 11), [size, index]);
  const dots = useMemo(() => speckles(size, index + 3), [size, index]);
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <Path d={path} fill={withAlpha(color.accent, 0.92)} />
        <Circle cx={size / 2} cy={size / 2} r={size * 0.36} stroke={withAlpha(color.paper, 0.45)} strokeWidth={1.2} fill="none" />
        {dots.map((d, i) => (
          <Circle key={i} cx={d.cx} cy={d.cy} r={d.r} fill={withAlpha(color.paper, 0.35)} />
        ))}
      </Svg>
      <Coffee size={size * 0.42} color={color.paper} strokeWidth={2.2} />
    </View>
  );
}

/**
 * Runs `animate` whenever `value` changes after the first render; the initial
 * value is shown without animation. Imperative by nature: it drives UI-thread
 * animations in response to a prop change.
 */
function useOnChange<T>(value: T, animate: (value: T) => void) {
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    animate(value);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
}

const Slot = memo(function Slot({ size, index, filled, delay }: { size: number; index: number; filled: boolean; delay: number }) {
  const { color } = useTheme();
  const reduceMotion = useReducedMotion();
  const rotation = ROTATIONS[index % ROTATIONS.length];
  const opacity = useSharedValue(filled ? 1 : 0);
  const scale = useSharedValue(1);
  const turn = useSharedValue(rotation);

  useOnChange(filled, (isFilled) => {
    if (reduceMotion) {
      opacity.set(isFilled ? 1 : 0);
      return;
    }
    if (isFilled) {
      // Rubber stamp: comes down big and twisted, lands with a spring.
      opacity.set(withDelay(delay, withTiming(1, { duration: 80 })));
      scale.set(withDelay(delay, withSequence(withTiming(1.7, { duration: 0 }), withSpring(1, { damping: 11, stiffness: 260, mass: 0.7 }))));
      turn.set(withDelay(delay, withSequence(withTiming(rotation - 18, { duration: 0 }), withSpring(rotation, { damping: 12 }))));
    } else {
      opacity.set(withDelay(index * 40, withTiming(0, { duration: 220 })));
      scale.set(1);
    }
  });

  const inkStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }, { rotate: `${turn.value}deg` }],
  }));

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <Circle cx={size / 2} cy={size / 2} r={size * 0.44} stroke={color.line} strokeWidth={1.5} strokeDasharray="3 4" fill="none" />
      </Svg>
      <Coffee size={size * 0.36} color={withAlpha(color.inkMuted, 0.22)} strokeWidth={1.8} />
      <Animated.View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }, inkStyle]}>
        <InkedStamp size={size} index={index} />
      </Animated.View>
    </View>
  );
});

function RewardSlot({ size, lit, label }: { size: number; lit: boolean; label: string }) {
  const { color } = useTheme();
  const reduceMotion = useReducedMotion();
  const glow = useSharedValue(lit ? 1 : 0);
  const pop = useSharedValue(1);
  useOnChange(lit, (isLit) => {
    if (reduceMotion) {
      glow.set(isLit ? 1 : 0);
      return;
    }
    glow.set(withTiming(isLit ? 1 : 0, { duration: 260 }));
    if (isLit) pop.set(withDelay(1500, withSequence(withSpring(1.22, { damping: 6 }), withSpring(1))));
  });
  const glowStyle = useAnimatedStyle(() => ({ opacity: glow.value, transform: [{ scale: pop.value }] }));
  return (
    <View style={{ width: size, alignItems: 'center' }}>
      <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
        <View
          style={[
            StyleSheet.absoluteFill,
            { margin: size * 0.06, borderRadius: size, borderWidth: 1.5, borderColor: withAlpha(color.accent, 0.55), backgroundColor: color.accentSoft },
          ]}
        />
        <Animated.View style={[StyleSheet.absoluteFill, { margin: size * 0.06, borderRadius: size, backgroundColor: color.accent }, glowStyle]} />
        <Gift size={size * 0.4} color={lit ? color.onAccent : color.accent} strokeWidth={2} />
      </View>
      <AppText variant="overline" tone="accent" style={{ fontSize: 9, letterSpacing: 1.2, marginTop: 2 }} numberOfLines={1}>
        {label}
      </AppText>
    </View>
  );
}

export interface StampCardProps {
  cafeName: string;
  stampsPerReward: number;
  /** Stamps currently shown as inked (0..stampsPerReward). */
  filled: number;
  /** First newly filled slot; later ones land one after another from here. */
  staggerFrom: number;
  /** Light up the reward slot (card complete). */
  rewardLit: boolean;
  caption: string;
}

const REWARD = -1;

const chunk = <T,>(items: readonly T[], size: number): T[][] =>
  Array.from({ length: Math.ceil(items.length / size) }, (_, i) => items.slice(i * size, i * size + size));

/** Grid layout: one row up to 6 slots, else two rows, else three. */
export function gridFor(slots: number): { rows: number; cols: number } {
  const rows = slots <= 6 ? 1 : slots <= 12 ? 2 : 3;
  return { rows, cols: Math.ceil(slots / rows) };
}

export function StampCard({ cafeName, stampsPerReward, filled, staggerFrom, rewardLit, caption }: StampCardProps) {
  const theme = useTheme();
  const { color } = theme;
  // Measured on the grid itself so borders/padding can't make a row overflow and wrap.
  const [gridWidth, setGridWidth] = useState(0);
  const total = stampsPerReward + 1;
  const { cols } = gridFor(total);
  const gap = space.xs;
  const size = gridWidth > 0 ? Math.min(64, Math.floor((gridWidth - gap * (cols - 1) - 1) / cols)) : 0;

  return (
    <View
      style={[styles.card, { backgroundColor: color.paper, borderColor: withAlpha(color.ink, theme.dark ? 0.12 : 0.06) }, elevation(theme, 2)]}
      accessible
      accessibilityRole="summary"
      accessibilityLabel={`${cafeName} loyalty card. ${filled} of ${stampsPerReward} stamps. ${caption}`}
    >
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <AppText variant="overline" tone="muted">
            Loyalty card
          </AppText>
          <AppText style={{ fontFamily: font.display, fontSize: 22, lineHeight: 28, marginTop: 2 }} numberOfLines={1}>
            {cafeName}
          </AppText>
        </View>
        <View style={[styles.seal, { borderColor: withAlpha(color.accent, 0.5) }]}>
          <AppText style={{ fontFamily: font.displayBold, fontSize: 18, color: color.accent }}>{cafeName.trim().charAt(0).toUpperCase()}</AppText>
        </View>
      </View>

      <View style={styles.gridFrame} onLayout={(e: LayoutChangeEvent) => setGridWidth(e.nativeEvent.layout.width)}>
      {size > 0 ? (
        <View style={{ gap: space.sm }}>
          {chunk([...Array.from({ length: stampsPerReward }, (_, i) => i), REWARD], cols).map((row, r) => (
            <View key={r} style={[styles.row, { gap }]}>
              {row.map((i) =>
                i === REWARD ? (
                  <RewardSlot key="reward" size={size} lit={rewardLit} label="Free" />
                ) : (
                  <Slot key={i} size={size} index={i} filled={i < filled} delay={Math.max(0, i - staggerFrom) * 170} />
                ),
              )}
            </View>
          ))}
        </View>
      ) : (
        <View style={{ height: 140 }} />
      )}
      </View>

      <View style={[styles.perforation, { borderColor: color.line }]} />
      <AppText variant="callout" tone="muted" style={{ paddingHorizontal: space.xl }}>
        {caption}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
    paddingTop: space.lg,
    paddingBottom: space.lg,
    overflow: 'visible',
  },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.xl, marginBottom: space.lg },
  seal: { width: 40, height: 40, borderRadius: 20, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  gridFrame: { marginHorizontal: space.xl },
  row: { flexDirection: 'row', justifyContent: 'center', alignItems: 'flex-start' },
  perforation: { borderTopWidth: 1.5, borderStyle: 'dashed', marginHorizontal: space.xl, marginTop: space.sm, marginBottom: space.md },
});
