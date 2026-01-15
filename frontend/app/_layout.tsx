import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';
import { View, ActivityIndicator } from 'react-native';

import { AuthProvider, useAuth } from '../context/AuthContext'; // Check this path!
import { useColorScheme } from '@/hooks/use-color-scheme';

// 1. Create a separate component that uses the Auth Hook
function RootLayoutNav() {
  const colorScheme = useColorScheme();
  const { isLoading } = useAuth(); // <--- Get loading state

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
      </Stack>
      <StatusBar style="auto" />
    </ThemeProvider>
  );
}

// 4. Wrap the whole thing in AuthProvider
export default function RootLayout() {
  return (
    <AuthProvider>
      <RootLayoutNav />
    </AuthProvider>
  );
}