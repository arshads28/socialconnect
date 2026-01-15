import * as Notifications from 'expo-notifications';
import { useEffect } from 'react';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View, ActivityIndicator } from 'react-native';

import { AuthProvider, useAuth } from '../context/AuthContext';
import { WebSocketProvider } from '../contexts/WebSocketContext';
import { useColorScheme } from '@/hooks/use-color-scheme';

function RootLayoutNav() {
  const colorScheme = useColorScheme();
  const { isLoading } = useAuth(); // <--- Now uses the improved AuthContext
  const router = useRouter();

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
        <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
        {/* Chat screen is auto-detected */}
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