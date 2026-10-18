import Constants from 'expo-constants';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { AtSign, Clock, Coffee, ExternalLink, Gift, Globe, MapPin, Nfc, Phone, ShieldCheck, type LucideIcon } from 'lucide-react-native';
import { useState } from 'react';
import { Linking, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { cafe } from '../../config';
import { AppText, Button, Group, Row, Screen, ScreenHeader } from '../../ui/primitives';
import { radius, space, useTheme } from '../../ui/theme';
import { addressLink, instagramLink, ordinal, phoneLink, websiteLink } from './contactLinks';

interface ContactRow {
  readonly title: string;
  readonly detail: string;
  readonly icon: LucideIcon;
  readonly url: string | null;
}

export function AboutScreen() {
  const { color } = useTheme();
  // The link that just failed to open, so its error shows beside it.
  const [failedLink, setFailedLink] = useState<string | null>(null);
  const { contact, rules, privacyPolicyUrl } = cafe;
  const hours = contact.hours.map((line) => line.trim()).filter(Boolean).join(' · ');
  const rows: ContactRow[] = [
    { title: 'Address', detail: contact.address.trim(), icon: MapPin, url: addressLink(contact.address, Platform.OS) },
    { title: 'Hours', detail: hours, icon: Clock, url: null },
    { title: 'Phone', detail: contact.phone.trim(), icon: Phone, url: phoneLink(contact.phone) },
    { title: 'Website', detail: contact.website.trim(), icon: Globe, url: websiteLink(contact.website) },
    { title: 'Instagram', detail: contact.instagram.trim(), icon: AtSign, url: instagramLink(contact.instagram) },
  ].filter((row) => row.detail.length > 0);
  const openLink = async (url: string) => {
    setFailedLink(null);
    try {
      await Linking.openURL(url);
    } catch {
      setFailedLink(url);
    }
  };
  const linkError = (urls: readonly (string | null | undefined)[]) =>
    failedLink !== null && urls.includes(failedLink) ? (
      <AppText variant="caption" tone="muted" accessibilityLiveRegion="polite">Couldn’t open that link on this phone.</AppText>
    ) : null;
  const version = Constants.expoConfig?.version ?? '—';

  return (
    <Screen>
      <ScreenHeader title="About" onBack={() => router.back()} />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <AppText variant="display" accessibilityRole="header">{cafe.name}</AppText>
          <AppText tone="muted">{cafe.tagline}</AppText>
        </View>

        {rows.length > 0 ? (
          <View style={styles.section}>
            <AppText variant="overline" tone="muted" accessibilityRole="header">Visit us</AppText>
            <Group>
              {rows.map((row, index) => (
                <Row key={row.title} icon={row.icon} title={row.title} detail={row.detail} last={index === rows.length - 1}
                  onPress={row.url ? () => { if (row.url) void openLink(row.url); } : undefined} />
              ))}
            </Group>
            {linkError(rows.map((row) => row.url))}
          </View>
        ) : null}

        <View style={styles.section}>
          <AppText variant="overline" tone="muted" accessibilityRole="header">How it works</AppText>
          <Group>
            <Row icon={Coffee} title="Order as usual" />
            <Row icon={Nfc} title="Tap your phone on the counter phone" detail="Or scan the code on its screen" />
            <Row icon={Gift} title={`Every ${ordinal(rules.stampsPerReward + 1)} drink is free`} detail={`Collect ${rules.stampsPerReward} stamps, then open its ticket and tap to use it`} last />
          </Group>
        </View>

        <Group style={styles.privacy}>
          <View style={[styles.privacyIcon, { backgroundColor: color.accentSoft }]}>
            <ShieldCheck size={space.xl} color={color.accent} strokeWidth={2} />
          </View>
          <AppText variant="title" accessibilityRole="header">Your privacy</AppText>
          <AppText tone="muted">Your card lives only on this phone. No account, no sign-up, no tracking. When you tap, the counter phone only sees your stamp count. Your card is included in your phone’s normal backups.</AppText>
          {privacyPolicyUrl ? (
            <Button kind="ghost" icon={ExternalLink} label="Read the privacy policy" onPress={() => void openLink(privacyPolicyUrl)} style={{ alignSelf: 'flex-start', paddingHorizontal: 0, height: 36 }} />
          ) : null}
          {linkError([privacyPolicyUrl])}
        </Group>

        <Pressable
          accessibilityLabel={`Version ${version}`}
          delayLongPress={1500}
          onLongPress={() => {
            void Haptics.selectionAsync().catch(() => undefined);
            router.push('/staff/setup');
          }}
          style={styles.footer}
        >
          <AppText variant="caption" tone="muted" align="center">Version {version}</AppText>
        </Pressable>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingHorizontal: space.lg, paddingBottom: space.xl, gap: space.xxl },
  hero: { gap: space.xs, paddingTop: space.sm },
  section: { gap: space.sm },
  privacy: { padding: space.lg, gap: space.sm },
  privacyIcon: { width: space.xxxl, height: space.xxxl, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', marginBottom: space.xxs },
  footer: { paddingVertical: space.md, minHeight: space.xxxl, justifyContent: 'center' },
});
