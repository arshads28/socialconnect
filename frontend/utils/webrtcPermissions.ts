import { Platform, PermissionsAndroid } from 'react-native';

export const checkCallPermissions = async (isVideo: boolean = false) => {
  if (Platform.OS === 'ios') {
    return true; 
  }

  if (Platform.OS === 'android') {
    try {
      // 1. Start with basic permissions
      const permissions = [
        PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
      ];

      if (Platform.Version >= 31) {
        permissions.push(PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT);
      }

      if (isVideo) {
        permissions.push(PermissionsAndroid.PERMISSIONS.CAMERA);
      }

      // Android 13+ Notification Permission
      if (Platform.Version >= 33) {
        permissions.push(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
      }
      
      if (Platform.Version >= 34) {
         permissions.push(PermissionsAndroid.PERMISSIONS.READ_PHONE_NUMBERS);
      }

      const granted = await PermissionsAndroid.requestMultiple(permissions);

      const allGranted = Object.values(granted).every(
        (status) => status === PermissionsAndroid.RESULTS.GRANTED
      );

      if (!allGranted) {
        console.warn('One or more permissions rejected', granted);
      }

      return allGranted;
    } catch (err) {
      console.warn(err);
      return false;
    }
  }
  return false;
};