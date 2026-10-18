import { requireOptionalNativeModule } from 'expo';
import type { NativeModule } from 'expo';

import { fromBase64Url, toBase64Url } from '../../src/domain/bytes';

export type ReadEvent = { offerId: string };
export type WriteEvent = { offerId: string; message: Uint8Array };
type NativeWriteEvent = { offerId: string; message: string };
type Subscription = { remove(): void };
type HceEvents = {
  onRead: (event: ReadEvent) => void;
  onWrite: (event: NativeWriteEvent) => void;
};

declare class CafeHceNativeModule extends NativeModule<HceEvents> {
  isSupported(): boolean;
  isEnabled(): boolean;
  isServiceEnabled(): boolean;
  openNfcSettings(): void;
  setServiceEnabled(enabled: boolean): void;
  setOffer(offerId: string, ndefBase64Url: string): void;
  clearOffer(): void;
}

const nativeModule = requireOptionalNativeModule<CafeHceNativeModule>('CafeHce');
const noSubscription = (): Subscription => ({ remove() {} });

export const isSupported = (): boolean => nativeModule?.isSupported() ?? false;
export const isEnabled = (): boolean => nativeModule?.isEnabled() ?? false;
export const isServiceEnabled = (): boolean => nativeModule?.isServiceEnabled() ?? false;
export const openNfcSettings = (): void => { nativeModule?.openNfcSettings(); };
export const setServiceEnabled = (enabled: boolean): void => { nativeModule?.setServiceEnabled(enabled); };
export const setOffer = (offerId: string, ndefMessage: Uint8Array): void => {
  nativeModule?.setOffer(offerId, toBase64Url(ndefMessage));
};
export const clearOffer = (): void => { nativeModule?.clearOffer(); };

export function addReadListener(cb: (event: ReadEvent) => void): Subscription {
  return nativeModule?.addListener('onRead', cb) ?? noSubscription();
}

export function addWriteListener(cb: (event: WriteEvent) => void): Subscription {
  return nativeModule?.addListener('onWrite', (event) => {
    const message = fromBase64Url(event.message);
    if (message !== null) cb({ offerId: event.offerId, message });
  }) ?? noSubscription();
}
