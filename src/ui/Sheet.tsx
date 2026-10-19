import { useEffect, type ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { spring } from './motion';
import { elevation, radius, space, useTheme } from './theme';

/** Bottom sheet over a warm scrim. Tapping the scrim dismisses when `onDismiss` is given. */
export function Sheet({ visible, onDismiss, children, overlay }: { visible: boolean; onDismiss?: () => void; children: ReactNode; overlay?: ReactNode }) {
  return (
    <Modal transparent visible={visible} animationType="none" statusBarTranslucent navigationBarTranslucent onRequestClose={onDismiss}>
      {visible ? (
        <SheetBody onDismiss={onDismiss} overlay={overlay}>
          {children}
        </SheetBody>
      ) : null}
    </Modal>
  );
}

/**
 * Mounted while the sheet is open, so every opening slides in from the start.
 * Driven by a shared value rather than `entering` layout animations, which
 * inside a Modal sometimes leave the view invisible (see Appear).
 */
function SheetBody({ onDismiss, overlay, children }: { onDismiss?: () => void; overlay?: ReactNode; children: ReactNode }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const reduceMotion = useReducedMotion();
  const open = useSharedValue(reduceMotion ? 1 : 0);
  useEffect(() => {
    // Slide in on mount (an animation side effect, not state sync).
    if (!reduceMotion) open.set(spring(1, { damping: 18, stiffness: 180 }));
  }, [open, reduceMotion]);
  const scrimStyle = useAnimatedStyle(() => ({ opacity: Math.min(1, open.get() * 2) }));
  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: (1 - open.get()) * height }] }));
  return (
    <View style={StyleSheet.absoluteFill}>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: theme.color.scrim }, scrimStyle]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onDismiss} accessibilityLabel="Close" accessibilityRole="button" />
      </Animated.View>
      {overlay}
      <Animated.View
        style={[
          styles.sheet,
          { backgroundColor: theme.color.surface, paddingBottom: Math.max(insets.bottom, space.lg) + space.xs },
          elevation(theme, 3),
          sheetStyle,
        ]}
        accessibilityViewIsModal
      >
        <View style={[styles.grabber, { backgroundColor: theme.color.line }]} />
        {children}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    position: 'absolute',
    left: space.xs,
    right: space.xs,
    bottom: space.xs,
    borderRadius: radius.xl,
    paddingTop: space.sm,
    paddingHorizontal: space.xl,
  },
  grabber: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, marginBottom: space.lg },
});
