import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import 'react-native-get-random-values';
import { v4 as uuidv4 } from 'uuid';

export const getDeviceId = async () => {
  if (Platform.OS === 'web') {
    let id = localStorage.getItem('device_id');
    if (!id) {
      id = uuidv4();
      localStorage.setItem('device_id', id);
    }
    return id;
  }

  // Native (iOS/Android)
  // SecureStore persists even if the user updates the app
  let id = await SecureStore.getItemAsync('secure_device_id');
  if (!id) {
    id = uuidv4();
    await SecureStore.setItemAsync('secure_device_id', id);
  }
  return id;
};