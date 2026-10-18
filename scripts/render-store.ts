// Renders the Play Store and App Store graphics from cafe.config.json and raw
// screen captures: `bun run render-store`. Output goes to docs/store/.
//
// Raw Android captures (1080×2400 PNGs) live in docs/store/raw/. Take new ones
// from a build with a clean status bar (Android demo mode) and the dev tools
// hidden. Raw iPhone captures live in docs/store/ios-raw/; the iOS simulator
// workflow makes them (docs/RELEASE.md §5).
import { Resvg } from '@resvg/resvg-js';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { stamp } from './lib/brandArt';

const root = fileURLToPath(new URL('..', import.meta.url));
const cafe = JSON.parse(readFileSync(join(root, 'cafe.config.json'), 'utf8'));
const theme = cafe.theme.light;
const out = join(root, 'docs', 'store');
const fontFiles = ['Fraunces_500Medium.ttf', 'Fraunces_600SemiBold.ttf', 'Fraunces_700Bold.ttf'].map((f) => join(root, 'assets', 'fonts', f));

const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : (['th', 'st', 'nd', 'rd'][n % 10] ?? 'th')}`;
const freeEvery = ordinal(cafe.rules.stampsPerReward + 1);

/**
 * One caption per screenshot, two short lines each. Edit to taste. Never use a
 * capture showing a redemption code: it carries real signed stamps, so anyone
 * could scan it off the store listing and redeem it.
 */
const screenshots: readonly { readonly raw: string; readonly lines: readonly [string, string] }[] = [
  { raw: '01-card.png', lines: ['Your stamp card,', 'always on you'] },
  { raw: '02-stamp-added.png', lines: ['Tap the counter phone.', 'Stamp added.'] },
  { raw: '03-unlocked.png', lines: [`Every ${freeEvery} drink`, 'is on us'] },
  { raw: '04-reward-ready.png', lines: ['Your free drink,', 'ready when you are'] },
  { raw: '07-history.png', lines: ['Every stamp,', 'every reward'] },
];

const doc = (w: number, h: number, body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>`;

const text = (x: number, y: number, size: number, weight: number, fill: string, content: string, anchor = 'start') =>
  `<text x="${x}" y="${y}" font-family="Fraunces" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}">${escape(content)}</text>`;

/** Where a store's screenshot puts the caption and the screen. */
interface Layout {
  readonly size: readonly [number, number];
  readonly caption: { readonly size: number; readonly baselines: readonly [number, number] };
  readonly screenTop: number;
  readonly screenBottom: number;
  readonly radius: number;
}
/** Play wants exactly 9:16. */
const play: Layout = { size: [1080, 1920], caption: { size: 70, baselines: [160, 245] }, screenTop: 330, screenBottom: 1840, radius: 52 };
/** App Store Connect's 6.9" iPhone size; it scales these down for smaller iPhones. */
const appStore: Layout = { size: [1320, 2868], caption: { size: 96, baselines: [250, 366] }, screenTop: 480, screenBottom: 2748, radius: 96 };

/** Width and height from a PNG's header. */
function pngSize(png: Buffer): readonly [number, number] {
  if (png.length < 24 || png.toString('ascii', 12, 16) !== 'IHDR') throw new Error('not a PNG');
  return [png.readUInt32BE(16), png.readUInt32BE(20)];
}

