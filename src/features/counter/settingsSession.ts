import { createStore } from '../../state/store';
import { initialLockout } from './settingsLockout';

/** Survives modal dismissal so reopening settings cannot bypass the wait. */
export const settingsLockoutSession = createStore(initialLockout);
