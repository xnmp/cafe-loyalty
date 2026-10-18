import { router } from 'expo-router';
import { KeyRound, QrCode, X } from 'lucide-react-native';
import { useEffect, useReducer, useRef, useState } from 'react';
import { Platform, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { useStores } from '../../state/AppProviders';
import { useStore } from '../../state/store';
import { PinPad } from '../../ui/PinPad';
import { AppText, Button, Screen, ScreenHeader } from '../../ui/primitives';
import { radius, space, type, useTheme, withAlpha } from '../../ui/theme';
import { QrScanner } from '../scan/QrScanner';
import { initialSetup, setupReducer, staffCodeMessage } from './setupMachine';

const alreadyCounterMessage = 'To set it up with a different staff code, choose Stop using as counter in Counter settings first.';

export function SetupScreen() {
  const { staff } = useStores();
  const alreadyCounter = useStore(staff).status === 'counter';
  const { color } = useTheme();
  const [state, dispatch] = useReducer(setupReducer, initialSetup);
  const [pastedCode, setPastedCode] = useState('');
  const working = useRef(false);
  const active = useRef(true);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  const [busy, setBusy] = useState(false);
  const acceptingCode = useRef(false);

  const checkCode = (code: string) => {
    if (acceptingCode.current) return;
    acceptingCode.current = true;
    const result = staff.checkCode(code);
    setPastedCode('');
    dispatch(result.ok ? { type: 'code-accepted', code } : { type: 'failed', message: staffCodeMessage[result.error] });
  };

  const completePin = async (pin: string) => {
    if (working.current) return;
    const next = setupReducer(state, { type: 'pin-entered', pin });
    if (next.step !== 'done') {
      dispatch({ type: 'pin-entered', pin });
      return;
    }
    working.current = true;
    setBusy(true);
    dispatch({ type: 'pin-entered', pin });
    try {
      const result = await staff.provision(next.code, next.pin);
      if (!result.ok) {
        dispatch({ type: 'failed', message: result.error === 'invalid-pin' ? 'Choose a four-digit PIN.' : result.error === 'already-counter' ? alreadyCounterMessage : staffCodeMessage[result.error] });
        return;
      }
      if (!active.current) return;
      router.dismissAll();
      router.replace('/counter');
    } catch {
      dispatch({ type: 'failed', message: 'Setup could not be saved. Please try again.' });
    } finally {
      working.current = false;
      setBusy(false);
    }
  };

  if (state.step === 'scan') return <QrScanner guide="Scan the staff code" onScan={checkCode} onClose={() => dispatch({ type: 'back' })} />;
  return (
    <Screen>
      <ScreenHeader title="Counter setup" backIcon={X} onBack={() => { active.current = false; router.back(); }} />
      {alreadyCounter && state.step !== 'done' ? (
        <View style={[styles.content, styles.intro]}>
          <AppText variant="title" align="center" accessibilityRole="header">This is already the counter phone</AppText>
          <AppText tone="muted" align="center">{alreadyCounterMessage}</AppText>
          <Button label="Close" kind="secondary" onPress={() => router.back()} />
        </View>
      ) : state.step === 'pin' || state.step === 'confirm-pin' ? (
        <PinPad key={state.step} title={state.step === 'pin' ? 'Choose a staff PIN' : 'Enter it again'} subtitle={state.step === 'pin' ? "You'll need it to change settings or stop using this phone as the counter." : undefined} error={state.step === 'pin' ? state.error : undefined} onComplete={(pin) => void completePin(pin)} disabled={busy} />
      ) : state.step === 'done' ? (
        <View style={styles.center}><AppText tone="muted" accessibilityLiveRegion="polite">Setting up the counter…</AppText></View>
      ) : state.step === 'paste' ? (
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
          <AppText variant="title" accessibilityRole="header">Paste the staff code</AppText>
          <AppText tone="muted">Use the code printed by the café owner.</AppText>
          <TextInput accessibilityLabel="Staff code" value={pastedCode} onChangeText={setPastedCode} multiline autoCapitalize="none" autoCorrect={false} spellCheck={false} textAlignVertical="top" style={[styles.input, { color: color.ink, backgroundColor: color.surface, borderColor: color.line }]} />
          <Button label="Continue" disabled={!pastedCode.trim()} onPress={() => checkCode(pastedCode)} />
          <Button label="Back" kind="ghost" onPress={() => { setPastedCode(''); dispatch({ type: 'back' }); }} />
        </ScrollView>
      ) : (
        <ScrollView contentContainerStyle={[styles.content, styles.intro]}>
          <View style={[styles.emblem, { backgroundColor: color.accentSoft }]}><KeyRound size={space.xxxl} strokeWidth={2} color={color.accent} /></View>
          <AppText variant="display" align="center" accessibilityRole="header">Make this the counter phone</AppText>
          <AppText tone="muted" align="center">This phone will hand out stamps. You’ll need the staff code from the café owner.</AppText>
          {state.error ? <View style={[styles.callout, { backgroundColor: withAlpha(color.danger, 0.1) }]}><AppText tone="danger" variant="callout" accessibilityLiveRegion="polite">{state.error}</AppText></View> : null}
          <Button label="Scan staff code" icon={QrCode} onPress={() => { acceptingCode.current = false; dispatch({ type: 'scan' }); }} />
          <Button label="Paste code instead" kind="ghost" onPress={() => { acceptingCode.current = false; dispatch({ type: 'paste' }); }} />
        </ScrollView>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.xl, gap: space.lg, flexGrow: 1 },
  intro: { justifyContent: 'center' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.xl },
  emblem: { width: space.xxxl * 2, height: space.xxxl * 2, borderRadius: radius.pill, alignSelf: 'center', alignItems: 'center', justifyContent: 'center', marginBottom: space.sm },
  callout: { padding: space.md, borderRadius: radius.md },
  input: { ...type.body, fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }), borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.md, padding: space.md, minHeight: space.xxxl * 4 },
});
