import { bytesEqual, fromBase64Url } from './bytes';
import type { Rules } from './card';
import { DEMO_KEY_ID, DEMO_PUBLIC_KEY } from './provisioning';
import { err, ok, type Result } from './result';
import type { KeyRing } from './token';

/** Shape of cafe.config.json. Everything café-specific lives there. */

export interface Palette {
  /** Screen background. */
  readonly background: string;
  /** Raised surfaces: sheets, list rows. */
  readonly surface: string;
  /** The loyalty card itself. */
  readonly paper: string;
  /** Primary text. */
  readonly ink: string;
  /** Secondary text. */
  readonly inkMuted: string;
  /** Hairlines, empty stamp outlines. */
  readonly line: string;
  /** Brand accent: stamps, primary buttons. */
  readonly accent: string;
  /** Text/icons on top of accent. */
  readonly onAccent: string;
  readonly success: string;
  readonly danger: string;
}

export interface CafeConfig {
  /** Lowercase slug; part of the token signature, so changing it invalidates outstanding tokens. */
  readonly cafeId: string;
  readonly name: string;
  /** Home-screen label and tight headers; keep it to about 18 characters. */
  readonly shortName: string;
  readonly tagline: string;
  /** Deep link scheme, lowercase letters/digits only. */
  readonly scheme: string;
  readonly bundleId: string;
  /** EAS project id from `eas init`; empty until the app is linked to Expo's build service. */
  readonly easProjectId?: string;
  /** Linked from About; the stores require the policy to be reachable in the app. */
  readonly privacyPolicyUrl?: string;
  readonly rules: Rules & {
    /** Singular noun phrase, e.g. "free drink". */
    readonly rewardName: string;
  };
  readonly contact: {
    readonly address: string;
    readonly hours: readonly string[];
    readonly phone: string;
    readonly website: string;
    readonly instagram: string;
  };
  readonly theme: { readonly light: Palette; readonly dark: Palette };
  readonly keys: readonly { readonly id: number; readonly publicKey: string }[];
}

const PALETTE_KEYS: readonly (keyof Palette)[] = [
  'background', 'surface', 'paper', 'ink', 'inkMuted', 'line', 'accent', 'onAccent', 'success', 'danger',
];

const HEX = /^#[0-9a-fA-F]{6}$/;

/** Validates the parsed config and returns a list of human-readable problems if any. */
export function validateConfig(c: CafeConfig): Result<CafeConfig, readonly string[]> {
  const problems: string[] = [];
  const check = (cond: boolean, msg: string) => {
    if (!cond) problems.push(msg);
  };

  check(/^[a-z0-9]+(-[a-z0-9]+)*$/.test(c.cafeId ?? ''), 'cafeId must be a lowercase slug like "eastern-concourse"');
  check(typeof c.name === 'string' && c.name.trim().length > 0, 'name is required');
  check(typeof c.shortName === 'string' && c.shortName.trim().length > 0, 'shortName is required');
  check(/^[a-z][a-z0-9]{1,31}$/.test(c.scheme ?? ''), 'scheme must be lowercase letters/digits, starting with a letter');
  check(/^[a-zA-Z][a-zA-Z0-9]*(\.[a-zA-Z][a-zA-Z0-9]*)+$/.test(c.bundleId ?? ''), 'bundleId must look like com.example.app');
  check(c.privacyPolicyUrl === undefined || /^https:\/\/\S+$/.test(c.privacyPolicyUrl), 'privacyPolicyUrl must be an https:// link');
  check(Number.isInteger(c.rules?.stampsPerReward) && c.rules.stampsPerReward >= 2 && c.rules.stampsPerReward <= 20,
    'rules.stampsPerReward must be an integer between 2 and 20');
  check(Number.isInteger(c.rules?.maxStampsPerTap) && c.rules.maxStampsPerTap >= 1 && c.rules.maxStampsPerTap <= 50,
    'rules.maxStampsPerTap must be an integer between 1 and 50');
  check(typeof c.rules?.rewardName === 'string' && c.rules.rewardName.length > 0, 'rules.rewardName is required');

  for (const mode of ['light', 'dark'] as const) {
    for (const key of PALETTE_KEYS) {
      check(HEX.test(c.theme?.[mode]?.[key] ?? ''), `theme.${mode}.${key} must be a #rrggbb colour`);
    }
  }

  check(Array.isArray(c.keys) && c.keys.length > 0, 'keys must list at least one public key (run `bun run setup-cafe`)');
  const ids = new Set<number>();
  for (const k of c.keys ?? []) {
    check(Number.isInteger(k.id) && k.id > DEMO_KEY_ID && k.id <= 255, `key id ${k.id} must be 1–255 (0 is the demo code's)`);
    check(!ids.has(k.id), `duplicate key id ${k.id}`);
    ids.add(k.id);
    const publicKey = fromBase64Url(k.publicKey ?? '');
    check(publicKey?.length === 32, `key ${k.id} publicKey must be 32 bytes base64url`);
    // Its seed is public: trusting it would let anyone issue stamps.
    check(!publicKey || !bytesEqual(publicKey, DEMO_PUBLIC_KEY), `key ${k.id} is the public demo key and can't be trusted`);
  }

  return problems.length === 0 ? ok(c) : err(problems);
}

/** The keys customers trust. Never the demo key, even in a config that skipped validation. */
export function keyRingOf(c: CafeConfig): KeyRing {
  return new Map(
    c.keys.flatMap((k) => {
      const bytes = fromBase64Url(k.publicKey);
      const usable = bytes && bytes.length === 32 && k.id !== DEMO_KEY_ID && !bytesEqual(bytes, DEMO_PUBLIC_KEY);
      return usable ? [[k.id, bytes] as const] : [];
    }),
  );
}
