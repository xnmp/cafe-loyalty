import { router } from 'expo-router';
import { KeyRound, Nfc, ShieldCheck, X } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { AppState, ScrollView, StyleSheet, View } from 'react-native';

import * as hce from '../../../modules/hce';
import { useStores } from '../../state/AppProviders';
import { useStore } from '../../state/store';
import { PinPad } from '../../ui/PinPad';
import { AppText, Button, Group, Row, Screen, ScreenHeader } from '../../ui/primitives';
import { Sheet } from '../../ui/Sheet';
import { space } from '../../ui/theme';
import { lockoutSeconds, recordPinAttempt } from './settingsLockout';
import { settingsLockoutSession } from './settingsSession';

type PinStep = { readonly step: 'settings' | 'new' } | { readonly step: 'confirm'; readonly next: string };
const readNfc = () => !hce.isSupported() ? 'unsupported' : hce.isEnabled() ? 'ready' : 'off';

export function SettingsScreen() {
  const { staff } = useStores();
  const staffState = useStore(staff);
  const [verifiedPin, setVerifiedPin] = useState<string>();
  const lockout = useStore(settingsLockoutSession);
  const [now, setNow] = useState(Date.now);
  const [padVersion, setPadVersion] = useState(0);
  const [error, setError] = useState<string>();
  const [note, setNote] = useState<string>();
  const [flow, setFlow] = useState<PinStep>({ step: 'settings' });
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [busy, setBusy] = useState(false);
  const working = useRef(false);
  const active = useRef(true);
  const [nfc, setNfc] = useState(readNfc);
  const seconds = lockoutSeconds(lockout, now);
  const locked = seconds > 0;

  useEffect(() => {
    active.current = true;
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') { setNfc(readNfc()); setNow(Date.now()); }
    });
    return () => { active.current = false; sub.remove(); };
  }, []);
  useEffect(() => {
    if (lockout.lockedUntil <= Date.now()) return;
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, [lockout.lockedUntil, locked]);

  const gate = (pin: string) => {
    const at = Date.now();
    if (lockoutSeconds(settingsLockoutSession.getSnapshot(), at)) return;
    const correct = staff.checkPin(pin);
    const next = recordPinAttempt(settingsLockoutSession.getSnapshot(), correct, at);
    settingsLockoutSession.set(next);
    setNow(at);
    setPadVersion((v) => v + 1);
    if (correct) { setVerifiedPin(pin); setError(undefined); }
    else setError('Wrong PIN');
  };

  const changePin = async (pin: string) => {
    if (working.current || !verifiedPin) return;
    if (flow.step === 'new') { setFlow({ step: 'confirm', next: pin }); setError(undefined); return; }
    if (flow.step !== 'confirm') return;
    if (pin !== flow.next) { setFlow({ step: 'new' }); setError("Those PINs didn't match"); return; }
    working.current = true;
    setBusy(true);
    try {
      const result = await staff.changePin(verifiedPin, pin);
      if (!result.ok) {
        setError(result.error === 'wrong-pin' ? 'Enter your staff PIN again.' : 'Choose a four-digit PIN.');
        if (result.error === 'wrong-pin') setVerifiedPin(undefined);
        setFlow({ step: 'new' });
        setPadVersion((v) => v + 1);
        return;
      }
      setVerifiedPin(pin);
      setFlow({ step: 'settings' });
      setError(undefined);
      setNote('Staff PIN changed.');
    } catch {
      setError('The PIN could not be saved. Please try again.');
      setPadVersion((v) => v + 1);
    } finally { working.current = false; setBusy(false); }
  };

  const leave = async () => {
    if (working.current || !verifiedPin) return;
    working.current = true;
    setBusy(true);
    try {
      const result = await staff.leaveCounterMode(verifiedPin);
      if (result.ok) { if (active.current) router.replace('/'); return; }
      setConfirmLeave(false);
      setVerifiedPin(undefined);
      setError('Enter your staff PIN again.');
    } catch {
      setError('This change could not be saved. Please try again.');
    } finally { working.current = false; setBusy(false); }
  };

  const close = () => {
    if (busy) return;
    if (verifiedPin && flow.step !== 'settings') { setFlow({ step: 'settings' }); setError(undefined); }
    else router.back();
  };
  return (
    <Screen>
      <ScreenHeader title="Counter settings" backIcon={X} onBack={close} />
      {staffState.status !== 'counter' ? <View style={styles.content}><AppText tone="muted">This phone is not set up as a counter.</AppText><Button label="Close" kind="secondary" onPress={() => router.back()} /></View> : !verifiedPin ? (
        <PinPad key={`gate-${padVersion}`} title="Enter staff PIN" error={seconds > 0 ? `Too many tries. Wait ${seconds} seconds.` : error} disabled={seconds > 0} onComplete={gate} />
      ) : flow.step !== 'settings' ? (
        <PinPad key={`${flow.step}-${padVersion}`} title={flow.step === 'new' ? 'Choose a new PIN' : 'Enter it again'} error={error} disabled={busy} onComplete={(pin) => void changePin(pin)} />
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          {note ? <AppText tone="success" accessibilityLiveRegion="polite">{note}</AppText> : null}
          {error && !confirmLeave ? <AppText tone="danger" accessibilityLiveRegion="polite">{error}</AppText> : null}
          <Group><Row icon={KeyRound} title="Change PIN" last onPress={() => { setFlow({ step: 'new' }); setError(undefined); setNote(undefined); }} /></Group>
          <View accessibilityLiveRegion="polite">
            <Group>
              <Row icon={Nfc} title="Tap-to-collect" detail={nfc === 'ready' ? 'Ready' : nfc === 'off' ? 'NFC is off' : 'Not supported on this phone — customers scan a QR code'} trailing={nfc === 'off' ? <Button label="Turn on" kind="ghost" onPress={hce.openNfcSettings} style={{ paddingHorizontal: space.sm }} /> : undefined} />
              <Row icon={ShieldCheck} title="Signing key" detail={`Key #${staffState.credentials.keyId}`} last />
            </Group>
          </View>
          <Button label="Stop using as counter" kind="danger" onPress={() => { setError(undefined); setConfirmLeave(true); }} />
        </ScrollView>
      )}
      <Sheet visible={confirmLeave} onDismiss={busy ? undefined : () => setConfirmLeave(false)}>
        <View style={styles.sheet}>
          <AppText variant="title" accessibilityRole="header">Stop using this phone as the counter?</AppText>
          <AppText tone="muted">It goes back to being a normal customer phone. You’ll need the staff code to set it up again.</AppText>
          {error ? <AppText tone="danger" accessibilityLiveRegion="polite">{error}</AppText> : null}
          <Button label="Stop using as counter" kind="danger" busy={busy} onPress={() => void leave()} />
          <Button label="Keep it" kind="secondary" disabled={busy} onPress={() => setConfirmLeave(false)} />
        </View>
      </Sheet>
    </Screen>
  );
}
const styles = StyleSheet.create({
  content: { padding: space.lg, gap: space.xl },
  sheet: { gap: space.md },
});
