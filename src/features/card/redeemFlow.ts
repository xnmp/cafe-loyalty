/**
 * Using a reward from the card screen. One place decides whether a tap on the
 * counter phone may spend a reward (only while the customer has it open and
 * nothing else is spending one), so the sheet and the NFC reader can't disagree.
 */
export type CodeError = 'no-reward' | 'storage';

export type RedeemFlow =
  | { readonly kind: 'closed' }
  /** Open: a tap may use the reward. `error`: making a code just failed. */
  | { readonly kind: 'ready'; readonly error?: CodeError }
  /** Spending a reward on a code. Taps can't use one, and the sheet can't close mid-save. */
  | { readonly kind: 'preparing' }
  | { readonly kind: 'code'; readonly link: string };

export type RedeemAction =
  | { readonly type: 'open' }
  | { readonly type: 'close' }
  | { readonly type: 'show-code' }
  | { readonly type: 'code-made'; readonly link: string }
  | { readonly type: 'code-failed'; readonly error: CodeError };

export const closedFlow: RedeemFlow = { kind: 'closed' };

export function redeemFlow(state: RedeemFlow, action: RedeemAction): RedeemFlow {
  switch (action.type) {
    case 'open':
      return state.kind === 'closed' ? { kind: 'ready' } : state;
    case 'close':
      return state.kind === 'preparing' ? state : closedFlow;
    case 'show-code':
      return state.kind === 'ready' ? { kind: 'preparing' } : state;
    case 'code-made':
      return state.kind === 'preparing' ? { kind: 'code', link: action.link } : state;
    case 'code-failed':
      return state.kind === 'preparing' ? { kind: 'ready', error: action.error } : state;
  }
}

/** A tap may hand the card's stamps to the counter phone. */
export const tapMayUseReward = (state: RedeemFlow): boolean => state.kind === 'ready';

/** Stop reading the counter phone: a code is on screen or being made. */
export const pausesReader = (state: RedeemFlow): boolean => state.kind === 'preparing' || state.kind === 'code';
