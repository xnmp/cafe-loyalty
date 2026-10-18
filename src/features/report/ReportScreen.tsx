import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as ImagePicker from 'expo-image-picker';
import * as MailComposer from 'expo-mail-composer';
import { router } from 'expo-router';
import { Bug, ImagePlus, Lightbulb, Mail, X, type LucideIcon } from 'lucide-react-native';
import { useState } from 'react';
import { Image, KeyboardAvoidingView, Linking, Platform, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { cafe } from '../../config';
import { composeReport, describePhone, mailtoUrl, MAX_REPORT_LENGTH, type ReportContext, type ReportEmail, type ReportKind } from '../../domain/report';
import { useStores } from '../../state/AppProviders';
import { useStore } from '../../state/store';
import { AppText, Button, Group, Row, Screen, ScreenHeader, Squishy } from '../../ui/primitives';
import { radius, space, type, useTheme, withAlpha } from '../../ui/theme';

function phoneContext(mode: ReportContext['mode']): ReportContext {
  const version = Constants.expoConfig?.version ?? '?';
  const build = Platform.OS === 'android' ? Constants.expoConfig?.android?.versionCode : Constants.expoConfig?.ios?.buildNumber;
  const phone = describePhone({
    os: Platform.OS,
    version: Device.osVersion ?? Platform.Version,
    manufacturer: Device.manufacturer ?? undefined,
    model: Device.modelName ?? undefined,
  });
  return { appName: cafe.shortName, appVersion: build ? `${version} (${build})` : version, mode, ...phone };
}

const KINDS: readonly { kind: ReportKind; label: string; icon: LucideIcon; prompt: string; placeholder: string }[] = [
  { kind: 'problem', label: 'Something’s wrong', icon: Bug, prompt: 'What happened?', placeholder: 'What were you doing, and what went wrong?' },
  { kind: 'idea', label: 'Suggestion', icon: Lightbulb, prompt: 'What would make it better?', placeholder: 'Tell us your idea' },
];

const SCREENSHOT_HINT = Platform.OS === 'ios'
  ? 'To take one, press the side button and volume up together.'
  : 'To take one, press the power and volume down buttons together.';

interface Screenshot {
  readonly uri: string;
  readonly aspect: number;
}

/** Where the email got to. Android never says whether it was sent, only that the email app opened. */
type Sending = 'editing' | 'opened' | 'sent' | 'saved' | 'opened-without-screenshot' | 'no-email-app';

const OUTCOME: Partial<Record<Sending, { tone: 'success' | 'danger'; text: string }>> = {
  opened: { tone: 'success', text: 'Your email app should be open now. Press send there to finish. Thank you!' },
  sent: { tone: 'success', text: 'Sent. Thank you!' },
  saved: { tone: 'success', text: 'Saved to your drafts. Send it from your email app when you’re ready.' },
  'opened-without-screenshot': { tone: 'danger', text: 'Your email app is open, but it couldn’t take the screenshot from here. Attach it there before you send.' },
};

/** The composer can attach files; a mailto: link is the fallback (e.g. an iPhone without Apple Mail set up). */
async function openEmail(email: ReportEmail, screenshot: Screenshot | null): Promise<Sending> {
  try {
    if (await MailComposer.isAvailableAsync()) {
      const { status } = await MailComposer.composeAsync({
        recipients: [email.to],
        subject: email.subject,
        body: email.body,
        attachments: screenshot ? [screenshot.uri] : [],
      });
      if (status === 'cancelled') return 'editing';
      if (Platform.OS !== 'ios') return 'opened';
      return status === 'sent' ? 'sent' : status === 'saved' ? 'saved' : 'opened';
    }
    await Linking.openURL(mailtoUrl(email));
    return screenshot ? 'opened-without-screenshot' : 'opened';
  } catch {
    return 'no-email-app';
  }
}

export function ReportScreen() {
  const { color } = useTheme();
  const { staff } = useStores();
  const staffState = useStore(staff);
  const [kind, setKind] = useState<ReportKind>('problem');
  const [message, setMessage] = useState('');
  const [screenshot, setScreenshot] = useState<Screenshot | null>(null);
  const [sending, setSending] = useState<Sending>('editing');
  const [busy, setBusy] = useState(false);
  const to = cafe.supportEmail;
  const context = phoneContext(staffState.status === 'counter' ? 'counter' : 'customer');
  const report = to ? composeReport(kind, message, context, to) : null;
  const chosen = KINDS.find((k) => k.kind === kind) ?? KINDS[0];
  const outcome = OUTCOME[sending];
  const finished = sending === 'opened' || sending === 'sent' || sending === 'saved';

  const edit = <T,>(set: (value: T) => void) => (value: T) => {
    set(value);
    setSending('editing');
  };

  const pick = async () => {
    // The system photo picker: no storage permission, and the app only ever sees the one image chosen.
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
    const asset = result.canceled ? null : result.assets[0];
    if (asset) edit(setScreenshot)({ uri: asset.uri, aspect: asset.width > 0 && asset.height > 0 ? asset.width / asset.height : 9 / 19.5 });
  };

  const send = async () => {
    if (!report?.ok || busy) return;
    setBusy(true);
    setSending(await openEmail(report.value, screenshot));
    setBusy(false);
  };

  return (
    <Screen>
      <ScreenHeader title="Report a problem" onBack={() => router.back()} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={styles.kinds}>
            {KINDS.map(({ kind: k, label, icon: Icon }) => {
              const selected = k === kind;
              return (
                <Squishy
                  key={k}
                  onPress={() => edit(setKind)(k)}
                  accessibilityLabel={selected ? `${label}, selected` : label}
                  style={[styles.kind, { borderColor: selected ? color.accent : color.line, backgroundColor: selected ? color.accentSoft : color.surface }]}
                >
                  <View style={styles.kindInner}>
                    <Icon size={18} color={selected ? color.accent : color.inkMuted} strokeWidth={2} />
                    <AppText variant="callout" align="center" style={{ flexShrink: 1, fontWeight: selected ? '600' : '400' }}>
                      {label}
                    </AppText>
                  </View>
                </Squishy>
              );
            })}
          </View>

          <View style={{ gap: space.xs }}>
            <AppText variant="heading">{chosen.prompt}</AppText>
            <TextInput
              accessibilityLabel={chosen.prompt}
              value={message}
              onChangeText={edit(setMessage)}
              placeholder={chosen.placeholder}
              placeholderTextColor={withAlpha(color.inkMuted, 0.8)}
              multiline
              maxLength={MAX_REPORT_LENGTH}
              textAlignVertical="top"
              style={[styles.input, { color: color.ink, backgroundColor: color.surface, borderColor: color.line }]}
            />
          </View>

          {screenshot ? (
            <View style={styles.attached}>
              <Image
                source={{ uri: screenshot.uri }}
                accessibilityLabel="Attached screenshot"
                style={[styles.thumbnail, { aspectRatio: screenshot.aspect, borderColor: color.line }]}
              />
              <View style={{ flex: 1, gap: space.xs }}>
                <AppText variant="bodyStrong">Screenshot attached</AppText>
                <Button label="Remove" kind="secondary" icon={X} onPress={() => edit(setScreenshot)(null)} style={{ alignSelf: 'flex-start', height: 40, paddingHorizontal: space.md }} />
              </View>
            </View>
          ) : (
            <View style={{ gap: space.xxs }}>
              <Button label="Attach a screenshot" kind="secondary" icon={ImagePlus} onPress={() => void pick()} />
              <AppText variant="caption" tone="muted" align="center">{SCREENSHOT_HINT}</AppText>
            </View>
          )}

          <View style={{ gap: space.xs }}>
            <AppText variant="overline" tone="muted">Sent with your report</AppText>
            <Group>
              <Row title="App" detail={`${context.appName} ${context.appVersion}`} />
              <Row title="Phone" detail={context.device ? `${context.device}, ${context.system}` : context.system} last />
            </Group>
            <AppText variant="caption" tone="muted">
              Your email app opens with this filled in, addressed to {to}. Nothing is sent until you press send there.
            </AppText>
          </View>

          {outcome ? (
            <View style={[styles.callout, { backgroundColor: withAlpha(outcome.tone === 'success' ? color.success : color.danger, 0.12) }]}>
              <AppText variant="callout" accessibilityLiveRegion="polite">{outcome.text}</AppText>
            </View>
          ) : sending === 'no-email-app' ? (
            <View style={[styles.callout, { backgroundColor: withAlpha(color.danger, 0.1) }]}>
              <AppText variant="callout" accessibilityLiveRegion="polite">
                This phone has no email app set up. You can email the report to{' '}
                <AppText variant="callout" selectable style={{ fontWeight: '600' }}>{to}</AppText> from another device.
              </AppText>
            </View>
          ) : null}
        </ScrollView>

        {/* Pinned below the form so it's in reach on a small phone and above the keyboard. */}
        <View style={[styles.footer, { borderTopColor: withAlpha(color.ink, 0.06) }]}>
          {finished ? (
            <>
              <Button label="Done" onPress={() => router.back()} />
              {sending === 'opened' ? <Button label="Open the email again" kind="ghost" icon={Mail} onPress={() => void send()} /> : null}
            </>
          ) : (
            <Button label="Write the email" icon={Mail} disabled={!report?.ok} busy={busy} onPress={() => void send()} />
          )}
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: space.lg, paddingBottom: space.xl, gap: space.lg },
  kinds: { flexDirection: 'row', gap: space.xs },
  kind: { flex: 1, borderWidth: 1.5, borderRadius: radius.md, justifyContent: 'center' },
  kindInner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.xs, paddingVertical: space.sm, paddingHorizontal: space.sm },
  input: { ...type.body, borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.md, padding: space.md, minHeight: space.xxxl * 3 },
  attached: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  thumbnail: { height: 120, borderRadius: radius.sm, borderWidth: StyleSheet.hairlineWidth },
  callout: { padding: space.md, borderRadius: radius.md },
  footer: { paddingHorizontal: space.lg, paddingVertical: space.sm, gap: space.xxs, borderTopWidth: StyleSheet.hairlineWidth },
});
