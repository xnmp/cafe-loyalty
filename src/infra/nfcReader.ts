import { Platform } from 'react-native';
import NfcManager, { NfcAdapter, NfcError, NfcEvents, NfcTech, type NdefRecord as LibRecord } from 'react-native-nfc-manager';

import { utf8Encode } from '../domain/bytes';
import { encodeUriMessage, messageUris, type NdefRecord } from '../domain/ndef';

/**
 * Customer-side NFC: read the counter device's NDEF URI, let the caller decide
 * what to do with it, optionally write a reply back, then close the session.
 *
 * iOS shows a system sheet per session (must be user-initiated). Android uses
 * reader mode, so the caller can keep a session open while the card screen is
 * visible and the customer only has to hold their phone to the counter.
 */

export type NfcAvailability = 'ready' | 'disabled' | 'unsupported';

export interface TapMessages {
  /** iOS sheet: shown with a checkmark as the session closes. */
  readonly successMessage?: string;
  /** iOS sheet: shown as an error as the session closes. */
  readonly errorMessage?: string;
}

export interface TapReply {
  /** URI to write back to the counter device, if any. */
  readonly write: string | null;
  /**
   * Called exactly once, after the write attempt (or straight away when there
   * is nothing to write), with whether the counter device received it.
   */
  readonly settle: (written: boolean) => Promise<TapMessages>;
}

export type ReadOutcome = 'handled' | 'cancelled' | 'failed';

let started: Promise<void> | null = null;
const ensureStarted = (): Promise<void> => {
  started ??= NfcManager.start().catch((e: unknown) => {
    started = null;
    throw e;
  });
  return started;
};

export async function getAvailability(): Promise<NfcAvailability> {
  try {
    if (!(await NfcManager.isSupported())) return 'unsupported';
    await ensureStarted();
    // iOS always reports enabled; Android can have NFC switched off.
    return (await NfcManager.isEnabled()) ? 'ready' : 'disabled';
  } catch {
    return 'unsupported';
  }
}

/**
 * Calls `listener` when NFC is switched on or off without leaving the app
 * (Android quick settings). iOS can't switch NFC off. Returns an unsubscribe.
 */
export function onAvailabilityChange(listener: () => void): () => void {
  if (Platform.OS !== 'android') return () => undefined;
  let subscribed = true;
  void ensureStarted()
    .then(() => subscribed && NfcManager.setEventListener(NfcEvents.StateChanged, () => listener()))
    .catch(() => undefined);
  return () => {
    subscribed = false;
    NfcManager.setEventListener(NfcEvents.StateChanged, null);
  };
}

export async function openNfcSettings(): Promise<void> {
  if (Platform.OS === 'android') await NfcManager.goToNfcSetting().catch(() => false);
}

const requestOptions = (prompt: string) =>
  Platform.OS === 'ios'
    ? { alertMessage: prompt }
    : {
        isReaderModeEnabled: true,
        // HCE answers as ISO-DEP over NFC-A (some devices use NFC-B). No
        // SKIP_NDEF_CHECK: we need Android to detect the Ndef technology.
        readerModeFlags: NfcAdapter.FLAG_READER_NFC_A | NfcAdapter.FLAG_READER_NFC_B,
      };

function toDomainRecord(r: LibRecord): NdefRecord {
  // Android hands back `type` as a string, iOS as bytes.
  const type = typeof r.type === 'string' ? utf8Encode(r.type) : Uint8Array.from(r.type);
  return { tnf: r.tnf, type, payload: Uint8Array.from(r.payload) };
}

function isCancellation(e: unknown): boolean {
  if (e instanceof NfcError.UserCancel) return true;
  const text = e instanceof Error ? e.message : String(e);
  return /cancel/i.test(text);
}

/**
 * Waits for one tag. `respond` receives the URIs on it and says what to write
 * back; its `settle` always runs once a reply was produced, even if the
 * session drops. Resolves once the session is closed. Never throws.
 */
export async function readOnce(
  prompt: string,
  respond: (uris: readonly string[]) => Promise<TapReply>,
): Promise<ReadOutcome> {
  // One session at a time: a second start (a double press on iOS) must not
  // fail its native request and then cancel the first session on cleanup.
  if (sessionOpen) return 'cancelled';
  sessionOpen = true;
  try {
    return await readSession(prompt, respond);
  } finally {
    sessionOpen = false;
  }
}

let sessionOpen = false;

async function readSession(prompt: string, respond: (uris: readonly string[]) => Promise<TapReply>): Promise<ReadOutcome> {
  let outcome: ReadOutcome = 'failed';
  let iosError: string | undefined;
  let pending: TapReply | null = null;
  try {
    await ensureStarted();
    const tech = await NfcManager.requestTechnology(NfcTech.Ndef, requestOptions(prompt));
    if (!tech) return 'cancelled';

    const tag = await NfcManager.getTag();
    const records = tag?.ndefMessage ?? (await NfcManager.ndefHandler.getNdefMessage())?.ndefMessage ?? [];
    pending = await respond(messageUris(records.map(toDomainRecord)));

    let written = false;
    if (pending.write) {
      try {
        await NfcManager.ndefHandler.writeNdefMessage(Array.from(encodeUriMessage(pending.write)));
        written = true;
      } catch {
        // Phone moved away mid-write: settle(false) decides what that means.
      }
    }
    const reply = pending;
    pending = null;
    const messages = await reply.settle(written);
    if (Platform.OS === 'ios') {
      if (messages.errorMessage) iosError = messages.errorMessage;
      else if (messages.successMessage) await NfcManager.setAlertMessageIOS(messages.successMessage).catch(() => undefined);
    }
    outcome = 'handled';
  } catch (e) {
    outcome = isCancellation(e) ? 'cancelled' : 'failed';
    if (pending) await pending.settle(false).catch(() => undefined);
  } finally {
    if (iosError) await NfcManager.invalidateSessionWithErrorIOS(iosError).catch(() => undefined);
    else await NfcManager.cancelTechnologyRequest({ delayMsAndroid: 0 }).catch(() => undefined);
  }
  return outcome;
}

/** Aborts a pending readOnce (e.g. the screen lost focus). */
export async function cancelRead(): Promise<void> {
  await NfcManager.cancelTechnologyRequest({ delayMsAndroid: 0 }).catch(() => undefined);
}
