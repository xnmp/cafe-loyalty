import { ChevronRight, Gift } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

import { Appear } from './motion';
import { AppText, Squishy } from './primitives';
import { elevation, radius, space, useTheme, withAlpha } from './theme';

/** A torn-off ticket: the reward waiting to be used. Pressing it offers the redemption code. */
export function RewardTicket({ count, rewardName, onPress }: { count: number; rewardName: string; onPress: () => void }) {
  const theme = useTheme();
  const { color } = theme;
  const notch = 18;
  return (
    <Appear from="rise">
    <Squishy
      onPress={onPress}
      style={[styles.ticket, { backgroundColor: color.accent }, elevation(theme, 1)]}
      accessibilityRole="button"
      accessibilityLabel={`${count} ${rewardName}${count > 1 ? 's' : ''} ready. Ask at the counter and tap your phone, or open to show your code.`}
    >
      <View style={[styles.notch, { left: -notch / 2, width: notch, height: notch, borderRadius: notch / 2, backgroundColor: color.background }]} />
      <View style={[styles.notch, { right: -notch / 2, width: notch, height: notch, borderRadius: notch / 2, backgroundColor: color.background }]} />
      <View style={[styles.iconWrap, { backgroundColor: withAlpha(color.onAccent, 0.16) }]}>
        <Gift size={24} color={color.onAccent} strokeWidth={2} />
      </View>
      <View style={{ flex: 1 }}>
        <AppText variant="heading" tone="onAccent">
          {count > 1 ? `${count} ${rewardName}s ready` : `Your ${rewardName} is ready`}
        </AppText>
        <AppText variant="caption" tone="onAccent" style={{ opacity: 0.85, marginTop: 2 }}>
          Ask at the counter and tap your phone — or tap here for your code.
        </AppText>
      </View>
      <View style={[styles.stub, { borderColor: withAlpha(color.onAccent, 0.35) }]}>
        {count > 1 ? <AppText style={{ fontFamily: 'Fraunces-Bold', fontSize: 22, color: color.onAccent }}>×{count}</AppText> : null}
        <ChevronRight size={20} color={color.onAccent} strokeWidth={2.2} />
      </View>
    </Squishy>
    </Appear>
  );
}

const styles = StyleSheet.create({
  ticket: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    borderRadius: radius.md,
    paddingVertical: space.md,
    paddingLeft: space.lg,
    paddingRight: space.md,
    overflow: 'hidden',
  },
  notch: { position: 'absolute', top: '50%', marginTop: -9 },
  iconWrap: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  stub: { borderLeftWidth: 1.5, borderStyle: 'dashed', paddingLeft: space.sm, marginLeft: space.xxs, minWidth: 48, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 2, alignSelf: 'stretch' },
});
