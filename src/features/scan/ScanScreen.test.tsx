import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, render } from '@testing-library/react-native';
import { router } from 'expo-router';

import { buildTokenLink } from '../../domain/link';
import { cafe } from '../../config';
import { submitWithFeedback, type FeltResult } from '../card/submit';
import { ScanScreen } from './ScanScreen';

jest.mock('expo-router', () => ({ router: { back: jest.fn() } }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('../../state/AppProviders', () => ({ useStores: () => ({ card: {} }) }));
jest.mock('../card/submit', () => ({ submitWithFeedback: jest.fn() }));
jest.mock('../../ui/primitives', () => ({ AppText: require('react-native').Text }));
jest.mock('./QrScanner', () => ({
  QrScanner: ({ onScan, onClose }: { onScan: (data: string) => void; onClose: () => void }) => {
    const React = require('react');
    const { View, Pressable } = require('react-native');
    return React.createElement(View, null,
      React.createElement(Pressable, { accessibilityLabel: 'Scan result', onScan }),
      React.createElement(Pressable, { accessibilityLabel: 'Close scanner', onPress: onClose }),
    );
  },
}));

beforeEach(() => { jest.clearAllMocks(); });
const token = buildTokenLink(cafe.scheme, new Uint8Array(84));

describe('customer scan submission', () => {
  it('keeps scanning after an unrelated code and shows a useful message', async () => {
    const screen = await render(<ScanScreen />);
    await fireEvent(screen.getByLabelText('Scan result'), 'scan', 'https://example.com');
    expect(screen.getByText(`That's not a ${cafe.name} code`)).toBeTruthy();
    expect(submitWithFeedback).not.toHaveBeenCalled();
    expect(router.back).not.toHaveBeenCalled();
  });

  it('submits only once while saving, then returns to the card', async () => {
    let finish!: () => void;
    const pending = new Promise<FeltResult>((resolve) => { finish = () => resolve({} as FeltResult); });
    jest.mocked(submitWithFeedback).mockReturnValue(pending);
    const screen = await render(<ScanScreen />);
    await fireEvent(screen.getByLabelText('Scan result'), 'scan', token);
    await fireEvent(screen.getByLabelText('Scan result'), 'scan', token);
    expect(submitWithFeedback).toHaveBeenCalledTimes(1);
    expect(submitWithFeedback).toHaveBeenCalledWith(expect.anything(), [token], 'qr');
    expect(router.back).not.toHaveBeenCalled();
    await act(async () => { finish(); await pending; });
    expect(router.back).toHaveBeenCalledTimes(1);
  });

  it('does not pop another screen when saving finishes after closing the scanner', async () => {
    let finish!: () => void;
    const pending = new Promise<FeltResult>((resolve) => { finish = () => resolve({} as FeltResult); });
    jest.mocked(submitWithFeedback).mockReturnValue(pending);
    const screen = await render(<ScanScreen />);
    await fireEvent(screen.getByLabelText('Scan result'), 'scan', token);
    await fireEvent.press(screen.getByLabelText('Close scanner'));
    expect(router.back).toHaveBeenCalledTimes(1);
    await act(async () => { finish(); await pending; });
    expect(router.back).toHaveBeenCalledTimes(1);
  });

  it('lets the customer retry after saving fails', async () => {
    jest.mocked(submitWithFeedback).mockRejectedValueOnce(new Error('disk full')).mockResolvedValueOnce({} as FeltResult);
    const screen = await render(<ScanScreen />);
    await fireEvent(screen.getByLabelText('Scan result'), 'scan', token);
    expect(screen.getByText('That stamp could not be saved. Please scan again.')).toBeTruthy();
    await fireEvent(screen.getByLabelText('Scan result'), 'scan', token);
    expect(router.back).toHaveBeenCalledTimes(1);
  });
});
