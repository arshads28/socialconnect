import { Platform, PermissionsAndroid } from 'react-native';

export const checkCallPermissions = async (isVideo: boolean = false) => {
  if (Platform.OS === 'ios') {
    return true; // iOS permissions are handled in Info.plist
  }

  if (Platform.OS === 'android') {
    try {
      const permissions = [
        PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT, // Required for headsets on Android 12+
      ];

      if (isVideo) {
        permissions.push(PermissionsAndroid.PERMISSIONS.CAMERA);
      }

      // Android 13+ Notification Permission
      if (Platform.Version >= 33) {
        permissions.push(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
      }

      const granted = await PermissionsAndroid.requestMultiple(permissions);

      const allGranted = Object.values(granted).every(
        (status) => status === PermissionsAndroid.RESULTS.GRANTED
      );

      if (!allGranted) {
        console.warn('One or more permissions rejected');
      }

      return allGranted;
    } catch (err) {
      console.warn(err);
      return false;
    }
  }
  return false;
};