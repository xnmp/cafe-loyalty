import raw from '../cafe.config.json';
import { keyRingOf, validateConfig, type CafeConfig } from './domain/config';

const validated = validateConfig(raw as unknown as CafeConfig);
if (!validated.ok) {
  // A broken config is a build-time mistake; fail loudly in development.
  throw new Error(`cafe.config.json is invalid:\n- ${validated.error.join('\n- ')}`);
}

export const cafe: CafeConfig = validated.value;
export const trustedKeys = keyRingOf(cafe);
