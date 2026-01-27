// deviceId.ts
import 'react-native-get-random-values';
import * as SecureStore from 'expo-secure-store';
import { v4 as uuidv4 } from 'uuid';

let cachedDeviceId: string | null = null;

export const getDeviceId = async (): Promise<string> => {
  if (cachedDeviceId) {
    return cachedDeviceId;
  }

  let id = await SecureStore.getItemAsync('secure_device_id');

  if (!id) {
    id = uuidv4();
    await SecureStore.setItemAsync('secure_device_id', id);
  }

  cachedDeviceId = id;
  return id;
};
