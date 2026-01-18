import React, { useState } from 'react';
import { 
  View, Text, TextInput, TouchableOpacity, StyleSheet, 
  Alert, ActivityIndicator, KeyboardAvoidingView, Platform 
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import api, { setClientToken } from '../utils/api'; 
import { useAuth } from '../context/AuthContext'; 
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
      // 1. Authenticate (Get Tokens)
      const response = await api.post('/auth/api/login/', {
        username: username.trim(),
        password: password,
      });

      const { access, refresh } = response.data;

      // 2. Update API Memory Immediately
      // This ensures the NEXT request (get /me) has the Authorization header
      setClientToken(access);

      // 3. Fetch User Details
      const userResponse = await api.get('/auth/api/profile/me');

      // 4. Update Context
      await signIn(access, refresh, userResponse.data);

      // 5. Setup Push Notifications (Non-blocking)
      try {
        console.log("Initializing push notifications...");
        const pushToken = await registerForPushNotificationsAsync();
        if (pushToken) {
          // Send to backend (Token is already in headers thanks to setClientToken)
          await sendPushTokenToBackend(pushToken, access);
        }
      } catch (pushError) {
        console.warn("Push notification setup failed:", pushError);
      }

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
          <Text style={styles.title}>Connect</Text>
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
  input: { backgroundColor: '#fafafa', borderWidth: 1, borderColor: '#dbdbdb', borderRadius: 8, padding: 16, fontSize: 16, marginBottom: 15 },
  button: { backgroundColor: '#0095f6', paddingVertical: 16, borderRadius: 8, alignItems: 'center', marginTop: 10 },
  buttonText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  footer: { flexDirection: 'row', justifyContent: 'center', marginTop: 30 },
  footerText: { color: '#888' },
});