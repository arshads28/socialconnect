import * as Notifications from 'expo-notifications';
import { useEffect } from 'react';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View, ActivityIndicator, Platform } from 'react-native';

import { AuthProvider, useAuth } from '../context/AuthContext';
import { WebSocketProvider } from '../contexts/WebSocketContext';
import { useColorScheme } from '@/hooks/use-color-scheme';
import NetInfo from '@react-native-community/netinfo';
import { registerBackgroundFetchAsync } from '../utils/backgroundTasks';
import { processOfflineQueue } from '../utils/offlineQueue';
import { syncPendingMessages } from '../utils/sync'; // Import this

function RootLayoutNav() {
  const colorScheme = useColorScheme();
  const { isLoading, userToken } = useAuth(); 
  const router = useRouter();

  // 1. NETWORK STATUS LISTENER
  useEffect(() => {
    if (!userToken) return;

    registerBackgroundFetchAsync();

    let timeout: NodeJS.Timeout;

    const unsubscribe = NetInfo.addEventListener(state => {
      if (state.isConnected && state.isInternetReachable) {
        clearTimeout(timeout);
        timeout = setTimeout(() => {
            console.log("🌐 Internet Stable. Triggering Sync...");
            processOfflineQueue();
            syncPendingMessages();
        }, 2000); // Wait 2 seconds for connection to stabilize
      }
    });

    return () => {
        unsubscribe();
        clearTimeout(timeout);
    };
  }, [userToken]);

  // 2. NOTIFICATION LISTENER
  useEffect(() => {
    if (Platform.OS === 'web') return;

    Notifications.getLastNotificationResponseAsync().then(response => {
      const data = response?.notification.request.content.data as any;
      if (data?.url && typeof data.url === 'string') {
        setTimeout(() => router.push(data.url), 500); 
      }
    });

    const subscription = Notifications.addNotificationResponseReceivedListener(response => {
      const data = response.notification.request.content.data as any;
      if (data?.url && typeof data.url === 'string') {
        router.push(data.url);
      }
    });

    return () => subscription.remove();
  }, []);

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff' }}>
        <ActivityIndicator size="large" color="#0095f6" />
      </View>
    );
  }

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="login" options={{ headerShown: false }} />
        <Stack.Screen name="signup" options={{ headerShown: false }} />
        <Stack.Screen name="chat/[username]" options={{ headerShown: false }} /> 
        <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
      </Stack>
      <StatusBar style="auto" />
    </ThemeProvider>
  );
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <WebSocketProvider>
        <RootLayoutNav />
      </WebSocketProvider>
    </AuthProvider>
  );
}