/** Store screenshot: caption above the full screen, which keeps its aspect. */
function screenshot(png: Buffer, lines: readonly [string, string], layout: Layout): string {
  const [W, H] = layout.size;
  const [rawW, rawH] = pngSize(png);
  const shotH = layout.screenBottom - layout.screenTop;
  const shotW = Math.round((shotH * rawW) / rawH);
  const x = (W - shotW) / 2;
  const y = layout.screenTop;
  const r = layout.radius;
  const href = `data:image/png;base64,${png.toString('base64')}`;
  return doc(
    W,
    H,
    `<defs>
      <clipPath id="screen"><rect x="${x}" y="${y}" width="${shotW}" height="${shotH}" rx="${r}"/></clipPath>
      <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="22"/></filter>
    </defs>
    <rect width="${W}" height="${H}" fill="${theme.background}"/>
    ${text(W / 2, layout.caption.baselines[0], layout.caption.size, 600, theme.ink, lines[0], 'middle')}
    ${text(W / 2, layout.caption.baselines[1], layout.caption.size, 600, theme.accent, lines[1], 'middle')}
    <rect x="${x}" y="${y + 18}" width="${shotW}" height="${shotH}" rx="${r}" fill="${theme.ink}" opacity="0.16" filter="url(#shadow)"/>
    <image x="${x}" y="${y}" width="${shotW}" height="${shotH}" xlink:href="${href}" clip-path="url(#screen)" preserveAspectRatio="xMidYMid slice"/>
    <rect x="${x}" y="${y}" width="${shotW}" height="${shotH}" rx="${r}" fill="none" stroke="${theme.line}" stroke-width="3"/>`,
  );
}

/** Splits a name into at most two lines, as evenly as its words allow. */
function balancedLines(name: string): readonly string[] {
  const words = name.trim().split(/\s+/);
  if (name.length <= 14 || words.length < 2) return [name];
  const splits = words.slice(1).map((_, i) => [words.slice(0, i + 1).join(' '), words.slice(i + 1).join(' ')]);
  const longest = (lines: readonly string[]) => Math.max(...lines.map((l) => l.length));
  return splits.reduce((best, s) => (longest(s) < longest(best) ? s : best));
}

/** Play feature graphic, 1024×500: the stamp mark beside the café's name. */
function featureGraphic(): string {
  const [W, H] = [1024, 500];
  const mark = 360;
  const x = 470;
  const name = balancedLines(cafe.name);
  // Fraunces Bold averages about 0.55em a character: a long name shrinks to fit beside the mark.
  const size = Math.min(72, Math.floor((W - x - 48) / (0.55 * Math.max(...name.map((l) => l.length)))));
  const lead = Math.round(size * 1.12);
  const top = (H - (name.length * lead + 110)) / 2;
  const below = top + name.length * lead;
  return doc(
    W,
    H,
    `<rect width="${W}" height="${H}" fill="${theme.accent}"/>
    <g transform="translate(70 ${(H - mark) / 2})">
      <svg width="${mark}" height="${mark}" viewBox="0 0 ${mark} ${mark}">${stamp({ size: mark, r: 152, fill: theme.paper, ink: theme.accent, ring: theme.accent, speckle: theme.accent })}</svg>
    </g>
    ${name.map((line, i) => text(x, top + size + i * lead, size, 700, theme.onAccent, line)).join('')}
    ${text(x + 2, below + 62, 31, 500, theme.onAccent, 'Tap your phone. Collect stamps.')}
    ${text(x + 2, below + 108, 31, 500, theme.onAccent, `Every ${freeEvery} drink is free.`)}`,
  );
}

const icon512 = () => doc(512, 512, `<rect width="512" height="512" fill="${theme.accent}"/>${stamp({ size: 512, r: 180, fill: theme.paper, ink: theme.accent, ring: theme.accent, speckle: theme.accent })}`);

const render = (source: string) => new Resvg(source, { fitTo: { mode: 'original' }, font: { fontFiles, loadSystemFonts: false, defaultFontFamily: 'Fraunces' } }).render().asPng();

const write = (file: string, source: string) => {
  writeFileSync(join(out, file), render(source));
  console.log(`docs/store/${file}`);
};
write('icon-512.png', icon512());
write('feature-graphic.png', featureGraphic());
const stores = [
  { from: 'raw', to: 'screenshots', layout: play },
  { from: 'ios-raw', to: 'app-store', layout: appStore },
] as const;
for (const { from, to, layout } of stores) {
  mkdirSync(join(out, to), { recursive: true });
  for (const { raw, lines } of screenshots) {
    const path = join(out, from, raw);
    if (!existsSync(path)) {
      console.warn(`skipped ${to}/${raw}: no capture in docs/store/${from}/`);
      continue;
    }
    write(`${to}/${raw}`, screenshot(readFileSync(path), lines, layout));
  }
}
