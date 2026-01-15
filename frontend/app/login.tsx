import React, { useState } from 'react';
import { 
  View, Text, TextInput, TouchableOpacity, StyleSheet, 
  Alert, ActivityIndicator, KeyboardAvoidingView, Platform 
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import api from '../utils/api'; 
import { saveSecure } from '../utils/storage';
import { useAuth } from '../context/AuthContext'; 
// ✅ Import the push notification functions
import { registerForPushNotificationsAsync, sendPushTokenToBackend } from '../utils/pushNotifications';

export default function LoginScreen() {
  const { signIn } = useAuth();
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!username || !password) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }
    setLoading(true);

    try {
      // 1. Authenticate with Django
      const response = await api.post('/auth/api/login/', {
        username: username.trim(),
        password: password,
      });

      // 2. Save Refresh Token manually (if needed)
      if (response.data.refresh) {
        await saveSecure('refreshToken', response.data.refresh);
      }

      // 3. Update Global Auth State (Saves access token to storage)
      await signIn(response.data.access);

      // 4. ✅ Register for Push Notifications (Non-blocking)
      // We run this *after* signIn ensures the token is in storage.
      try {
      console.log("Login successful. Initializing push notifications...");
      const pushToken = await registerForPushNotificationsAsync();
      
      if (pushToken) {
        // We pass 'response.data.access' here so we don't have to wait for AsyncStorage
        await sendPushTokenToBackend(pushToken, response.data.access);
      }
    } catch (pushError) {
      console.warn("Push notification setup failed:", pushError);
    }

      // No router.replace needed; AuthContext handles the redirect automatically.

    } catch (error: any) {
      console.log("Login Error:", error);
      const msg = error.response?.data?.detail || 'Check your username/password or internet connection.';
      Alert.alert('Login Failed', msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView 
        behavior={Platform.OS === "ios" ? "padding" : "height"} 
        style={styles.container}
      >
        <View style={styles.formContainer}>
          <Text style={styles.title}>SocialConnect</Text>
          <Text style={styles.subtitle}>Welcome back, please log in.</Text>
          
          <TextInput 
            style={styles.input} 
            placeholder="Username" 
            placeholderTextColor="#888"
            value={username} 
            onChangeText={setUsername} 
            autoCapitalize="none" 
            autoCorrect={false}
          />
          
          <TextInput 
            style={styles.input} 
            placeholder="Password" 
            placeholderTextColor="#888"
            value={password} 
            onChangeText={setPassword} 
            secureTextEntry 
          />

          <TouchableOpacity style={styles.button} onPress={handleLogin} disabled={loading}>
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>Log In</Text>
            )}
          </TouchableOpacity>

          <View style={styles.footer}>
            <Text style={styles.footerText}>Don't have an account? </Text>
            <TouchableOpacity onPress={() => router.push('/signup')}>
              <Text style={{ color: '#0095f6', fontWeight: 'bold' }}>Sign Up</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#fff' },
  container: { flex: 1, justifyContent: 'center', padding: 20 },
  formContainer: { width: '100%', maxWidth: 400, alignSelf: 'center' },
  title: { fontSize: 32, fontWeight: '800', textAlign: 'center', color: '#000', marginBottom: 10 },
  subtitle: { fontSize: 16, color: '#666', textAlign: 'center', marginBottom: 40 },
  input: { 
    backgroundColor: '#fafafa', 
    borderWidth: 1, 
    borderColor: '#dbdbdb', 
    borderRadius: 8, 
    padding: 16, 
    fontSize: 16,
    marginBottom: 15 
  },
  button: { 
    backgroundColor: '#0095f6', 
    paddingVertical: 16, 
    borderRadius: 8, 
    alignItems: 'center', 
    marginTop: 10,
  },
  buttonText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  footer: { flexDirection: 'row', justifyContent: 'center', marginTop: 30 },
  footerText: { color: '#888' },
});