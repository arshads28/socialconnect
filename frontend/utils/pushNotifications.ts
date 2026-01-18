import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import api from './api'; 
import { getDeviceId } from './deviceId'; 

// 1. CONFIG: Handler Settings
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true, 
    shouldShowList: true,
  }),
});

// 2. Main Registration Function
export async function registerForPushNotificationsAsync() {
  if (Platform.OS === 'web') {
    return;
  }

  // A. Android: Create High Priority Channel (Essential for Pop-up)
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Default',
      importance: Notifications.AndroidImportance.MAX, 
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#FF231F7C',
      sound: 'default',
      enableVibrate: true,
      enableLights: true,
      showBadge: true,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    });
  }

  // B. Get Permissions FIRST
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

    // C. Get Expo Push Token
    try {
      // Define projectId HERE, before using it
      const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.manifest?.extra?.eas?.projectId;
      
      const tokenData = await Notifications.getExpoPushTokenAsync({
        projectId: projectId, 
      });
      const newToken = tokenData.data;
      console.log("🔔 Expo Push Token Generated:", newToken);

      // ✅ OPTIMIZATION: Check if token is different from last time
      // This prevents spamming the backend if the token hasn't changed
      const storedToken = await AsyncStorage.getItem('lastPushToken');
      
      if (newToken !== storedToken) {
        console.log("🔔 New Push Token detected, syncing to backend...");
        await sendPushTokenToBackend(newToken);
        
        // Save the new token so we don't send it again next time
        await AsyncStorage.setItem('lastPushToken', newToken);
      } else {
        console.log("✅ Push Token unchanged, skipping sync.");
      }

      return newToken;

    } catch (e) {
      console.error("Error fetching Expo push token:", e);
    }
  } else {
    console.log('Must use physical device for Push Notifications');
  }
}

// 3. API Logic
async function sendPushTokenToBackend(pushToken: string) {
  try {
    const deviceId = await getDeviceId(); 

    // URL matches your Django 'urls.py'
    await api.post('auth/api/push/register/', { 
        token: pushToken, 
        platform: Platform.OS,
        device_id: deviceId,
        device_name: Device.modelName || 'Unknown Device'
    });
    console.log("✅ Push token registered with Backend!");

  } catch (error) {
    console.error('❌ Failed to register push token:', error);
  }
}