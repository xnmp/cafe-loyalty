import { afterEach, expect, jest, test } from '@jest/globals';

type Api = typeof import('./index');
type WireEvent = { offerId: string; message: string };

function loadApi(nativeModule: unknown): Api {
  jest.resetModules();
  jest.doMock('expo', () => ({ requireOptionalNativeModule: () => nativeModule }));
  return jest.requireActual<Api>('./index');
}

afterEach(() => {
  jest.resetModules();
  jest.dontMock('expo');
});

test('absent native module has a safe unsupported API', () => {
  const api = loadApi(null);
  expect(api.isSupported()).toBe(false);
  expect(api.isEnabled()).toBe(false);
  expect(api.isServiceEnabled()).toBe(false);
  expect(() => {
    api.openNfcSettings();
    api.setServiceEnabled(true);
    api.setOffer('offer', Uint8Array.of(1));
    api.clearOffer();
    api.addReadListener(() => {}).remove();
    api.addWriteListener(() => {}).remove();
  }).not.toThrow();
});

test('offer bytes cross the bridge as unpadded base64url and errors propagate', () => {
  const setOffer = jest.fn<(id: string, message: string) => void>();
  const api = loadApi({ setOffer });
  api.setOffer('offer', Uint8Array.of(255, 254));
  expect(setOffer).toHaveBeenCalledWith('offer', '__4');
  setOffer.mockImplementation(() => { throw new Error('NDEF too large'); });
  expect(() => api.setOffer('offer', Uint8Array.of(1))).toThrow('NDEF too large');
});

test('write listener decodes bytes, drops invalid messages and exposes native removal', () => {
  let listener: ((event: WireEvent) => void) | undefined;
  const remove = jest.fn<() => void>();
  const addListener = jest.fn((_event: string, cb: (event: WireEvent) => void) => {
    listener = cb;
    return { remove };
  });
  const api = loadApi({ addListener });
  const received = jest.fn<(event: { offerId: string; message: Uint8Array }) => void>();
  const subscription = api.addWriteListener(received);
  expect(addListener.mock.calls[0][0]).toBe('onWrite');
  listener?.({ offerId: 'offer', message: '__4' });
  listener?.({ offerId: 'offer', message: '?' });
  listener?.({ offerId: 'offer', message: 'a' });
  expect(received).toHaveBeenCalledTimes(1);
  expect(received).toHaveBeenCalledWith({ offerId: 'offer', message: Uint8Array.of(255, 254) });
  subscription.remove();
  expect(remove).toHaveBeenCalledTimes(1);
});

test('read listener forwards the offer id and supports removal', () => {
  const remove = jest.fn<() => void>();
  const addListener = jest.fn((_event: string, cb: (event: { offerId: string }) => void) => {
    cb({ offerId: 'offer' });
    return { remove };
  });
  const api = loadApi({ addListener });
  const received = jest.fn<(event: { offerId: string }) => void>();
  api.addReadListener(received).remove();
  expect(addListener.mock.calls[0][0]).toBe('onRead');
  expect(received).toHaveBeenCalledWith({ offerId: 'offer' });
  expect(remove).toHaveBeenCalledTimes(1);
});
