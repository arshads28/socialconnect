import React, { useState } from 'react';
import { 
  View, Text, TextInput, TouchableOpacity, StyleSheet, 
  Alert, ActivityIndicator, KeyboardAvoidingView, Platform 
} from 'react-native';
import axios from 'axios';
import { saveSecure } from '../utils/storage';
import { useRouter } from 'expo-router';

// ⚠️ REPLACE THIS with your actual Django URL
// Android Emulator: 'http://10.0.2.2:8000/auth/api/login/'
// Physical Device: 'http://192.168.x.x:8000/auth/api/login/'
const API_URL = 'http://localhost:8000/auth/api/login/';

export default function LoginScreen() {
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
      const response = await axios.post(API_URL, {
        username: username,
        password: password,
      });

      const { access, refresh } = response.data;

      // Save token securely
      await saveSecure('accessToken', access);
      await saveSecure('refreshToken', refresh)

      // Navigate to the Tabs (Home Screen)
      router.replace('/(tabs)'); 

    } catch (error: any) {
      console.log(error);
      Alert.alert('Login Failed', 'Check your username/password or internet connection.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.container}>
      <View style={styles.formContainer}>
        <Text style={styles.title}>SocialConnect</Text>
        
        <TextInput 
          style={styles.input} 
          placeholder="Username" 
          placeholderTextColor="#888"
          value={username} onChangeText={setUsername} autoCapitalize="none" 
        />
        
        <TextInput 
          style={styles.input} 
          placeholder="Password" 
          placeholderTextColor="#888"
          value={password} onChangeText={setPassword} secureTextEntry 
        />

        <TouchableOpacity style={styles.button} onPress={handleLogin} disabled={loading}>
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Log In</Text>}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', justifyContent: 'center', padding: 20 },
  formContainer: { width: '100%', maxWidth: 400, alignSelf: 'center' },
  title: { fontSize: 32, fontWeight: 'bold', textAlign: 'center', marginBottom: 40, color: '#000' },
  input: { backgroundColor: '#fafafa', borderWidth: 1, borderColor: '#dbdbdb', borderRadius: 5, padding: 12, marginBottom: 15 },
  button: { backgroundColor: '#0095f6', padding: 15, borderRadius: 5, alignItems: 'center', marginTop: 10 },
  buttonText: { color: '#fff', fontWeight: 'bold' }
});