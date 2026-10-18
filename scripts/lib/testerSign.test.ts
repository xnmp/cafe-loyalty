import { describe, expect, test } from '@jest/globals';

import type { CafeConfig } from '../../src/domain/config';
import { isGroupUrl, optInUrlFor, renderTesterSign, type TesterSign } from './testerSign';

const sign = (cafe: Partial<Pick<CafeConfig, 'name' | 'rules'>> = {}): TesterSign => ({
  cafe: { name: 'Test Café', rules: { stampsPerReward: 9, maxStampsPerTap: 1, rewardName: 'free drink' }, ...cafe },
  colors: { background: '#eee', paper: '#fff', ink: '#111', inkMuted: '#666', line: '#ccc', accent: '#a52', onAccent: '#fff' },
  groupUrl: 'https://groups.google.com/g/test-cafe-testers',
  optInUrl: optInUrlFor('com.test.cafe'),
  groupQrSvg: '<svg id="group-qr"></svg>',
  optInQrSvg: '<svg id="opt-in-qr"></svg>',
});

describe('renderTesterSign', () => {
  test('shows both steps in order, each with its QR code and its link written out', () => {
    const html = renderTesterSign(sign());
    const order = ['group-qr', 'Join the testers group', 'https://groups.google.com/g/test-cafe-testers',
      'opt-in-qr', 'Become a tester', 'https://play.google.com/apps/testing/com.test.cafe'].map((text) => html.indexOf(text));
    expect(order.every((at) => at >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  test('says what the reward is and asks testers to stay for the 14 days', () => {
    const html = renderTesterSign(sign());
    expect(html).toContain('Collect 9 stamps for a free drink');
    expect(html).toMatch(/12 testers have kept it for 14 days/);
  });

  test('escapes the café name and reward', () => {
    const html = renderTesterSign(sign({ name: 'Tom & Jo\'s <Café>', rules: { stampsPerReward: 5, maxStampsPerTap: 1, rewardName: '"big" <b>tea</b>' } }));
    expect(html).toContain('Tom &amp; Jo&#39;s &lt;Café&gt;');
    expect(html).toContain('&quot;big&quot; &lt;b&gt;tea&lt;/b&gt;');
    expect(html).not.toContain('<Café>');
  });
});

describe('isGroupUrl', () => {
  test.each(['https://groups.google.com/g/eastern-concourse-cafe-testers', 'https://groups.google.com/g/a.b_c/'])('accepts %s', (url) => {
    expect(isGroupUrl(url)).toBe(true);
  });
  test.each(['', 'eastern-concourse-cafe-testers@googlegroups.com', 'http://groups.google.com/g/x', 'https://groups.google.com/g/',
    'https://groups.google.com.evil.example/g/x', 'https://groups.google.com/g/x?hl=en', 'https://groups.google.com/g/x"><script>'])('rejects %j', (url) => {
    expect(isGroupUrl(url)).toBe(false);
  });
});

describe('optInUrlFor', () => {
  test("is Play's opt-in page for the app", () => {
    expect(optInUrlFor('md.chong.cafecard')).toBe('https://play.google.com/apps/testing/md.chong.cafecard');
  });
});
