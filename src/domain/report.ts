import { err, ok, type Result } from './result';

/**
 * Problem reports leave the phone through the reporter's own email app, never
 * from this app: they read the message and press send themselves, and the app
 * stays one that makes no network requests.
 */
export type ReportKind = 'problem' | 'idea';

export interface ReportContext {
  /** e.g. "Eastern Concourse" */
  readonly appName: string;
  /** e.g. "1.0.1 (29872000)" */
  readonly appVersion: string;
  /** e.g. "Android 15" */
  readonly system: string;
  /** e.g. "Google Pixel 8"; null where the platform doesn't say. */
  readonly device: string | null;
  readonly mode: 'customer' | 'counter';
}

export interface ReportEmail {
  readonly to: string;
  readonly subject: string;
  readonly body: string;
}

/** Long enough for any real report, short enough for every email app's mailto: handling. */
export const MAX_REPORT_LENGTH = 2000;
const SUBJECT_SUMMARY_LENGTH = 60;

// Deliberately narrower than RFC 5322: characters like ? # & % would change what a mailto: link means.
const EMAIL = /^[A-Za-z0-9_+-]+(?:\.[A-Za-z0-9_+-]+)*@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)+$/;

/** A plain address that needs no escaping in a mailto: link. */
export function isEmailAddress(value: string): boolean {
  return value.length <= 254 && EMAIL.test(value);
}

/** Cut to at most `max` characters without splitting an emoji or other surrogate pair. */
function clip(text: string, max: number): string {
  const chars = Array.from(text);
  return chars.length <= max ? text : chars.slice(0, max).join('');
}

/** What the reporter typed, tidied: trimmed, Unix line endings, no runs of blank lines, length-capped. */
export function normalizeMessage(message: string): string {
  const tidy = message.replace(/\r\n?/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  return clip(tidy, MAX_REPORT_LENGTH).trimEnd();
}

function summary(message: string): string {
  const firstLine = message.split('\n')[0].replace(/\s+/g, ' ').trim();
  const clipped = clip(firstLine, SUBJECT_SUMMARY_LENGTH);
  return clipped.length < firstLine.length ? `${clipped.trimEnd()}…` : clipped;
}

export function composeReport(kind: ReportKind, message: string, context: ReportContext, to: string): Result<ReportEmail, 'empty'> {
  const text = normalizeMessage(message);
  if (!text) return err('empty');
  const label = kind === 'problem' ? 'problem' : 'suggestion';
  const phone = context.device ? `${context.device}, ${context.system}` : context.system;
  const body = [
    text,
    '',
    '—',
    `App: ${context.appName} ${context.appVersion}`,
    `Phone: ${phone}`,
    `Used as: ${context.mode === 'counter' ? 'the counter phone' : "a customer's card"}`,
  ].join('\n');
  return ok({ to, subject: `${context.appName} app ${label}: ${summary(text)}`, body });
}

/** RFC 6068 mailto: link. Line breaks are sent as CRLF, as the RFC asks. */
export function mailtoUrl(email: ReportEmail): string {
  const encode = (value: string) => encodeURIComponent(value.replace(/\r?\n/g, '\r\n'));
  return `mailto:${email.to}?subject=${encode(email.subject)}&body=${encode(email.body)}`;
}

export interface PhoneFacts {
  readonly os: string;
  /** Android's "15" or iOS's "18.2"; Android's API level as a fallback. */
  readonly version: string | number;
  readonly manufacturer?: string;
  readonly model?: string;
}

/** "Android 15" and "Google Pixel 8" from what the platform reports, without "samsung SM-S911B"-style repeats. */
export function describePhone({ os, version, manufacturer, model }: PhoneFacts): Pick<ReportContext, 'system' | 'device'> {
  const system = `${os === 'ios' ? 'iOS' : os === 'android' ? 'Android' : os} ${version}`.trim();
  const name = model?.trim();
  if (!name) return { system, device: null };
  const maker = manufacturer?.trim();
  if (!maker || name.toLowerCase().startsWith(maker.toLowerCase())) return { system, device: name };
  return { system, device: `${maker.charAt(0).toUpperCase()}${maker.slice(1)} ${name}` };
}
