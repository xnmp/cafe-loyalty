import type { StaffCodeError } from '../../domain/provisioning';

export const staffCodeMessage: Readonly<Record<StaffCodeError, string>> = {
  'not-a-staff-code': "That isn't a staff code.",
  malformed: 'That code looks damaged. Print it again.',
  'wrong-cafe': 'That code is for a different café.',
  'untrusted-key': "This app version doesn't trust that code. Update the app, or create a new code with setup-cafe.",
};

export type SetupState =
  | { readonly step: 'intro'; readonly error?: string }
  | { readonly step: 'scan' }
  | { readonly step: 'paste' }
  | { readonly step: 'pin'; readonly code: string; readonly error?: string }
  | { readonly step: 'confirm-pin'; readonly code: string; readonly pin: string }
  | { readonly step: 'done'; readonly code: string; readonly pin: string };

export type SetupAction =
  | { readonly type: 'scan' | 'paste' | 'back' }
  | { readonly type: 'code-accepted'; readonly code: string }
  | { readonly type: 'failed'; readonly message: string }
  | { readonly type: 'pin-entered'; readonly pin: string };

export const initialSetup: SetupState = { step: 'intro' };

export function setupReducer(state: SetupState, action: SetupAction): SetupState {
  if (action.type === 'back') return initialSetup;
  if (action.type === 'failed') return { step: 'intro', error: action.message };
  switch (state.step) {
    case 'intro':
      return action.type === 'scan' || action.type === 'paste' ? { step: action.type } : state;
    case 'scan':
    case 'paste':
      return action.type === 'code-accepted' && action.code.trim()
        ? { step: 'pin', code: action.code.trim() }
        : state;
    case 'pin':
      return action.type === 'pin-entered' && /^\d{4}$/.test(action.pin)
        ? { step: 'confirm-pin', code: state.code, pin: action.pin }
        : state;
    case 'confirm-pin':
      if (action.type !== 'pin-entered') return state;
      return action.pin === state.pin
        ? { ...state, step: 'done' }
        : { step: 'pin', code: state.code, error: "Those PINs didn't match" };
    case 'done':
      return state;
  }
}
