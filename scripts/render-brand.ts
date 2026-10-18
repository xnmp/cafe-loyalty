// Renders the app icon, Android adaptive icon layers and splash marks from the
// colours in cafe.config.json, so rebranding is: edit the config, run
// `bun run render-brand`, rebuild. Output PNGs are committed under assets/.
import { Resvg } from '@resvg/resvg-js';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { stamp, svg } from './lib/brandArt';

const root = fileURLToPath(new URL('..', import.meta.url));
const cafe = JSON.parse(readFileSync(join(root, 'cafe.config.json'), 'utf8'));
const light = cafe.theme.light;
const dark = cafe.theme.dark;

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
