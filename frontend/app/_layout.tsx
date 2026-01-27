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
import api from '../utils/api';
import { generateIdentity } from '../utils/SignalManager';
import { WebRTCProvider } from '../contexts/WebRTCContext';
import { CallOverlay } from '../contexts/CallComponent';
import Toast from 'react-native-toast-message';

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
            console.log(" Connection restored. Running global sync...");
            
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
    Notifications.getLastNotificationResponseAsync().then(response => {
      const data = response?.notification.request.content.data as any;
      if (data?.url && typeof data.url === 'string') setTimeout(() => router.push(data.url), 500); 
    });
    const subscription = Notifications.addNotificationResponseReceivedListener(response => {
      const data = response.notification.request.content.data as any;
      if (data?.url && typeof data.url === 'string') router.push(data.url);
    });
    return () => subscription.remove();
  }, []);

  // 4. Initialize E2EE Identity
  useEffect(() => {
    if (!userToken) return;

    const setupEncryption = async () => {
      try {
        const bundle = await generateIdentity();
        
        if (bundle) {
          console.log("🚀 Uploading Public Keys to Server...");
          
          try {
              await api.post('/chat/e2ee/keys/', bundle);
              console.log("Keys uploaded successfully!");
          } catch (uploadError) {
              console.error("❌ Key Upload Failed. You will not be able to receive messages.", uploadError);
              // TODO: Implement a retry mechanism or alert the user
          }
        } 
      } catch (e) {
        console.error("❌ E2EE Setup Failed:", e);
      }
    };
    
    setupEncryption();
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