import { cafe } from '../config';
import { parseLink } from '../domain/link';
import { submitWithFeedback } from '../features/card/submit';
import { getStores } from '../state/AppProviders';

/**
 * Incoming URLs (OS camera QR scans, Android NFC dispatch) are handled here,
 * before navigation, so the card screen stays mounted and animates the stamp
 * in place instead of being rebuilt by a route change.
 */
export function redirectSystemPath({ path, initial }: { path: string; initial: boolean }): string | null {
  try {
    const parsed = parseLink(cafe.scheme, path);
    if (!parsed) return path;
    if (parsed.kind === 'token') {
      const stores = getStores();
      void stores.ready.then(() => {
        // A counter device ignores customer links.
        if (stores.staff.getSnapshot().status === 'customer') {
          return submitWithFeedback(stores.card, [path], 'link');
        }
      });
    }
    // Stay where we are; on a cold start, land on the home route.
    return initial ? '/' : null;
  } catch {
    return '/';
  }
}
