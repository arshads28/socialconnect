import * as Notifications from 'expo-notifications';
import { useEffect } from 'react';
import { DarkTheme, DefaultTheme, ThemeProvider as NavThemeProvider } from '@react-navigation/native';
import { Stack, useRouter } from 'expo-router';
import { View, ActivityIndicator, StatusBar } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage'; 

import { AuthProvider, useAuth } from '../context/AuthContext';
import { ThemeProvider, useTheme } from '../context/ThemeContext'; 
import { Colors } from '../constants/Colors'; 
import { WebSocketProvider } from '../contexts/WebSocketContext';
import NetInfo from '@react-native-community/netinfo';
import { registerBackgroundFetchAsync } from '../utils/backgroundTasks';
import { processOfflineQueue } from '../utils/offlineQueue';
import { syncPendingMessages, resendStuckMessages } from '../utils/sync'; 
import { purgeOldMessages } from '../utils/db'; 
import { WebRTCProvider } from '../contexts/WebRTCContext';
import { CallOverlay } from '../contexts/CallComponent';
import Toast from 'react-native-toast-message';
import { cleanupStaleNotifications, clearAllNotifications } from '../utils/pushNotifications';

const RETENTION_KEY = 'connect_retention_days';

function RootLayoutNav() {
  const { isDark } = useTheme(); 
  const { isLoading, userToken } = useAuth(); 
  const router = useRouter();

  const themeColors = isDark ? Colors.dark : Colors.light;

  // 1. Auto-Purge on App Launch
  useEffect(() => {
    const runAutoCleanup = async () => {
      try {
        const stored = await AsyncStorage.getItem(RETENTION_KEY);
        const days = stored ? parseInt(stored, 10) : 90;
        
        console.log(`🧹 Running auto-cleanup for messages older than ${days} days...`);
        purgeOldMessages(days);
      } catch (e) {
        console.log("Cleanup check failed", e);
      }
    };

    runAutoCleanup();
  }, []);

  // 2. Global Sync Logic (Foreground)
  useEffect(() => {
    if (!userToken) return;
    registerBackgroundFetchAsync();
    
    let timeout: NodeJS.Timeout;
    const unsubscribe = NetInfo.addEventListener(state => {
      if (state.isConnected && state.isInternetReachable) {
        clearTimeout(timeout);
        timeout = setTimeout(() => {
            console.log("📶 Connection restored. Running global sync...");
            
            processOfflineQueue();
            syncPendingMessages();
            resendStuckMessages(); 
        }, 2000); 
      }
    });
    return () => { unsubscribe(); clearTimeout(timeout); };
  }, [userToken]);

  // 3. Notifications (Native Only)
  useEffect(() => {
    if (userToken) {
      clearAllNotifications();
    }
    
    const receivedSubscription = Notifications.addNotificationReceivedListener(notification => {
      const data = notification.request.content.data;
      const sender = data?.sender || data?.tag || notification.request.content.title;
      
      if (sender) {
        Notifications.getPresentedNotificationsAsync().then(existing => {
          existing.forEach(n => {
            const existingKey = n.request.content.data?.sender || n.request.content.data?.tag || n.request.content.title;
            if (existingKey === sender && n.request.identifier !== notification.request.identifier) {
              Notifications.dismissNotificationAsync(n.request.identifier);
            }
          });
        });
      }
    });
    
    Notifications.getLastNotificationResponseAsync().then(response => {
      const data = response?.notification.request.content.data as any;
      if (data?.url && typeof data.url === 'string') setTimeout(() => router.push(data.url), 500); 
    });
    const subscription = Notifications.addNotificationResponseReceivedListener(response => {
      const data = response.notification.request.content.data as any;
      if (data?.url && typeof data.url === 'string') router.push(data.url);
    });
    return () => {
      receivedSubscription.remove();
      subscription.remove();
    };
  }, [userToken]);

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: themeColors.background }}>
        <ActivityIndicator size="large" color="#0095f6" />
      </View>
    );
  }
  return (
    <NavThemeProvider value={isDark ? DarkTheme : DefaultTheme}>
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="login" options={{ headerShown: false }} />
        <Stack.Screen name="signup" options={{ headerShown: false }} />
        <Stack.Screen name="chat/[username]" options={{ headerShown: false }} /> 
        <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
        <Stack.Screen name="settings/main" options={{ headerShown: false }} />
        <Stack.Screen name="settings/call" options={{ headerShown: true, title: 'Call Settings' }} />
        <Stack.Screen name="settings/blocked" options={{ headerShown: true, title: 'Blocked Users' }} />
      </Stack>
      
      <StatusBar 
        barStyle={isDark ? "light-content" : "dark-content"} 
        translucent={false} 
        backgroundColor={themeColors.background} 
      />

      <CallOverlay /> 
      <Toast />
    </NavThemeProvider>
  );
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <ThemeProvider> 
        <WebSocketProvider>
           <WebRTCProvider>
              <RootLayoutNav />
           </WebRTCProvider>
        </WebSocketProvider>
      </ThemeProvider>
    </AuthProvider>
  );
}