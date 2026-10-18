// Lets an Android phone with the app closed open it by tapping the counter
// device: the NFC dispatcher fires NDEF_DISCOVERED for our custom-scheme URI
// record (it does not fall back to ACTION_VIEW for non-http schemes). React
// Native's Linking already treats NDEF_DISCOVERED like VIEW, so the URI then
// routes through expo-router to src/app/t/[token].tsx.
const { AndroidConfig, withAndroidManifest } = require('expo/config-plugins');

const NDEF_DISCOVERED = 'android.nfc.action.NDEF_DISCOVERED';

module.exports = function withNfcLaunch(config) {
  return withAndroidManifest(config, (mod) => {
    const scheme = Array.isArray(config.scheme) ? config.scheme[0] : config.scheme;
    if (!scheme) throw new Error('withNfcLaunch: expo.scheme must be set');
    const activity = AndroidConfig.Manifest.getMainActivityOrThrow(mod.modResults);
    const filters = activity['intent-filter'] ?? [];
    const already = filters.some((f) => (f.action ?? []).some((a) => a.$['android:name'] === NDEF_DISCOVERED));
    if (!already) {
      filters.push({
        action: [{ $: { 'android:name': NDEF_DISCOVERED } }],
        category: [{ $: { 'android:name': 'android.intent.category.DEFAULT' } }],
        data: [{ $: { 'android:scheme': scheme } }],
      });
    }
    activity['intent-filter'] = filters;
    return mod;
  });
};
