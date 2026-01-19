import 'react-native-get-random-values';
import * as SecureStore from 'expo-secure-store';
import { v4 as uuidv4 } from 'uuid';

export const getDeviceId = async () => {
  // Native (iOS/Android) Persistence
  let id = await SecureStore.getItemAsync('secure_device_id');
  if (!id) {
    id = uuidv4();
    await SecureStore.setItemAsync('secure_device_id', id);
  }
  return id;
};