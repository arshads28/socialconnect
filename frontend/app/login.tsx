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
import { useTheme } from '../context/ThemeContext';
import { Colors } from '../constants/Colors';

export default function LoginScreen() {
  const { signIn } = useAuth();
  const router = useRouter();
  const { isDark } = useTheme();
  const colors = isDark ? Colors.dark : Colors.light;

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
          await sendPushTokenToBackend(pushToken);
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
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView 
        behavior={Platform.OS === "ios" ? "padding" : "height"} 
        style={styles.container}
      >
        <View style={styles.formContainer}>
          <Text style={[styles.title, { color: colors.text }]}>Connect</Text>
          <Text style={[styles.subtitle, { color: colors.subText }]}>Welcome back, please log in.</Text>
          
          <TextInput 
            style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.text }]} 
            placeholder="Username" 
            placeholderTextColor={colors.subText}
            value={username} 
            onChangeText={setUsername} 
            autoCapitalize="none" 
            autoCorrect={false}
          />
          
          <TextInput 
            style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.text }]} 
            placeholder="Password" 
            placeholderTextColor={colors.subText}
            value={password} 
            onChangeText={setPassword} 
            secureTextEntry 
          />

          <TouchableOpacity style={[styles.button, { backgroundColor: colors.tint }]} onPress={handleLogin} disabled={loading}>
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>Log In</Text>
            )}
          </TouchableOpacity>

          <View style={styles.footer}>
            <Text style={[styles.footerText, { color: colors.subText }]}>Don't have an account? </Text>
            <TouchableOpacity onPress={() => router.push('/signup')}>
              <Text style={{ color: colors.tint, fontWeight: 'bold' }}>Sign Up</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  container: { flex: 1, justifyContent: 'center', padding: 20 },
  formContainer: { width: '100%', maxWidth: 400, alignSelf: 'center' },
  title: { fontSize: 32, fontWeight: '800', textAlign: 'center', marginBottom: 10 },
  subtitle: { fontSize: 16, textAlign: 'center', marginBottom: 40 },
  input: { borderWidth: 1, borderRadius: 8, padding: 16, fontSize: 16, marginBottom: 15 },
  button: { paddingVertical: 16, borderRadius: 8, alignItems: 'center', marginTop: 10 },
  buttonText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  footer: { flexDirection: 'row', justifyContent: 'center', marginTop: 30 },
  footerText: {},
});