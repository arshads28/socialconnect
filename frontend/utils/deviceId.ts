// deviceId.ts
import 'react-native-get-random-values';
import * as SecureStore from 'expo-secure-store';
import * as Application from 'expo-application';
import { Platform } from 'react-native';
import { v4 as uuidv4 } from 'uuid';

let cachedDeviceId: string | null = null;

export const getDeviceId = async (): Promise<string> => {
  if (cachedDeviceId) return cachedDeviceId;

  let id = await SecureStore.getItemAsync('secure_device_id');

  if (!id) {
    id = uuidv4();
    await SecureStore.setItemAsync('secure_device_id', id);
  }

  cachedDeviceId = id;
  return id;
};

export const getHardwareId = async (): Promise<string> => {
  if (Platform.OS === 'android') {
    const androidId = await Application.getAndroidId();
    if (!androidId) {
      throw new Error('Android ID unavailable');
    }
    return androidId;
  }

  if (Platform.OS === 'ios') {
    const iosId = await Application.getIosIdForVendorAsync();
    if (!iosId) {
      throw new Error('iOS IDFV unavailable');
    }
    return iosId;
  }

  throw new Error('Unsupported platform');
};
