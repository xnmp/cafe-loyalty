import { fromBase64Url, toBase64Url } from './bytes';
import { NONCE_LENGTH, TOKEN_LENGTH } from './token';

/**
 * URI formats carried over NFC (NDEF URI record), QR codes and deep links:
 *
 *   token: <scheme>://t/<base64url 84-byte token>
 *   ack:   <scheme>://a/<base64url nonce>/<status>/<progress>/<rewardsAvailable>
 *
 * The ack is written back by the customer app so the counter screen can
 * confirm the outcome. It is unauthenticated UX feedback, never trusted.
 */

export type AckStatus = 'stamped' | 'redeemed' | 'already-used' | 'expired' | 'no-reward' | 'invalid';

const ACK_STATUSES: readonly AckStatus[] = ['stamped', 'redeemed', 'already-used', 'expired', 'no-reward', 'invalid'];

export interface Ack {
  readonly nonceId: string;
  readonly status: AckStatus;
  /** Stamps on the card towards the next reward after this tap. */
  readonly progress: number;
  readonly rewardsAvailable: number;
}

export type ParsedLink =
  | { readonly kind: 'token'; readonly token: Uint8Array }
  | { readonly kind: 'ack'; readonly ack: Ack };

export const buildTokenLink = (scheme: string, token: Uint8Array): string => `${scheme}://t/${toBase64Url(token)}`;

export const buildAckLink = (scheme: string, ack: Ack): string =>
  `${scheme}://a/${ack.nonceId}/${ack.status}/${ack.progress}/${ack.rewardsAvailable}`;

const SMALL_INT = /^\d{1,6}$/;

/**
 * Parses any link this app produces. Tolerant of how platforms hand URLs over
 * (case of the scheme, `scheme:///path`, trailing slashes, query strings), and
 * of a bare base64url token (some QR scanners strip unknown schemes).
 * Returns null for anything that isn't ours.
 */
export function parseLink(scheme: string, raw: string): ParsedLink | null {
  const text = raw.trim();
  const bare = parseBareToken(text);
  if (bare) return { kind: 'token', token: bare };

  const match = /^([a-z][a-z0-9+.-]*):\/*(.*)$/i.exec(text);
  if (!match || match[1].toLowerCase() !== scheme.toLowerCase()) return null;
  const segments = match[2].split(/[?#]/)[0].split('/').filter((s) => s.length > 0);
  const [route, ...rest] = segments;

  if (route === 't' && rest.length === 1) {
    const token = fromBase64Url(rest[0]);
    return token && token.length === TOKEN_LENGTH ? { kind: 'token', token } : null;
  }

  if (route === 'a' && rest.length === 4) {
    const [nonceId, status, progress, available] = rest;
    const nonce = fromBase64Url(nonceId);
    if (!nonce || nonce.length !== NONCE_LENGTH) return null;
    if (!ACK_STATUSES.includes(status as AckStatus)) return null;
    if (!SMALL_INT.test(progress) || !SMALL_INT.test(available)) return null;
    return {
      kind: 'ack',
      ack: { nonceId, status: status as AckStatus, progress: Number(progress), rewardsAvailable: Number(available) },
    };
  }

  return null;
}

function parseBareToken(text: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]{112}$/.test(text)) return null;
  const bytes = fromBase64Url(text);
  return bytes && bytes.length === TOKEN_LENGTH ? bytes : null;
}
