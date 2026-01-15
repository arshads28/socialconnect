import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import api from './api'; // Ensure this points to your axios instance
import AsyncStorage from '@react-native-async-storage/async-storage';

// 1. Fix for the "Missing properties" TypeScript error
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true, // Added to fix type error
    shouldShowList: true,   // Added to fix type error
  }),
});

export async function registerForPushNotificationsAsync() {
  let token;

  // Android: Set up the notification channel
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#FF231F7C',
    });
  }

  if (Device.isDevice) {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    
    // If permissions not granted, ask for them
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    
    if (finalStatus !== 'granted') {
      console.log('Permission not granted for push notifications!');
      return;
    }

    // Get the Expo Push Token
    // We add a try/catch block to handle issues with Project ID or Network
    try {
      const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.manifest?.extra?.eas?.projectId;
      
      if (!projectId) {
        console.error("Project ID not found in app.json. Ensure 'eas.projectId' is set.");
      }

      token = (await Notifications.getExpoPushTokenAsync({
        projectId: projectId, 
      })).data;
      
      console.log("Expo Push Token Generated:", token);
      
    } catch (e) {
      console.error("Error fetching Expo push token:", e);
    }
  } else {
    console.log('Must use physical device for Push Notifications');
  }

  return token;
}

// 2. Fix for the "401 Unauthorized" error
export async function sendPushTokenToBackend(pushToken: string, manualAuthToken?: string) {
  try {
    // 1. Allow userToken to be string, undefined, OR null
    let userToken: string | null | undefined = manualAuthToken;
    
    // 2. If no manual token, try reading from storage
    if (!userToken) {
      userToken = await AsyncStorage.getItem('userToken');
    }

    // 3. If it is still null or undefined (empty), stop here
    if (!userToken) {
      console.warn("User not logged in. Cannot send push token to backend.");
      return;
    }

    const platform = Platform.OS === 'ios' ? 'ios' : Platform.OS === 'android' ? 'android' : 'web';
    
    await api.post('/auth/api/push-token/', 
      { 
        token: pushToken, 
        platform,
        device_name: Device.deviceName || 'Unknown Device'
      },
      {
        headers: {
          Authorization: `Bearer ${userToken}`, 
        }
      }
    );
    console.log("Push token sent successfully!");

  } catch (error) {
    console.error('Failed to send push token to backend:', error);
  }
}
