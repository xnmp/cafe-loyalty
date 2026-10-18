import type { CafeConfig, Palette } from '../../src/domain/config';
import { escapeHtml } from './cafeKeys';

/**
 * A printable counter sign that recruits closed-test testers: Play only lets
 * a new personal account's app go public after 12 testers have been opted in
 * for 14 days. Two steps, each with a QR code: join the testers group, then
 * opt in and install.
 */
export interface TesterSign {
  readonly cafe: Pick<CafeConfig, 'name' | 'rules'>;
  readonly colors: Pick<Palette, 'background' | 'paper' | 'ink' | 'inkMuted' | 'line' | 'accent' | 'onAccent'>;
  readonly groupUrl: string;
  readonly optInUrl: string;
  readonly groupQrSvg: string;
  readonly optInQrSvg: string;
}

/** Play's opt-in page for an app's test tracks. */
export const optInUrlFor = (bundleId: string): string => `https://play.google.com/apps/testing/${encodeURIComponent(bundleId)}`;

/** Only a Google Groups address can be the testers list, so anything else is a typo. */
export function isGroupUrl(value: string): boolean {
  return /^https:\/\/groups\.google\.com\/g\/[A-Za-z0-9._-]+\/?$/.test(value);
}

export function renderTesterSign({ cafe, colors: c, groupUrl, optInUrl, groupQrSvg, optInQrSvg }: TesterSign): string {
  const name = escapeHtml(cafe.name);
  const reward = escapeHtml(cafe.rules.rewardName);
  const step = (n: number, title: string, qr: string, url: string, hint: string) => `
  <section class="step">
    <div class="qr">${qr}</div>
    <div>
      <p class="n">Step ${n}</p>
      <h2>${title}</h2>
      <p>${hint}</p>
      <p class="url">${escapeHtml(url)}</p>
    </div>
  </section>`;
  return `<!doctype html>
<html lang="en-AU">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${name}: help test our app</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600;9..144,700&display=swap" rel="stylesheet">
<style>
  * { box-sizing: border-box; }
  html { background: ${c.background}; }
  body { max-width: 720px; margin: 24px auto; padding: 40px; font: 17px/1.45 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    color: ${c.ink}; background: ${c.paper}; border-radius: 24px; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .overline { margin: 0; font-size: 13px; font-weight: 700; letter-spacing: .16em; text-transform: uppercase; color: ${c.accent}; }
  h1 { margin: 8px 0 12px; font: 600 44px/1.08 Fraunces, Georgia, serif; letter-spacing: -.01em; }
  .lede { margin: 0 0 28px; font-size: 19px; color: ${c.inkMuted}; }
  .step { display: grid; grid-template-columns: 5.2cm 1fr; gap: 24px; align-items: center; padding: 20px 0; border-top: 1.5px dashed ${c.line}; }
  .qr { width: 5.2cm; height: 5.2cm; padding: 8px; background: #fff; border-radius: 12px; }
  .qr svg { display: block; width: 100%; height: 100%; }
  .n { margin: 0; font-size: 13px; font-weight: 700; letter-spacing: .16em; text-transform: uppercase; color: ${c.inkMuted}; }
  h2 { margin: 4px 0 6px; font: 700 28px/1.15 Fraunces, Georgia, serif; }
  .step p { margin: 0 0 6px; }
  .url { font-size: 13px; color: ${c.inkMuted}; overflow-wrap: anywhere; }
  .note { margin: 8px 0 0; padding: 16px 20px; border-radius: 16px; background: ${c.accent}; color: ${c.onAccent}; }
  .note strong { display: block; font: 700 20px/1.2 Fraunces, Georgia, serif; margin-bottom: 4px; }
  .small { margin: 16px 0 0; font-size: 14px; color: ${c.inkMuted}; }
  @page { size: A4; margin: 1.2cm; }
  @media print { html { background: none; } body { margin: 0; max-width: none; border-radius: 0; padding: 0; background: none; } .step { break-inside: avoid; } }
  @media (max-width: 560px) { body { margin: 0; border-radius: 0; padding: 24px 16px; } h1 { font-size: 34px; } .step { grid-template-columns: 1fr; } .qr { margin: 0 auto; } }
</style></head>
<body>
  <p class="overline">${name}</p>
  <h1>Help us launch our loyalty card app</h1>
  <p class="lede">Our stamp card is moving onto your phone. Collect ${cafe.rules.stampsPerReward} stamps for a ${reward}. Tap your phone at the counter to collect them. Join the test now and you'll be one of the first to use it.</p>
${step(1, 'Join the testers group', groupQrSvg, groupUrl, 'Sign in with the Google account on your phone, then press <b>Join group</b>.')}
${step(2, 'Become a tester, then install', optInQrSvg, optInUrl, 'Press <b>Become a tester</b>, then <b>Download it on Google Play</b>.')}
  <p class="note"><strong>Please keep it for two weeks</strong>Google lets a new app go public once 12 testers have kept it for 14 days. Every tester helps.</p>
  <p class="small">For Android phones, for now. The app is free, has no ads and needs no account. Your stamps stay on your phone.</p>
</body></html>
`;
}
