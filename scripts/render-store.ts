// Renders the Play Store graphics from cafe.config.json and raw screen
// captures: `bun run render-store`. Output goes to docs/store/.
//
// Raw captures (1080×2400 PNGs) live in docs/store/raw/. Take new ones from a
// build with a clean status bar (Android demo mode) and the dev tools hidden.
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

/** Play phone screenshot: caption above the full screen, which keeps its aspect. 1080×2100 stays within Play's 2:1 limit. */
function screenshot(png: Buffer, lines: readonly [string, string]): string {
  const [W, H] = [1080, 2100];
  const shotH = 1660;
  const shotW = Math.round((shotH * 1080) / 2400);
  const x = (W - shotW) / 2;
  const y = 360;
  const r = 52;
  const href = `data:image/png;base64,${png.toString('base64')}`;
  return doc(
    W,
    H,
    `<defs>
      <clipPath id="screen"><rect x="${x}" y="${y}" width="${shotW}" height="${shotH}" rx="${r}"/></clipPath>
      <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="22"/></filter>
    </defs>
    <rect width="${W}" height="${H}" fill="${theme.background}"/>
    ${text(W / 2, 175, 74, 600, theme.ink, lines[0], 'middle')}
    ${text(W / 2, 265, 74, 600, theme.accent, lines[1], 'middle')}
    <rect x="${x}" y="${y + 18}" width="${shotW}" height="${shotH}" rx="${r}" fill="${theme.ink}" opacity="0.16" filter="url(#shadow)"/>
    <image x="${x}" y="${y}" width="${shotW}" height="${shotH}" xlink:href="${href}" clip-path="url(#screen)" preserveAspectRatio="xMidYMid slice"/>
    <rect x="${x}" y="${y}" width="${shotW}" height="${shotH}" rx="${r}" fill="none" stroke="${theme.line}" stroke-width="3"/>`,
  );
}

/** Play feature graphic, 1024×500: the stamp mark beside the café's name. */
function featureGraphic(): string {
  const [W, H] = [1024, 500];
  const mark = 360;
  return doc(
    W,
    H,
    `<rect width="${W}" height="${H}" fill="${theme.accent}"/>
    <g transform="translate(70 ${(H - mark) / 2})">
      <svg width="${mark}" height="${mark}" viewBox="0 0 ${mark} ${mark}">${stamp({ size: mark, r: 152, fill: theme.paper, ink: theme.accent, ring: theme.accent, speckle: theme.accent })}</svg>
    </g>
    ${text(470, 232, 72, 700, theme.onAccent, cafe.name)}
    ${text(472, 294, 31, 500, theme.onAccent, 'Tap your phone. Collect stamps.')}
    ${text(472, 340, 31, 500, theme.onAccent, `Every ${freeEvery} drink is free.`)}`,
  );
}

const icon512 = () => doc(512, 512, `<rect width="512" height="512" fill="${theme.accent}"/>${stamp({ size: 512, r: 180, fill: theme.paper, ink: theme.accent, ring: theme.accent, speckle: theme.accent })}`);

const render = (source: string) => new Resvg(source, { fitTo: { mode: 'original' }, font: { fontFiles, loadSystemFonts: false, defaultFontFamily: 'Fraunces' } }).render().asPng();

mkdirSync(join(out, 'screenshots'), { recursive: true });
const write = (file: string, source: string) => {
  writeFileSync(join(out, file), render(source));
  console.log(`docs/store/${file}`);
};
write('icon-512.png', icon512());
write('feature-graphic.png', featureGraphic());
for (const { raw, lines } of screenshots) {
  const path = join(out, 'raw', raw);
  if (!existsSync(path)) {
    console.warn(`skipped ${raw}: no capture in docs/store/raw/`);
    continue;
  }
  write(`screenshots/${raw}`, screenshot(readFileSync(path), lines));
}
