import { useFocusEffect, useIsFocused } from 'expo-router';
import { useCallback, useEffect, useEffectEvent, useState } from 'react';
import { AppState, Platform } from 'react-native';

import { cafe } from '../../config';
import { cancelRead, getAvailability, openNfcSettings, readOnce, type NfcAvailability } from '../../infra/nfcReader';
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

export function useTapToCollect({ paused }: { paused: boolean }): TapController {
  const { card } = useStores();
  const [availability, setAvailability] = useState<NfcAvailability | 'checking'>('checking');
  const [reading, setReading] = useState(false);
  const passive = Platform.OS === 'android';

  const submit = useCallback(
    (uris: readonly string[], source: Exclude<IntakeSource, 'nfc'>) => submitWithFeedback(card, uris, source),
    [card],
  );
  const respond = useCallback((uris: readonly string[]) => tapWithFeedback(card, uris), [card]);

  // Re-check NFC whenever the screen gains focus or the app returns from Settings.
  useFocusEffect(
    useCallback(() => {
      let alive = true;
      const refresh = () => void getAvailability().then((a) => alive && setAvailability(a));
      refresh();
      const sub = AppState.addEventListener('change', (s) => s === 'active' && refresh());
      return () => {
        alive = false;
        sub.remove();
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
        const outcome = await readOnce('', respond);
        // Give the phone time to leave the field so the same tap isn't read twice.
        await sleep(outcome === 'handled' ? 1800 : outcome === 'failed' ? 800 : 250);
      }
    })();
    return () => {
      active = false;
      void cancelRead();
    };
  }, [focused, passive, availability, respond]);

  const startSession = useCallback(() => {
    if (reading) return;
    setReading(true);
    void readOnce(`Hold the top of your iPhone near the back of the ${cafe.name} counter phone.`, respond).finally(() => setReading(false));
  }, [reading, respond]);

  return { availability, reading, passive, startSession, openSettings: () => void openNfcSettings(), submit };
}
