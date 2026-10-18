import { router, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';

import { cafe } from '../../config';
import { submitWithFeedback } from '../../features/card/submit';
import { useStores } from '../../state/AppProviders';
import { useStore } from '../../state/store';
import { Screen } from '../../ui/primitives';

// Tokens already handed to the store this session. Navigation can mount this
// route more than once for the same link (StrictMode, back/forward).
const handled = new Set<string>();

/**
 * Deep link `<scheme>://t/<token>`: opened by the OS camera (QR) or by
 * Android's NFC dispatcher when the app wasn't in the foreground.
 */
export default function TokenLink() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const { card, staff } = useStores();
  const staffState = useStore(staff);

  useEffect(() => {
    // One-shot processing of navigation input, then leave.
    if (staffState.status === 'loading') return;
    if (staffState.status === 'counter' || !token) {
      router.replace('/');
      return;
    }
    if (handled.has(token)) {
      router.replace('/');
      return;
    }
    handled.add(token);
    void submitWithFeedback(card, [`${cafe.scheme}://t/${token}`], 'link').finally(() => router.replace('/'));
  }, [token, card, staffState.status]);

  return <Screen>{null}</Screen>;
}
