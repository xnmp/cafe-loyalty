import { CircleAlert, Gift } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { ZoomIn } from 'react-native-reanimated';

import { AppText, Button } from '../../ui/primitives';
import { Confetti } from '../../ui/motion';
import { Sheet } from '../../ui/Sheet';
import { InkedStamp } from '../../ui/StampCard';
import { font, space, useTheme, withAlpha } from '../../ui/theme';
import type { Feedback } from './feedback';

/** Live clock so a barista can tell a fresh redemption from a screenshot. */
function LiveClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    // Subscription to wall-clock time.
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <AppText style={{ fontFamily: font.displayBold, fontSize: 40, lineHeight: 46, fontVariant: ['tabular-nums'] }} accessibilityLabel={`Time now ${now.toLocaleTimeString()}`}>
      {now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
    </AppText>
  );
}

function Badge({ feedback }: { feedback: Feedback }) {
  const { color } = useTheme();
  const size = 88;
  switch (feedback.kind) {
    case 'stamped':
    case 'repeat':
      return (
        <Animated.View entering={ZoomIn.springify().damping(10).stiffness(220)}>
          <InkedStamp size={size} index={3} />
        </Animated.View>
      );
    case 'unlocked':
    case 'redeemed':
      return (
        <Animated.View entering={ZoomIn.springify().damping(9)} style={[styles.badge, { width: size, height: size, backgroundColor: color.accent }]}>
          <Gift size={size * 0.46} color={color.onAccent} strokeWidth={2} />
        </Animated.View>
      );
    case 'problem':
      return (
        <View style={[styles.badge, { width: size, height: size, backgroundColor: withAlpha(color.danger, 0.12) }]}>
          <CircleAlert size={size * 0.46} color={color.danger} strokeWidth={2} />
        </View>
      );
  }
}

export function FeedbackSheet({ feedback, onDismiss }: { feedback: Feedback | null; onDismiss: () => void }) {
  // Auto-dismiss for the quick confirmations (a timer is a genuine side effect).
  useEffect(() => {
    if (!feedback?.autoDismissMs) return;
    const id = setTimeout(onDismiss, feedback.autoDismissMs);
    return () => clearTimeout(id);
  }, [feedback, onDismiss]);

  return (
    <Sheet visible={feedback !== null} onDismiss={onDismiss} overlay={feedback?.kind === 'unlocked' || feedback?.kind === 'redeemed' ? <Confetti /> : null}>
      {feedback ? (
        <View style={styles.content} accessibilityLiveRegion="polite">
          <Badge feedback={feedback} />
          <AppText variant="title" align="center" style={{ marginTop: space.lg }}>
            {feedback.title}
          </AppText>
          <AppText variant="body" tone="muted" align="center" style={{ marginTop: space.xs, maxWidth: 320 }}>
            {feedback.body}
          </AppText>
          {feedback.kind === 'redeemed' ? (
            <View style={{ marginTop: space.lg, alignItems: 'center' }}>
              <LiveClock />
            </View>
          ) : null}
          {feedback.autoDismissMs ? null : (
            <Button label={feedback.kind === 'problem' ? 'OK' : feedback.kind === 'redeemed' ? 'Done' : 'Lovely'} onPress={onDismiss} style={{ alignSelf: 'stretch', marginTop: space.xl }} />
          )}
        </View>
      ) : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  content: { alignItems: 'center', paddingBottom: space.xs },
  badge: { borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
});
