import { describe, expect, test } from '@jest/globals';

import { composeReport, describePhone, isEmailAddress, mailtoUrl, MAX_REPORT_LENGTH, normalizeMessage, type ReportContext } from './report';

const context: ReportContext = { appName: 'Eastern Concourse', appVersion: '1.0.1 (29872000)', system: 'Android 15', device: 'Google Pixel 8', mode: 'customer' };
const to = 'support@example.com';

/** What an email app would show after opening the link. */
function opened(url: string) {
  const match = /^mailto:([^?]+)\?subject=([^&]*)&body=([^&]*)$/.exec(url);
  if (!match) throw new Error(`not a mailto link with subject and body: ${url}`);
  return { to: match[1], subject: decodeURIComponent(match[2]), body: decodeURIComponent(match[3]) };
}

function compose(message: string, kind: 'problem' | 'idea' = 'problem', ctx = context) {
  const result = composeReport(kind, message, ctx, to);
  if (!result.ok) throw new Error(`rejected: ${result.error}`);
  return result.value;
}

describe('composeReport', () => {
  test('addresses the report and puts the message first, then the phone details', () => {
    const email = compose('The stamp never arrived');
    expect(email.to).toBe(to);
    expect(email.body.split('\n')).toEqual([
      'The stamp never arrived',
      '',
      '—',
      'App: Eastern Concourse 1.0.1 (29872000)',
      'Phone: Google Pixel 8, Android 15',
      "Used as: a customer's card",
    ]);
  });

  test('says which kind of report it is and summarises the first line in the subject', () => {
    expect(compose('Button hidden\nunder the nav bar').subject).toBe('Eastern Concourse app problem: Button hidden');
    expect(compose('Dark mode please', 'idea').subject).toBe('Eastern Concourse app suggestion: Dark mode please');
  });

  test('says when it came from the counter phone, and copes without a device model', () => {
    const body = compose('Tap failed', 'problem', { ...context, mode: 'counter', device: null }).body;
    expect(body).toContain('Phone: Android 15');
    expect(body).toContain('Used as: the counter phone');
  });

  test.each(['', '   ', '\n\n\t'])('refuses an empty message (%j)', (message) => {
    expect(composeReport('problem', message, context, to)).toEqual({ ok: false, error: 'empty' });
  });

  test('cuts a long first line in the subject with an ellipsis', () => {
    const subject = compose('x'.repeat(200)).subject;
    expect(subject).toBe(`Eastern Concourse app problem: ${'x'.repeat(60)}…`);
  });
});

describe('normalizeMessage', () => {
  test('trims, unifies line endings and collapses runs of blank lines', () => {
    expect(normalizeMessage('  first\r\nsecond\r\rthird\n\n\n\n\nfourth  ')).toBe('first\nsecond\n\nthird\n\nfourth');
  });

  test('caps an extremely long message without splitting an emoji', () => {
    const message = normalizeMessage('☕'.repeat(10) + '😀'.repeat(MAX_REPORT_LENGTH * 3));
    expect(Array.from(message)).toHaveLength(MAX_REPORT_LENGTH);
    expect(message.endsWith('😀')).toBe(true);
  });
});

describe('mailtoUrl', () => {
  test('round-trips characters that mean something in a URL', () => {
    const tricky = 'a & b = c? 100% #1 + more\nnext line, café ☕';
    const email = compose(tricky);
    const view = opened(mailtoUrl(email));
    expect(view.to).toBe(to);
    expect(view.subject).toBe(email.subject);
    expect(view.body.replace(/\r\n/g, '\n')).toBe(email.body);
  });

  test('sends line breaks as CRLF', () => {
    expect(opened(mailtoUrl(compose('one\ntwo'))).body.startsWith('one\r\ntwo\r\n')).toBe(true);
  });
});

describe('isEmailAddress', () => {
  test.each(['eastern-concourse-cafe-support@googlegroups.com', 'a.b+c@d-e.co.uk'])('accepts %s', (address) => {
    expect(isEmailAddress(address)).toBe(true);
  });
  test.each(['', 'nobody', '@example.com', 'a@b', 'a b@example.com', 'a@exa mple.com', 'a?subject=x@example.com', 'a#b@example.com',
    'a&b@example.com', 'a%40@example.com', '.help@example.com', 'help..desk@example.com', 'help.@example.com', 'a@-example.com', 'a@example-.com', `${'a'.repeat(250)}@example.com`])('rejects %j', (address) => {
    expect(isEmailAddress(address)).toBe(false);
  });
});

describe('describePhone', () => {
  test('names an Android phone by maker and model', () => {
    expect(describePhone({ os: 'android', version: '15', manufacturer: 'Google', model: 'Pixel 8' })).toEqual({ system: 'Android 15', device: 'Google Pixel 8' });
  });
  test('capitalises a lowercase maker', () => {
    expect(describePhone({ os: 'android', version: '14', manufacturer: 'samsung', model: 'SM-S911B' }).device).toBe('Samsung SM-S911B');
  });
  test("doesn't repeat a maker the model already starts with", () => {
    expect(describePhone({ os: 'android', version: '13', manufacturer: 'OnePlus', model: 'OnePlus 11' }).device).toBe('OnePlus 11');
  });
  test('reports no device when the platform gives no model (iOS)', () => {
    expect(describePhone({ os: 'ios', version: '18.2' })).toEqual({ system: 'iOS 18.2', device: null });
    expect(describePhone({ os: 'android', version: 35, model: '  ' })).toEqual({ system: 'Android 35', device: null });
  });
});
