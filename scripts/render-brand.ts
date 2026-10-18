// Renders the app icon, Android adaptive icon layers and splash marks from the
// colours in cafe.config.json, so rebranding is: edit the config, run
// `bun run render-brand`, rebuild. Output PNGs are committed under assets/.
import { Resvg } from '@resvg/resvg-js';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const cafe = JSON.parse(readFileSync(join(root, 'cafe.config.json'), 'utf8'));
const light = cafe.theme.light;
const dark = cafe.theme.dark;

function prng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s ^ (s >>> 15), 0x2c1b3c6d) + 0x9e3779b9) >>> 0;
    return s / 0x100000000;
  };
}

/** Slightly irregular circle: an inked rubber-stamp edge (same idea as the in-app stamps). */
function inkedCircle(cx: number, cy: number, r: number, seed: number): string {
  const rand = prng(seed);
  const n = 36;
  const pts = Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    const rr = r * (1 + (rand() - 0.5) * 0.028);
    return [cx + Math.cos(a) * rr, cy + Math.sin(a) * rr];
  });
  const mid = (i: number) => {
    const [x1, y1] = pts[i % n];
    const [x2, y2] = pts[(i + 1) % n];
    return [(x1 + x2) / 2, (y1 + y2) / 2];
  };
  const [sx, sy] = mid(n - 1);
  return `M${sx.toFixed(1)} ${sy.toFixed(1)} ${pts.map(([x, y], i) => `Q${x.toFixed(1)} ${y.toFixed(1)} ${mid(i).map((v) => v.toFixed(1)).join(' ')}`).join(' ')} Z`;
}

/** Coffee cup with steam, drawn in a 100×100 box. */
const cup = (color: string) => `
  <g fill="none" stroke="${color}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round">
    <path d="M38 12c-5 5 5 9 0 15"/><path d="M52 8c-5 5 5 9 0 15"/>
    <path d="M73 47h4a9 9 0 0 1 0 18h-6"/>
    <path d="M16 88h66"/>
  </g>
  <path d="M22 38h52v20a22 22 0 0 1-22 22h-8a22 22 0 0 1-22-22z" fill="${color}"/>`;

function stamp({ size, r, fill, ink, ring, speckle }: { size: number; r: number; fill: string; ink: string; ring?: string; speckle?: string }): string {
  const c = size / 2;
  const rand = prng(7);
  const dots = speckle
    ? Array.from({ length: 14 }, () => {
        const a = rand() * Math.PI * 2;
        const d = Math.sqrt(rand()) * r * 0.9;
        return `<circle cx="${(c + Math.cos(a) * d).toFixed(1)}" cy="${(c + Math.sin(a) * d).toFixed(1)}" r="${(r * (0.008 + rand() * 0.018)).toFixed(1)}" fill="${speckle}" opacity="0.28"/>`;
      }).join('')
    : '';
  const glyph = r * 1.05;
  return `
  <g transform="rotate(-8 ${c} ${c})">
    <path d="${inkedCircle(c, c, r, 11)}" fill="${fill}"/>
    ${ring ? `<circle cx="${c}" cy="${c}" r="${r * 0.84}" fill="none" stroke="${ring}" stroke-width="${r * 0.03}" stroke-dasharray="${r * 0.075} ${r * 0.05}" opacity="0.45"/>` : ''}
    ${dots}
    <g transform="translate(${c - glyph / 2} ${c - glyph / 2 + r * 0.02}) scale(${glyph / 100})">${cup(ink)}</g>
  </g>`;
}

const svg = (size: number, body: string, bg?: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${bg ? `<rect width="${size}" height="${size}" fill="${bg}"/>` : ''}${body}</svg>`;

const outputs: Record<string, string> = {
  // iOS / store icon: full bleed, the OS applies the mask.
  'icon.png': svg(1024, stamp({ size: 1024, r: 360, fill: light.paper, ink: light.accent, ring: light.accent, speckle: light.accent }), light.accent),
  // Android adaptive foreground: keep inside the 66% safe zone; background colour comes from app.config.ts.
  'android-icon-foreground.png': svg(1024, stamp({ size: 1024, r: 290, fill: light.paper, ink: light.accent, ring: light.accent, speckle: light.accent })),
  // Android 13+ themed icon: alpha only.
  'android-icon-monochrome.png': svg(1024, stamp({ size: 1024, r: 290, fill: '#00000000', ink: '#FFFFFF', ring: '#FFFFFF' })),
  'splash-icon.png': svg(512, stamp({ size: 512, r: 230, fill: light.accent, ink: light.paper, ring: light.paper, speckle: light.paper })),
  'splash-icon-dark.png': svg(512, stamp({ size: 512, r: 230, fill: dark.accent, ink: dark.background, ring: dark.background, speckle: dark.background })),
};

mkdirSync(join(root, 'assets'), { recursive: true });
for (const [file, source] of Object.entries(outputs)) {
  const png = new Resvg(source, { fitTo: { mode: 'original' } }).render().asPng();
  writeFileSync(join(root, 'assets', file), png);
  console.log(`assets/${file}`);
}
