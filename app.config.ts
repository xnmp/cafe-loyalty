import type { ConfigContext, ExpoConfig } from 'expo/config';

import cafe from './cafe.config.json';

// Everything café-specific comes from cafe.config.json. Edit that file, not this one.

const NDEF_TAG_APPLICATION_AID = 'D2760000850101';

const fraunces = [
  { family: 'Fraunces-Medium', file: './assets/fonts/Fraunces_500Medium.ttf' },
  { family: 'Fraunces-SemiBold', file: './assets/fonts/Fraunces_600SemiBold.ttf' },
  { family: 'Fraunces-Bold', file: './assets/fonts/Fraunces_700Bold.ttf' },
];

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: cafe.name,
  slug: cafe.cafeId,
  scheme: cafe.scheme,
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'automatic',
  ios: {
    bundleIdentifier: cafe.bundleId,
    supportsTablet: true,
    infoPlist: {
      // Ed25519 signatures only (authentication), which is exempt from export compliance.
      ITSAppUsesNonExemptEncryption: false,
    },
  },
  android: {
    package: cafe.bundleId,
    adaptiveIcon: {
      backgroundColor: cafe.theme.light.accent,
      foregroundImage: './assets/android-icon-foreground.png',
      monochromeImage: './assets/android-icon-monochrome.png',
    },
    predictiveBackGestureEnabled: true,
    blockedPermissions: ['android.permission.RECORD_AUDIO'],
  },
  plugins: [
    'expo-router',
    [
      'expo-font',
      {
        ios: { fonts: fraunces.map((f) => f.file) },
        android: {
          fonts: fraunces.map((f) => ({ fontFamily: f.family, fontDefinitions: [{ path: f.file, weight: 400 }] })),
        },
      },
    ],
    [
      'expo-splash-screen',
      {
        image: './assets/splash-icon.png',
        imageWidth: 120,
        backgroundColor: cafe.theme.light.background,
        dark: { image: './assets/splash-icon-dark.png', backgroundColor: cafe.theme.dark.background },
      },
    ],
    // Keeps SecureStore (counter-device secret, PIN) out of Android auto-backup:
    // its Keystore key can't be restored, so a restored blob would be unreadable.
    ['expo-secure-store', { configureAndroidBackup: true, faceIDPermission: false }],
    [
      'expo-camera',
      {
        cameraPermission: `${cafe.name} uses the camera to scan the stamp code on the counter screen.`,
        microphonePermission: false,
        recordAudioAndroid: false,
      },
    ],
    [
      'react-native-nfc-manager',
      {
        nfcPermission: `${cafe.name} uses NFC to collect stamps when you tap your phone at the counter.`,
        // requestTechnology(Ndef) opens an NFCTagReaderSession on iOS, which only
        // delivers ISO 7816 tags whose AID is listed here.
        selectIdentifiers: [NDEF_TAG_APPLICATION_AID],
        // App Store Connect rejects the deprecated "NDEF" format; "TAG" covers it.
        includeNdefEntitlement: false,
      },
    ],
    './plugins/withNfcLaunch',
    ['expo-build-properties', { android: { minSdkVersion: 26 } }],
  ],
  experiments: { typedRoutes: true },
  // Set by the owner after `eas init` (docs/RELEASE.md); absent for local builds.
  ...(cafe.easProjectId ? { extra: { eas: { projectId: cafe.easProjectId } } } : {}),
});
