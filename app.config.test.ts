import { describe, expect, test } from '@jest/globals';
import type { ConfigContext } from 'expo/config';
import { globSync, readFileSync } from 'node:fs';

import appConfig from './app.config';

/** Each API type and its reasons, from a PrivacyInfo.xcprivacy file's innermost dicts. */
function declaredReasons(plist: string): [string, string[]][] {
  const dicts = plist.match(/<dict>(?:(?!<dict>)[\s\S])*?<\/dict>/g) ?? [];
  return dicts.flatMap((dict) => {
    const type = /<key>NSPrivacyAccessedAPIType<\/key>\s*<string>([^<]+)<\/string>/.exec(dict)?.[1];
    const reasons = /<key>NSPrivacyAccessedAPITypeReasons<\/key>\s*<array>([\s\S]*?)<\/array>/.exec(dict)?.[1] ?? '';
    return type ? [[type, [...reasons.matchAll(/<string>([^<]+)<\/string>/g)].map((m) => m[1])] as [string, string[]]] : [];
  });
}

describe('iOS privacy manifest', () => {
  const config = appConfig({ config: {} } as ConfigContext);
  const app = new Map(
    (config.ios?.privacyManifests?.NSPrivacyAccessedAPITypes ?? []).map((t) => [t.NSPrivacyAccessedAPIType, t.NSPrivacyAccessedAPITypeReasons]),
  );

  test('repeats every reason the installed iOS libraries declare, which Apple may not read from static pods', () => {
    const files = globSync('node_modules/**/PrivacyInfo.xcprivacy').filter((f) => !/\/(example|Example|demo)s?\//.test(f));
    expect(files.length).toBeGreaterThan(0);
    const missing = files.flatMap((file) =>
      declaredReasons(readFileSync(file, 'utf8')).flatMap(([type, reasons]) =>
        reasons.filter((reason) => !(app.get(type) ?? []).includes(reason)).map((reason) => `${type} ${reason} (${file})`),
      ),
    );
    expect(missing).toEqual([]);
  });

  test('says the app neither tracks nor collects data', () => {
    expect(config.ios?.privacyManifests?.NSPrivacyTracking).toBe(false);
    expect(config.ios?.privacyManifests?.NSPrivacyCollectedDataTypes).toEqual([]);
  });
});

describe('declaredReasons', () => {
  test('reads types and reasons in either key order', () => {
    const plist = `<plist><dict><key>NSPrivacyAccessedAPITypes</key><array>
      <dict><key>NSPrivacyAccessedAPIType</key><string>A</string><key>NSPrivacyAccessedAPITypeReasons</key><array><string>1</string><string>2</string></array></dict>
      <dict><key>NSPrivacyAccessedAPITypeReasons</key><array><string>3</string></array><key>NSPrivacyAccessedAPIType</key><string>B</string></dict>
    </array></dict></plist>`;
    expect(declaredReasons(plist)).toEqual([['A', ['1', '2']], ['B', ['3']]]);
  });
});
