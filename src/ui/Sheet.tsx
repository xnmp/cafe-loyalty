import type { ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeOut, SlideInDown, SlideOutDown, useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { elevation, radius, space, useTheme } from './theme';

/** Bottom sheet over a warm scrim. Tapping the scrim dismisses when `onDismiss` is given. */
export function Sheet({ visible, onDismiss, children, overlay }: { visible: boolean; onDismiss?: () => void; children: ReactNode; overlay?: ReactNode }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  return (
    <Modal transparent visible={visible} animationType="none" statusBarTranslucent navigationBarTranslucent onRequestClose={onDismiss}>
      {visible ? (
        <View style={StyleSheet.absoluteFill}>
          <Animated.View entering={FadeIn.duration(180)} exiting={FadeOut.duration(160)} style={[StyleSheet.absoluteFill, { backgroundColor: theme.color.scrim }]}>
            <Pressable style={StyleSheet.absoluteFill} onPress={onDismiss} accessibilityLabel="Close" accessibilityRole="button" />
          </Animated.View>
          {overlay}
          <Animated.View
            entering={reduceMotion ? FadeIn : SlideInDown.springify().damping(18).stiffness(180)}
            exiting={reduceMotion ? FadeOut : SlideOutDown.duration(200)}
            style={[
              styles.sheet,
              { backgroundColor: theme.color.surface, paddingBottom: Math.max(insets.bottom, space.lg) + space.xs },
              elevation(theme, 3),
            ]}
            accessibilityViewIsModal
          >
            <View style={[styles.grabber, { backgroundColor: theme.color.line }]} />
            {children}
          </Animated.View>
        </View>
      ) : null}
    </Modal>
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
