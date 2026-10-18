/** Tokens older than this are rejected. Generous enough for slow phones and clock drift. */
export const MAX_TOKEN_AGE_S = 15 * 60;
/** Tolerated clock skew for tokens that appear to come from the future. */
export const MAX_CLOCK_SKEW_S = 15 * 60;

export type FreshnessError = 'expired' | 'not-yet-valid';

/** Checks a token's issue time (unix seconds) against the local clock (epoch ms). */
export function checkFreshness(issuedAt: number, now: number): FreshnessError | null {
  const nowS = Math.floor(now / 1000);
  if (issuedAt > nowS + MAX_CLOCK_SKEW_S) return 'not-yet-valid';
  if (nowS - issuedAt > MAX_TOKEN_AGE_S) return 'expired';
  return null;
}
