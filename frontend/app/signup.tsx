import React, { useState } from 'react';
import { 
  View, Text, TextInput, TouchableOpacity, StyleSheet, 
  Alert, ActivityIndicator, KeyboardAvoidingView, Platform 
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, Link } from 'expo-router';
import api, { setClientToken } from '../utils/api'; 
import { useAuth } from '../context/AuthContext';

export default function SignupScreen() {
  const { signIn } = useAuth();
  const router = useRouter();

  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSignup = async () => {
    if (!username || !email || !password) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }

    setLoading(true);

    try {
      // 1. Register
      await api.post('/auth/api/register/', {
        username: username.trim(),
        email: email.trim(),
        password: password,
      });

      // 2. Auto Login (Get Tokens)
      const loginResponse = await api.post('/auth/api/login/', {
        username: username.trim(),
        password: password,
      });

      const { access, refresh } = loginResponse.data;

      // 3. ✅ Update API Memory Immediately
      setClientToken(access);

      // 4. Fetch User Details
      const userResponse = await api.get('/auth/api/profile/me');

      // 5. Update Context
      await signIn(access, refresh, userResponse.data);
      
      // Note: We don't necessarily need to trigger push notifications here 
      // because the user will likely configure that on the next screen or Dashboard.
      
    } catch (error: any) {
      console.log("Signup Error:", error.response?.data || error);
      
      let msg = "Could not create account.";
      if (error.response?.data) {
        const data = error.response.data;
        if (data.username) msg = `Username: ${data.username[0]}`;
        else if (data.email) msg = `Email: ${data.email[0]}`;
        else if (data.password) msg = `Password: ${data.password[0]}`;
        else if (data.detail) msg = data.detail;
      }
      
      Alert.alert('Registration Failed', msg);
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
          <Text style={styles.subtitle}>Sign up to see photos and videos from your friends.</Text>
          
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
            placeholder="Email" 
            placeholderTextColor="#888"
            value={email} 
            onChangeText={setEmail} 
            autoCapitalize="none" 
            keyboardType="email-address"
          />
          
          <TextInput 
            style={styles.input} 
            placeholder="Password" 
            placeholderTextColor="#888"
            value={password} 
            onChangeText={setPassword} 
            secureTextEntry 
          />

          <TouchableOpacity style={styles.button} onPress={handleSignup} disabled={loading}>
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>Sign Up</Text>
            )}
          </TouchableOpacity>

          <View style={styles.footer}>
            <Text style={styles.footerText}>Have an account? </Text>
            <Link href="/login" asChild>
                <TouchableOpacity>
                  <Text style={styles.linkText}>Log in</Text>
                </TouchableOpacity>
            </Link>
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
  subtitle: { fontSize: 16, color: '#666', textAlign: 'center', marginBottom: 40, paddingHorizontal: 20 },
  input: { backgroundColor: '#fafafa', borderWidth: 1, borderColor: '#dbdbdb', borderRadius: 8, padding: 16, fontSize: 16, marginBottom: 15 },
  button: { backgroundColor: '#0095f6', paddingVertical: 16, borderRadius: 8, alignItems: 'center', marginTop: 10 },
  buttonText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  footer: { flexDirection: 'row', justifyContent: 'center', marginTop: 30 },
  footerText: { color: '#888' },
  linkText: { color: '#0095f6', fontWeight: 'bold' }
});