import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';

import { cafe } from '../../config';
import { buildAckLink } from '../../domain/link';
import { cancelRead, getAvailability, openNfcSettings, readOnce, type NfcAvailability, type TapResponse } from '../../infra/nfcReader';
import type { IntakeSource } from '../../state/cardStore';
import { useStores } from '../../state/AppProviders';
import { submitWithFeedback, type FeltResult } from './submit';

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
  submit(uris: readonly string[], source: IntakeSource): Promise<FeltResult>;
}

export function useTapToCollect({ paused }: { paused: boolean }): TapController {
  const { card } = useStores();
  const [availability, setAvailability] = useState<NfcAvailability | 'checking'>('checking');
  const [reading, setReading] = useState(false);
  const passive = Platform.OS === 'android';

  const submit = useCallback((uris: readonly string[], source: IntakeSource) => submitWithFeedback(card, uris, source), [card]);

  const respond = useCallback(
    async (uris: readonly string[]): Promise<TapResponse> => {
      const { ack, feedback } = await submit(uris, 'nfc');
      return {
        ackUri: ack ? buildAckLink(cafe.scheme, ack) : undefined,
        successMessage: feedback.kind === 'problem' ? undefined : feedback.short,
        errorMessage: feedback.kind === 'problem' ? feedback.short : undefined,
      };
    },
    [submit],
  );

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
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  useFocusEffect(
    useCallback(() => {
      if (!passive || availability !== 'ready') return;
      let active = true;
      void (async () => {
        while (active) {
          if (pausedRef.current || AppState.currentState !== 'active') {
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
    }, [passive, availability, respond]),
  );

  const startSession = useCallback(() => {
    if (reading) return;
    setReading(true);
    void readOnce(`Hold the top of your iPhone near the back of the ${cafe.name} counter phone.`, respond).finally(() => setReading(false));
  }, [reading, respond]);

  return { availability, reading, passive, startSession, openSettings: () => void openNfcSettings(), submit };
}
