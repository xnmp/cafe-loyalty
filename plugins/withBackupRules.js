// Keep app databases in Android backup and device transfer, but omit SecureStore:
// its Android Keystore key cannot be restored with the encrypted preferences.
const { AndroidConfig, withAndroidManifest, withDangerousMod } = require('expo/config-plugins');
const fs = require('node:fs/promises');
const path = require('node:path');

// sharedpref paths are filenames, including .xml (see the device.xml example):
// https://developer.android.com/identity/data/autobackup#IncludingFiles
// Exclude-only rules preserve default inclusion of both files/SQLite and databases/RKStorage.
const EXCLUDE_SECURE_STORE = '<exclude domain="sharedpref" path="SecureStore.xml"/>';
const BACKUP_RULES = `<?xml version="1.0" encoding="utf-8"?>
<full-backup-content>
  ${EXCLUDE_SECURE_STORE}
</full-backup-content>
`;
const EXTRACTION_RULES = `<?xml version="1.0" encoding="utf-8"?>
<data-extraction-rules>
  <cloud-backup>
    ${EXCLUDE_SECURE_STORE}
  </cloud-backup>
  <device-transfer>
    ${EXCLUDE_SECURE_STORE}
  </device-transfer>
</data-extraction-rules>
`;

module.exports = function withBackupRules(config) {
  config = withAndroidManifest(config, (mod) => {
    const application = AndroidConfig.Manifest.getMainApplicationOrThrow(mod.modResults);
    application.$['android:allowBackup'] = 'true';
    application.$['android:fullBackupContent'] = '@xml/backup_rules';
    application.$['android:dataExtractionRules'] = '@xml/data_extraction_rules';
    return mod;
  });

  return withDangerousMod(config, ['android', async (mod) => {
    const xmlDir = path.join(mod.modRequest.platformProjectRoot, 'app/src/main/res/xml');
    await fs.mkdir(xmlDir, { recursive: true });
    await fs.writeFile(path.join(xmlDir, 'backup_rules.xml'), BACKUP_RULES);
    await fs.writeFile(path.join(xmlDir, 'data_extraction_rules.xml'), EXTRACTION_RULES);
    return mod;
  }]);
};
