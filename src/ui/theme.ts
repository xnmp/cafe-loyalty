import { createContext, useContext } from 'react';
import { Platform, type TextStyle, type ViewStyle } from 'react-native';

import { cafe } from '../config';
import type { Palette } from '../domain/config';

/**
 * Visual language: a paper punch card on a café counter. Warm paper surfaces,
 * espresso ink, one roasted accent used sparingly (stamps, primary action).
 * Display type is Fraunces (soft, bookish serif); UI text is the platform font.
 */

export interface Theme {
  readonly dark: boolean;
  readonly color: Palette & {
    /** Accent at low strength, for tinted backgrounds. */
    readonly accentSoft: string;
    /** Overlay scrim behind sheets. */
    readonly scrim: string;
  };
}

/** Mixes a #rrggbb colour with another by `amount` (0–1). */
export function mix(a: string, b: string, amount: number): string {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ch = (shift: number) => {
    const x = (pa >> shift) & 255;
    const y = (pb >> shift) & 255;
    return Math.round(x + (y - x) * amount);
  };
  return `#${((1 << 24) | (ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).slice(1)}`;
}

export const withAlpha = (hex: string, alpha: number): string =>
  `${hex}${Math.round(Math.min(1, Math.max(0, alpha)) * 255)
    .toString(16)
    .padStart(2, '0')}`;

export function themeFor(dark: boolean): Theme {
  const p = dark ? cafe.theme.dark : cafe.theme.light;
  return {
    dark,
    color: {
      ...p,
      accentSoft: mix(p.background, p.accent, dark ? 0.22 : 0.12),
      scrim: dark ? 'rgba(0,0,0,0.55)' : 'rgba(42,30,23,0.32)',
    },
  };
}

export const ThemeContext = createContext<Theme>(themeFor(false));
export const useTheme = (): Theme => useContext(ThemeContext);

export const space = { xxs: 4, xs: 8, sm: 12, md: 16, lg: 20, xl: 24, xxl: 32, xxxl: 48 } as const;
export const radius = { sm: 10, md: 16, lg: 24, xl: 32, pill: 999 } as const;

export const font = {
  display: 'Fraunces-SemiBold',
  displayBold: 'Fraunces-Bold',
  displayMedium: 'Fraunces-Medium',
} as const;

export type TextVariant = 'display' | 'title' | 'heading' | 'body' | 'bodyStrong' | 'callout' | 'caption' | 'overline' | 'number';

export const type: Readonly<Record<TextVariant, TextStyle>> = {
  display: { fontFamily: font.display, fontSize: 34, lineHeight: 40, letterSpacing: -0.4 },
  title: { fontFamily: font.display, fontSize: 24, lineHeight: 30, letterSpacing: -0.2 },
  heading: { fontSize: 17, lineHeight: 22, fontWeight: '600' },
  body: { fontSize: 16, lineHeight: 22 },
  bodyStrong: { fontSize: 16, lineHeight: 22, fontWeight: '600' },
  callout: { fontSize: 15, lineHeight: 20 },
  caption: { fontSize: 13, lineHeight: 18 },
  overline: { fontSize: 12, lineHeight: 16, fontWeight: '700', letterSpacing: 1.6, textTransform: 'uppercase' },
  number: { fontFamily: font.displayBold, fontSize: 64, lineHeight: 70, fontVariant: ['tabular-nums'] },
};

/** Soft, warm elevation for the card and sheets. */
export function elevation(theme: Theme, level: 1 | 2 | 3): ViewStyle {
  const shadowColor = theme.dark ? '#000000' : '#5A3A22';
  const spec = { 1: [2, 6, 0.08, 2], 2: [8, 20, 0.12, 6], 3: [16, 36, 0.18, 12] }[level];
  return Platform.select<ViewStyle>({
    ios: { shadowColor, shadowOffset: { width: 0, height: spec[0] }, shadowRadius: spec[1], shadowOpacity: theme.dark ? spec[2] * 3 : spec[2] },
    default: { elevation: spec[3], shadowColor },
  });
}
