import * as Notifications from 'expo-notifications';
import { useEffect } from 'react';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View, ActivityIndicator } from 'react-native';

import { AuthProvider, useAuth } from '../context/AuthContext';
import { WebSocketProvider } from '../contexts/WebSocketContext';
import { useColorScheme } from '@/hooks/use-color-scheme';
import NetInfo from '@react-native-community/netinfo';
import { registerBackgroundFetchAsync } from '../utils/backgroundTasks';
import { processOfflineQueue } from '../utils/offlineQueue';

function RootLayoutNav() {
  const colorScheme = useColorScheme();
  const { isLoading } = useAuth(); 
  const router = useRouter();

  // When internet comes back, process the queue automatically
  useEffect(() => {
    // 1. Register Background Fetch (For when app is KILLED)
    registerBackgroundFetchAsync();

    // 2. NetInfo Listener (For when app is OPEN)
    const unsubscribe = NetInfo.addEventListener(state => {
      if (state.isConnected && state.isInternetReachable) {
        console.log(" Internet Restored (Foreground). Syncing...");
        processOfflineQueue();
      }
    });

    return () => unsubscribe();
  }, []);

  // Notification Listener (Deep Linking)
  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener(response => {
      const data = response.notification.request.content.data as any;
      if (data?.url) {
        console.log("🔔 Notification Tapped! Navigating to:", data.url);
        router.push(data.url);
      }
    });
    return () => subscription.remove();
  }, []);

  // SHOW LOADING SPINNER UNTIL WE KNOW IF USER IS LOGGED IN
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
        {/* Hide header for chat because the screen has its own custom header */}
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