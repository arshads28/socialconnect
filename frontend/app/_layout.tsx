import * as Notifications from 'expo-notifications';
import { useEffect } from 'react';
import { DarkTheme, DefaultTheme, ThemeProvider as NavThemeProvider } from '@react-navigation/native';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View, ActivityIndicator, Platform } from 'react-native';

import { AuthProvider, useAuth } from '../context/AuthContext';
import { ThemeProvider, useTheme } from '../context/ThemeContext';
import { Colors } from '../constants/Colors'; 
import { WebSocketProvider } from '../contexts/WebSocketContext';
import NetInfo from '@react-native-community/netinfo';
import { registerBackgroundFetchAsync } from '../utils/backgroundTasks';
import { processOfflineQueue } from '../utils/offlineQueue';
import { syncPendingMessages } from '../utils/sync';
import { WebRTCProvider } from '../contexts/WebRTCContext';
import { CallOverlay } from '../contexts/CallComponent';
import Toast from 'react-native-toast-message';

function RootLayoutNav() {
  const { isDark } = useTheme();
  const { isLoading, userToken } = useAuth(); 
  const router = useRouter();

  const themeColors = isDark ? Colors.dark : Colors.light;

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
        }, 2000); 
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
      </Stack>
      <StatusBar style={isDark ? "light" : "dark"} />
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