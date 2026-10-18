/**
 * The customer using a reward from their card: the one place that decides
 * whether a tap on the counter phone may spend it. The card store applies these
 * transitions synchronously, so whatever asks (the NFC reader, the code button)
 * sees the same answer at the moment it acts.
 */
export type CodeError = 'no-reward' | 'storage';

export type RewardUse =
  | null
  /** Open: a tap may use the reward. `error`: making a code just failed. */
  | { readonly kind: 'open'; readonly error?: CodeError }
  /** A tap handed the card's stamps to the counter; waiting to hear if they arrived. */
  | { readonly kind: 'sending' }
  /** Spending the reward on a code. */
  | { readonly kind: 'preparing' }
  | { readonly kind: 'code'; readonly link: string };

export type RewardUseAction =
  | { readonly type: 'open' }
  | { readonly type: 'close' }
  | { readonly type: 'send' }
  /** `used`: the tap spent the reward on this phone (or may have, if saving failed). */
  | { readonly type: 'sent'; readonly used: boolean }
  | { readonly type: 'make-code' }
  | { readonly type: 'code-made'; readonly link: string }
  | { readonly type: 'code-failed'; readonly error: CodeError };

export function rewardUse(state: RewardUse, action: RewardUseAction): RewardUse {
  switch (action.type) {
    case 'open':
      return state === null ? { kind: 'open' } : state;
    case 'close':
      // A code being saved needs somewhere to appear; everything else can close.
      return state?.kind === 'preparing' ? state : null;
    case 'send':
      return state?.kind === 'open' ? { kind: 'sending' } : state;
    case 'sent':
      return state?.kind === 'sending' ? (action.used ? null : { kind: 'open' }) : state;
    case 'make-code':
      return state?.kind === 'open' ? { kind: 'preparing' } : state;
    case 'code-made':
      return state?.kind === 'preparing' ? { kind: 'code', link: action.link } : state;
    case 'code-failed':
      return state?.kind === 'preparing' ? { kind: 'open', error: action.error } : state;
  }
}

/** Open and idle: a tap may hand over the stamps, or a code may be made. Never both at once. */
export const isOpen = (state: RewardUse): boolean => state?.kind === 'open';

/** Stop reading the counter phone: a code is on screen or being made. */
export const pausesReader = (state: RewardUse): boolean => state?.kind === 'preparing' || state?.kind === 'code';
