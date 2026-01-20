const { withAndroidManifest } = require('@expo/config-plugins');

const withAndroidPermissions = (config) => {
  return withAndroidManifest(config, async (config) => {
    const androidManifest = config.modResults;

    // 1. DEFINE PERMISSIONS TO STRIP
    const permissionsToRemove = [
      'android.permission.SYSTEM_ALERT_WINDOW', // Malware flag - BLOCK
      'android.permission.READ_EXTERNAL_STORAGE', // Deprecated - BLOCK
      'android.permission.WRITE_EXTERNAL_STORAGE', // Deprecated - BLOCK
      'android.permission.CALL_PHONE' // Not needed for VoIP - BLOCK
    ];

    // 2. FILTER THE PERMISSIONS
    if (androidManifest.manifest['uses-permission']) {
      androidManifest.manifest['uses-permission'] = androidManifest.manifest['uses-permission'].filter(
        (permission) => {
          const name = permission.$['android:name'];
          // Keep it only if it is NOT in our block list
          return !permissionsToRemove.includes(name);
        }
      );
    }

    // 3. FIX ANDROID 14 FOREGROUND SERVICE TYPE
    // We must find the specific Wazo/CallKeep service and inject the types
    const application = androidManifest.manifest.application[0];
    if (application.service) {
      const voiceService = application.service.find(
        (s) => s.$['android:name'] === 'io.wazo.callkeep.VoiceConnectionService'
      );
      if (voiceService) {
        // This prevents the "ServiceType not declared" crash on Android 14
        voiceService.$['android:foregroundServiceType'] = 'camera|microphone|phoneCall';
      }
    }

    return config;
  });
};

module.exports = withAndroidPermissions;