import * as Haptics from 'expo-haptics';
import { ChevronLeft, type LucideIcon } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type StyleProp, type TextProps, type TextStyle, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';

import { radius, space, type, useTheme, withAlpha, type TextVariant } from './theme';

type Tone = 'ink' | 'muted' | 'accent' | 'onAccent' | 'success' | 'danger';

export function AppText({
  variant = 'body',
  tone = 'ink',
  align,
  style,
  ...rest
}: TextProps & { variant?: TextVariant; tone?: Tone; align?: TextStyle['textAlign'] }) {
  const { color } = useTheme();
  const toneColor = { ink: color.ink, muted: color.inkMuted, accent: color.accent, onAccent: color.onAccent, success: color.success, danger: color.danger }[tone];
  return <Text {...rest} style={[type[variant], { color: toneColor, textAlign: align }, style]} />;
}

export function Screen({ children, edges = ['top', 'bottom'], style }: { children: ReactNode; edges?: Edge[]; style?: StyleProp<ViewStyle> }) {
  const { color } = useTheme();
  return (
    <SafeAreaView edges={edges} style={[{ flex: 1, backgroundColor: color.background }, style]}>
      {children}
    </SafeAreaView>
  );
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/** Pressable that gives tactile feedback: a quick spring squash and a light haptic tick. */
export function Squishy({
  onPress,
  onLongPress,
  delayLongPress,
  disabled,
  haptic = true,
  style,
  children,
  accessibilityLabel,
  accessibilityHint,
  accessibilityRole = 'button',
  hitSlop,
  testID,
}: {
  onPress?: () => void;
  onLongPress?: () => void;
  delayLongPress?: number;
  disabled?: boolean;
  haptic?: boolean;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  accessibilityRole?: 'button' | 'link' | 'none';
  hitSlop?: number;
  testID?: string;
}) {
  const scale = useSharedValue(1);
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <AnimatedPressable
      testID={testID}
      accessibilityRole={accessibilityRole}
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!disabled }}
      hitSlop={hitSlop}
      disabled={disabled}
      onPressIn={() => {
        scale.set(withSpring(0.96, { damping: 20, stiffness: 400 }));
      }}
      onPressOut={() => {
        scale.set(withSpring(1, { damping: 14, stiffness: 300 }));
      }}
      onPress={() => {
        if (haptic) void Haptics.selectionAsync().catch(() => undefined);
        onPress?.();
      }}
      onLongPress={onLongPress}
      delayLongPress={delayLongPress}
      style={[animated, style]}
    >
      {children}
    </AnimatedPressable>
  );
}

type ButtonKind = 'primary' | 'secondary' | 'ghost' | 'danger';

export function Button({
  label,
  onPress,
  kind = 'primary',
  icon: Icon,
  size = 'md',
  disabled,
  busy,
  style,
  accessibilityHint,
  testID,
}: {
  label: string;
  onPress: () => void;
  kind?: ButtonKind;
  icon?: LucideIcon;
  size?: 'md' | 'lg';
  disabled?: boolean;
  busy?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityHint?: string;
  testID?: string;
}) {
  const { color } = useTheme();
  const palette: Record<ButtonKind, { bg: string; fg: string; border: string }> = {
    primary: { bg: color.accent, fg: color.onAccent, border: color.accent },
    secondary: { bg: 'transparent', fg: color.ink, border: color.line },
    ghost: { bg: 'transparent', fg: color.accent, border: 'transparent' },
    danger: { bg: 'transparent', fg: color.danger, border: withAlpha(color.danger, 0.4) },
  };
  const p = palette[kind];
  const height = size === 'lg' ? 60 : 50;
  return (
    <Squishy
      testID={testID}
      onPress={onPress}
      disabled={disabled || busy}
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      style={[
        styles.button,
        { height, backgroundColor: p.bg, borderColor: p.border, opacity: disabled ? 0.45 : 1 },
        style,
      ]}
    >
      {busy ? (
        <ActivityIndicator color={p.fg} />
      ) : (
        <View style={styles.buttonInner}>
          {Icon ? <Icon size={size === 'lg' ? 22 : 20} color={p.fg} strokeWidth={2.2} /> : null}
          <Text style={[type.bodyStrong, { color: p.fg, fontSize: size === 'lg' ? 17 : 16 }]}>{label}</Text>
        </View>
      )}
    </Squishy>
  );
}

export function IconButton({
  icon: Icon,
  onPress,
  label,
  tone = 'ink',
  size = 44,
}: {
  icon: LucideIcon;
  onPress: () => void;
  label: string;
  tone?: 'ink' | 'onAccent';
  size?: number;
}) {
  const { color } = useTheme();
  const fg = tone === 'ink' ? color.ink : color.onAccent;
  const bg = tone === 'ink' ? withAlpha(color.ink, 0.06) : withAlpha(color.onAccent, 0.16);
  return (
    <Squishy onPress={onPress} accessibilityLabel={label} hitSlop={6} style={[styles.iconButton, { width: size, height: size, backgroundColor: bg }]}>
      <Icon size={20} color={fg} strokeWidth={2} />
    </Squishy>
  );
}

/** Rounded group of rows, like an inset grouped list. */
export function Group({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const { color } = useTheme();
  return <View style={[styles.group, { backgroundColor: color.surface, borderColor: color.line }, style]}>{children}</View>;
}

export function Row({
  icon: Icon,
  title,
  detail,
  onPress,
  last,
  trailing,
}: {
  icon?: LucideIcon;
  title: string;
  detail?: string;
  onPress?: () => void;
  last?: boolean;
  trailing?: ReactNode;
}) {
  const { color } = useTheme();
  const content = (
    <View style={[styles.row, !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: color.line }]}>
      {Icon ? (
        <View style={[styles.rowIcon, { backgroundColor: color.accentSoft }]}>
          <Icon size={18} color={color.accent} strokeWidth={2} />
        </View>
      ) : null}
      <View style={{ flex: 1 }}>
        <AppText variant="bodyStrong">{title}</AppText>
        {detail ? (
          <AppText variant="caption" tone="muted" style={{ marginTop: 2 }}>
            {detail}
          </AppText>
        ) : null}
      </View>
      {trailing}
    </View>
  );
  return onPress ? (
    <Squishy onPress={onPress} accessibilityLabel={detail ? `${title}, ${detail}` : title} accessibilityRole="link">
      {content}
    </Squishy>
  ) : (
    content
  );
}

const styles = StyleSheet.create({
  button: {
    borderRadius: radius.pill,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.xl,
  },
  buttonInner: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  iconButton: { borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  group: { borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: space.sm, paddingHorizontal: space.md, minHeight: 56 },
  header: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.lg, paddingTop: space.xs, paddingBottom: space.md },
  rowIcon: { width: 34, height: 34, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
});

/** Standard header for pushed/modal screens: back (or close) button + serif title. */
export function ScreenHeader({ title, onBack, backIcon, right }: { title: string; onBack: () => void; backIcon?: LucideIcon; right?: ReactNode }) {
  return (
    <View style={styles.header}>
      <IconButton icon={backIcon ?? ChevronLeft} label="Back" onPress={onBack} />
      <AppText variant="title" numberOfLines={1} style={{ flex: 1 }} accessibilityRole="header">
        {title}
      </AppText>
      {right}
    </View>
  );
}
