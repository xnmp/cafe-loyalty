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
  name: cafe.shortName,
  slug: cafe.cafeId,
  scheme: cafe.scheme,
  version: '1.0.1',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'automatic',
  ios: {
    bundleIdentifier: cafe.bundleId,
    // iPads have no NFC reader. iPhone-only also means the App Store needs no iPad
    // screenshots; iPads can still run it in iPhone mode.
    supportsTablet: false,
    infoPlist: {
      // Ed25519 signatures only (authentication), which is exempt from export compliance.
      ITSAppUsesNonExemptEncryption: false,
    },
    // Apple doesn't read every library's own manifest out of static pods
    // (docs.expo.dev/guides/apple-privacy), so the app repeats their reasons.
    // app.config.test.ts fails when a library adds one that's missing here.
    privacyManifests: {
      NSPrivacyTracking: false,
      NSPrivacyCollectedDataTypes: [],
      NSPrivacyAccessedAPITypes: [
        { NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryDiskSpace', NSPrivacyAccessedAPITypeReasons: ['85F4.1', 'E174.1'] },
        { NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryFileTimestamp', NSPrivacyAccessedAPITypeReasons: ['0A2A.1', '3B52.1', 'C617.1'] },
        { NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategorySystemBootTime', NSPrivacyAccessedAPITypeReasons: ['35F9.1'] },
        { NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryUserDefaults', NSPrivacyAccessedAPITypeReasons: ['CA92.1'] },
      ],
    },
  },
  android: {
    package: cafe.bundleId,
    adaptiveIcon: {
      backgroundColor: cafe.theme.light.accent,
      foregroundImage: './assets/android-icon-foreground.png',
      monochromeImage: './assets/android-icon-monochrome.png',
    },
    // Play needs a higher versionCode on every upload: scripts/build-play-bundle.sh
    // sets one, and EAS builds set their own.
    versionCode: process.env.ANDROID_VERSION_CODE ? Number(process.env.ANDROID_VERSION_CODE) : undefined,
    predictiveBackGestureEnabled: true,
    // Template and library defaults the app never uses; Play lists every permission on the store page.
    blockedPermissions: [
      'android.permission.RECORD_AUDIO',
      'android.permission.SYSTEM_ALERT_WINDOW',
      'android.permission.READ_EXTERNAL_STORAGE',
      'android.permission.WRITE_EXTERNAL_STORAGE',
      'android.permission.USE_BIOMETRIC',
      'android.permission.USE_FINGERPRINT',
      // Attaching a screenshot uses the system photo picker, which needs no media permission.
      // Play makes apps holding these justify broad photo access.
      'android.permission.READ_MEDIA_IMAGES',
      'android.permission.READ_MEDIA_VIDEO',
      'android.permission.READ_MEDIA_VISUAL_USER_SELECTED',
    ],
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
    // Our exclude-only backup rules preserve databases in backup/transfer while
    // excluding SecureStore preferences, whose Keystore key can't be restored.
    ['expo-secure-store', { configureAndroidBackup: false, faceIDPermission: false }],
    './plugins/withBackupRules',
    [
      'expo-camera',
      {
        cameraPermission: `${cafe.name} uses the camera to scan loyalty codes at the counter.`,
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
    // Report a problem: the email composer (it can attach files) and the photo picker for a screenshot.
    'expo-mail-composer',
    [
      'expo-image-picker',
      {
        photosPermission: `${cafe.name} lets you attach a screenshot when you report a problem.`,
        // Same wording as expo-camera's: both plugins write NSCameraUsageDescription.
        cameraPermission: `${cafe.name} uses the camera to scan loyalty codes at the counter.`,
        microphonePermission: false,
      },
    ],
    ['expo-build-properties', { android: { minSdkVersion: 26 } }],
  ],
  experiments: { typedRoutes: true },
  // Set by the owner after `eas init` (docs/RELEASE.md); absent for local builds.
  ...(cafe.easProjectId ? { extra: { eas: { projectId: cafe.easProjectId } } } : {}),
});
