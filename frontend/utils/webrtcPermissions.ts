import { Platform, PermissionsAndroid, Permission } from 'react-native';

export const checkCallPermissions = async (isVideo: boolean = false) => {
  if (Platform.OS === 'ios') {
    return true; 
  }

  if (Platform.OS === 'android') {
    try {
      // 1. Start with basic audio
      const permissions: Permission[] = [
        PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
      ];

      // 2. Android 12+ (API 31+) needs Bluetooth
      if (Platform.Version >= 31) {
        permissions.push(PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT);
      }

      // 3. Video Call Check
      if (isVideo) {
        permissions.push(PermissionsAndroid.PERMISSIONS.CAMERA);
      }

      // 4. Android 13+ Notifications
      if (Platform.Version >= 33) {
        permissions.push(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
      }
      
      // 5. Android 14+ Telecom Logic
      if (Platform.Version >= 34) {
         // ✅ FIX: Use raw strings to avoid TypeScript errors
         permissions.push("android.permission.READ_PHONE_NUMBERS" as Permission);
         permissions.push("android.permission.READ_PHONE_STATE" as Permission);
         permissions.push("android.permission.USE_FULL_SCREEN_INTENT" as Permission); 
      }

      const granted = await PermissionsAndroid.requestMultiple(permissions);

      // Check if critical permissions (Audio) are granted. 
      const audioGranted = granted[PermissionsAndroid.PERMISSIONS.RECORD_AUDIO] === PermissionsAndroid.RESULTS.GRANTED;
      
      if (!audioGranted) {
        console.warn('❌ CRITICAL: Audio permission denied');
        return false;
      }

      return true;
    } catch (err) {
      console.warn(err);
      return false;
    }
  }
  return false;
};