import * as Notifications from 'expo-notifications';
import { useEffect } from 'react';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, useRouter } from 'expo-router'; // <--- Added useRouter
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';
import { View, ActivityIndicator } from 'react-native';

import { AuthProvider, useAuth } from '../context/AuthContext';
import { WebSocketProvider } from '../contexts/WebSocketContext';
import { useColorScheme } from '@/hooks/use-color-scheme';

// 1. Create a separate component that uses the Auth Hook
function RootLayoutNav() {
  const colorScheme = useColorScheme();
  const { isLoading } = useAuth(); 
  const router = useRouter(); 

  
  useEffect(() => {
    // This listener fires whenever a user TAPS a notification
    const subscription = Notifications.addNotificationResponseReceivedListener(response => {
      const data = response.notification.request.content.data as any;
      
      // Check if the backend sent a URL (e.g., "/chat/sam")
      if (data?.url) {
        console.log("🔔 Notification Tapped! Navigating to:", data.url);
        // We push the URL to navigate to the chat screen
        router.push(data.url as string);
      }
    });

    // Clean up the listener when the component unmounts
    return () => subscription.remove();
  }, []);

  // 2. Show a loading spinner while checking for token
  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff' }}>
        <ActivityIndicator size="large" color="#0095f6" />
      </View>
    );
  }

  // 3. Only render the Stack when loading is done
  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="login" options={{ headerShown: false }} />
        <Stack.Screen name="signup" options={{ headerShown: false }} />
        <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
        {/* Ensure you have a dynamic route for chat if not already implicitly defined */}
        {/* <Stack.Screen name="chat/[username]" /> is usually auto-detected by file structure */}
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