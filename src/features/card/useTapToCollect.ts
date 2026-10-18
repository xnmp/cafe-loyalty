import { useFocusEffect, useIsFocused } from 'expo-router';
import { useCallback, useEffect, useEffectEvent, useState } from 'react';
import { AppState, Platform } from 'react-native';

import { cafe } from '../../config';
import { cancelRead, getAvailability, onAvailabilityChange, openNfcSettings, readOnce, type NfcAvailability } from '../../infra/nfcReader';
import type { IntakeSource } from '../../state/cardStore';
import { useStores } from '../../state/AppProviders';
import type { Feedback } from './feedback';
import { submitWithFeedback, tapWithFeedback } from './submit';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface TapController {
  readonly availability: NfcAvailability | 'checking';
  /** iOS: a reader session is open (system sheet showing). */
  readonly reading: boolean;
  /** Android keeps reader mode on while the card is visible; iOS needs a button press. */
  readonly passive: boolean;
  startSession(): void;
  openSettings(): void;
  /** For QR scans and deep links: same pipeline, same feedback. */
  submit(uris: readonly string[], source: Exclude<IntakeSource, 'nfc'>): Promise<Feedback>;
}

/** Whether a tap may spend a reward is the card store's call (see rewardUse.ts), made as it replies. */
export function useTapToCollect({ paused }: { paused: boolean }): TapController {
  const { card } = useStores();
  const [availability, setAvailability] = useState<NfcAvailability | 'checking'>('checking');
  const [reading, setReading] = useState(false);
  const passive = Platform.OS === 'android';

  const submit = useCallback(
    (uris: readonly string[], source: Exclude<IntakeSource, 'nfc'>) => submitWithFeedback(card, uris, source),
    [card],
  );

  // Re-check NFC whenever the screen gains focus, the app returns from Settings, or NFC is switched on or off.
  useFocusEffect(
    useCallback(() => {
      let alive = true;
      const refresh = () => void getAvailability().then((a) => alive && setAvailability(a));
      refresh();
      const sub = AppState.addEventListener('change', (s) => s === 'active' && refresh());
      const unsubscribe = onAvailabilityChange(refresh);
      return () => {
        alive = false;
        sub.remove();
        unsubscribe();
      };
    }, []),
  );

  // Android: keep reader mode running while the card is on screen.
  // Pausing skips the next read rather than cancelling the current one, so an
  // in-flight ack write still reaches the counter phone.
  const isPaused = useEffectEvent(() => paused);
  const focused = useIsFocused();
  useEffect(() => {
    if (!focused || !passive || availability !== 'ready') return;
    let active = true;
    void (async () => {
      while (active) {
        if (isPaused() || AppState.currentState !== 'active') {
          await sleep(400);
          continue;
        }
        const outcome = await readOnce('', (uris) => tapWithFeedback(card, uris));
        // A failing reader may mean NFC was just switched off.
        if (outcome === 'failed') void getAvailability().then((a) => active && setAvailability(a));
        // Give the phone time to leave the field so the same tap isn't read twice.
        await sleep(outcome === 'handled' ? 1800 : outcome === 'failed' ? 800 : 250);
      }
    })();
    return () => {
      active = false;
      void cancelRead();
    };
  }, [focused, passive, availability, card]);

  const startSession = useCallback(() => {
    if (reading) return;
    setReading(true);
    const message = `Hold the top of your iPhone near the back of the ${cafe.shortName} counter phone.`;
    void readOnce(message, (uris) => tapWithFeedback(card, uris)).finally(() => setReading(false));
  }, [reading, card]);

  return { availability, reading, passive, startSession, openSettings: () => void openNfcSettings(), submit };
}
