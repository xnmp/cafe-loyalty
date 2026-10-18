// Writes docs/testers/index.html: a printable sign that recruits closed-test
// testers, with QR codes for the testers group and Play's opt-in page.
//   bun run render-tester-sign https://groups.google.com/g/<testers-group>
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import QRCode from 'qrcode';

import { validateConfig, type CafeConfig } from '../src/domain/config';
import { isGroupUrl, optInUrlFor, renderTesterSign } from './lib/testerSign';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const qr = (text: string) => QRCode.toString(text, { type: 'svg', errorCorrectionLevel: 'M', margin: 0 });

async function main(): Promise<void> {
  const groupUrl = process.argv[2] ?? '';
  if (!isGroupUrl(groupUrl)) throw new Error('give the testers group as https://groups.google.com/g/<name>');
  const config = validateConfig(JSON.parse(await readFile(join(root, 'cafe.config.json'), 'utf8')) as CafeConfig);
  if (!config.ok) throw new Error(`cafe.config.json: ${config.error.join('; ')}`);
  const cafe = config.value;
  const optInUrl = optInUrlFor(cafe.bundleId);
  const html = renderTesterSign({ cafe, colors: cafe.theme.light, groupUrl, optInUrl, groupQrSvg: await qr(groupUrl), optInQrSvg: await qr(optInUrl) });
  const out = join(root, 'docs', 'testers', 'index.html');
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, html);
  console.log(`Wrote ${out}. Open it in a browser and print it for the counter.`);
}

main().catch((error: unknown) => {
  console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
