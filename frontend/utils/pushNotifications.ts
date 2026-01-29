import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import api from './api'; 
import { getDeviceId, getHardwareId } from './deviceId';
import AsyncStorage from '@react-native-async-storage/async-storage';

// 1. CONFIG
Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    const data = notification.request.content.data;
    const collapseId = data?.collapse_key;

    if (collapseId) {
      const existing =
        await Notifications.getPresentedNotificationsAsync();

      for (const n of existing) {
        const existingCollapse =
          n.request.content.data?.collapse_key;

        if (existingCollapse === collapseId) {
          await Notifications.dismissNotificationAsync(
            n.request.identifier
          );
        }
      }
    }

    return {
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
      shouldShowBanner: true,
      shouldShowList: true,
    };
  },
});

// 🔒 LOCK
let isRegistering = false;

// 2. REGISTER
export async function registerForPushNotificationsAsync() {
  if (isRegistering) {
      console.log("⚠️ Push registration already in progress. Skipping.");
      return;
  }
  isRegistering = true;

  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('social_alerts', {
        name: 'Social Alerts',
        importance: Notifications.AndroidImportance.MAX, 
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#FF231F7C',
        sound: 'default',
        enableVibrate: true,
        showBadge: true,
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      });
    }

    if (Device.isDevice) {
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;
      
      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }
      
      if (finalStatus !== 'granted') {
        console.log('Permission not granted for push notifications!');
        return;
      }

      try {
        const projectId = 
          Constants.expoConfig?.extra?.eas?.projectId || 
          // @ts-ignore: Fallback for older SDKs
          Constants.manifest?.extra?.eas?.projectId;
        
        const tokenData = await Notifications.getExpoPushTokenAsync({
          projectId: projectId, 
        });
        const newToken = tokenData.data;
        
        const storedToken = await AsyncStorage.getItem('lastPushToken');
        
        // if (newToken !== storedToken) {
        //   console.log(" New Push Token detected, syncing...");
        //   await sendPushTokenToBackend(newToken);
        //   await AsyncStorage.setItem('lastPushToken', newToken);
        // } else {
        //   console.log(" Push Token up to date.");
        // }

        return newToken;

      } catch (e) {
        console.error("Error fetching Expo push token:", e);
      }
    } else {
      console.log('Must use physical device for Push Notifications');
    }
  } finally {
    isRegistering = false;
  }
}

// 3. API CALL
export async function sendPushTokenToBackend(pushToken: string) {
  try {
    const deviceId = await getDeviceId();
    const hardware_id = await getHardwareId();


    await api.post('/auth/api/push/register/', { 
      token: pushToken, 
      platform: Platform.OS,
      device_id: deviceId,
      hardware_id,
      device_name: Device.modelName || 'Unknown Device'
    });

    console.log("✅ Push token registered with Backend!");
  } catch (error) {
    console.error('❌ Failed to register push token:', error);
  }
}

export async function deactivatePushToken() {
  try {
    const hardware_id = await getHardwareId();

    await api.post('/auth/api/push/logout/', {
      platform: Platform.OS,
      hardware_id,
    });

    console.log("✅ Push notifications deactivated for this device.");
  } catch (error) {
    // We log the error but don't stop execution, 
    // because we still want the user to be able to logout locally.
    console.warn('❌ Failed to deactivate push token:', error);
  }
}