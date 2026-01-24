import React, { useState } from 'react';
import { 
  View, Text, TextInput, TouchableOpacity, StyleSheet, 
  ActivityIndicator, KeyboardAvoidingView, Platform, Keyboard, TouchableWithoutFeedback 
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, Link } from 'expo-router';
import api, { setClientToken } from '../utils/api'; 
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { Colors } from '../constants/Colors';

export default function SignupScreen() {
  const { signIn } = useAuth();
  const { isDark } = useTheme();
  const colors = isDark ? Colors.dark : Colors.light;
  
  // Form State
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState(''); // NEW STATE
  const [loading, setLoading] = useState(false);

  // Error State (Instagram style inline errors)
  const [errors, setErrors] = useState({
    username: '',
    email: '',
    password: '',
    confirmPassword: '', // NEW ERROR STATE
    general: ''
  });

  const validate = () => {
    let valid = true;
    let newErrors = { username: '', email: '', password: '', confirmPassword: '', general: '' };

    // Username Validation
    if (!username) {
      newErrors.username = 'Username is required.';
      valid = false;
    } else if (username.length < 4) {
      newErrors.username = 'Username must be at least 4 characters.';
      valid = false;
    } else if (!/^[\w.]+$/.test(username)) {
      newErrors.username = 'Username can only contain letters, numbers, periods, and underscores.';
      valid = false;
    }

    // Email Validation
    if (!email) {
      newErrors.email = 'Email is required.';
      valid = false;
    } else if (!/\S+@\S+\.\S+/.test(email)) {
      newErrors.email = 'Please enter a valid email address.';
      valid = false;
    }

    // Password Validation
    if (!password) {
      newErrors.password = 'Password is required.';
      valid = false;
    } else if (password.length < 6) {
      newErrors.password = 'Password must be at least 6 characters.';
      valid = false;
    }

    // Confirm Password Validation (NEW)
    if (!confirmPassword) {
      newErrors.confirmPassword = 'Please confirm your password.';
      valid = false;
    } else if (password !== confirmPassword) {
      newErrors.confirmPassword = 'Passwords do not match.';
      valid = false;
    }

    setErrors(newErrors);
    return valid;
  };

  const handleSignup = async () => {
    Keyboard.dismiss();
    if (!validate()) return; // Stop here if passwords don't match or other validations fail

    setLoading(true);
    setErrors(prev => ({ ...prev, general: '' })); // Clear global errors

    try {
      // 1. Register User
      const response = await api.post('/auth/signup/', {
        username: username.toLowerCase().trim(),
        email: email.trim(),
        password: password,
      });

      // 2. Extract Tokens
      const { access, refresh } = response.data.tokens;
      
      // 3. Set API Token
      setClientToken(access);

      // 4. Get User Profile
      const userResponse = await api.get('/auth/api/profile/me/');

      // 5. Global Sign In
      await signIn(access, refresh, userResponse.data);

    } catch (error: any) {
      console.log("Signup Error:", error.response?.data);
      
      let newErrors = { username: '', email: '', password: '', confirmPassword: '', general: '' };
      
      if (error.response?.data) {
        const data = error.response.data;
        
        // Map backend errors to specific fields
        if (data.username) newErrors.username = data.username[0];
        if (data.email) newErrors.email = data.email[0];
        if (data.password) newErrors.password = data.password[0];
        
        // Fallback for generic errors
        if (!data.username && !data.email && !data.password) {
          newErrors.general = data.detail || "Something went wrong. Please try again.";
        }
      } else {
        newErrors.general = "Network error. Please check your connection.";
      }
      setErrors(newErrors);
    } finally {
      setLoading(false);
    }
  };

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
      <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
        <KeyboardAvoidingView 
          behavior={Platform.OS === "ios" ? "padding" : "height"} 
          style={styles.container}
        >
          <View style={styles.formContainer}>
            
            {/* Header */}
            <Text style={[styles.title, { color: colors.text }]}>Connect</Text>
            <Text style={[styles.subtitle, { color: colors.subText }]}>Sign up to see photos and videos from your friends.</Text>

            {/* General Error Banner */}
            {errors.general ? (
              <View style={[styles.errorBanner, { backgroundColor: isDark ? '#3b0a0a' : '#ffebee' }]}>
                <Text style={styles.errorBannerText}>{errors.general}</Text>
              </View>
            ) : null}
            
            {/* Username Input */}
            <View style={styles.inputWrapper}>
              <TextInput 
                style={[styles.input, { backgroundColor: colors.card, borderColor: errors.username ? colors.danger : colors.border, color: colors.text }]} 
                placeholder="Username" 
                placeholderTextColor={colors.subText}
                value={username} 
                onChangeText={(text) => {
                  setUsername(text);
                  if (errors.username) setErrors(prev => ({...prev, username: ''}));
                }} 
                autoCapitalize="none" 
                autoCorrect={false}
              />
              {errors.username ? <Text style={[styles.errorText, { color: colors.danger }]}>{errors.username}</Text> : null}
            </View>

            {/* Email Input */}
            <View style={styles.inputWrapper}>
              <TextInput 
                style={[styles.input, { backgroundColor: colors.card, borderColor: errors.email ? colors.danger : colors.border, color: colors.text }]} 
                placeholder="Email" 
                placeholderTextColor={colors.subText}
                value={email} 
                onChangeText={(text) => {
                  setEmail(text);
                  if (errors.email) setErrors(prev => ({...prev, email: ''}));
                }} 
                autoCapitalize="none" 
                keyboardType="email-address"
              />
              {errors.email ? <Text style={[styles.errorText, { color: colors.danger }]}>{errors.email}</Text> : null}
            </View>
            
            {/* Password Input */}
            <View style={styles.inputWrapper}>
              <TextInput 
                style={[styles.input, { backgroundColor: colors.card, borderColor: errors.password ? colors.danger : colors.border, color: colors.text }]} 
                placeholder="Password" 
                placeholderTextColor={colors.subText}
                value={password} 
                onChangeText={(text) => {
                  setPassword(text);
                  if (errors.password) setErrors(prev => ({...prev, password: ''}));
                }} 
                secureTextEntry 
              />
              {errors.password ? <Text style={[styles.errorText, { color: colors.danger }]}>{errors.password}</Text> : null}
            </View>

            {/* Confirm Password Input (NEW) */}
            <View style={styles.inputWrapper}>
              <TextInput 
                style={[styles.input, { backgroundColor: colors.card, borderColor: errors.confirmPassword ? colors.danger : colors.border, color: colors.text }]} 
                placeholder="Confirm Password" 
                placeholderTextColor={colors.subText}
                value={confirmPassword} 
                onChangeText={(text) => {
                  setConfirmPassword(text);
                  if (errors.confirmPassword) setErrors(prev => ({...prev, confirmPassword: ''}));
                }} 
                secureTextEntry 
              />
              {errors.confirmPassword ? <Text style={[styles.errorText, { color: colors.danger }]}>{errors.confirmPassword}</Text> : null}
            </View>

            {/* Submit Button */}
            <TouchableOpacity 
              style={[
                styles.button, 
                { backgroundColor: colors.tint },
                (!username || !email || !password || !confirmPassword) && { opacity: 0.5 } // Faded when disabled
              ]} 
              onPress={handleSignup} 
              disabled={loading || !username || !email || !password || !confirmPassword}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.buttonText}>Sign Up</Text>
              )}
            </TouchableOpacity>

            {/* Terms */}
            <Text style={[styles.termsText, { color: colors.subText }]}>
              By signing up, you agree to our Terms, Privacy Policy and Cookies Policy.
            </Text>

            {/* Footer */}
            <View style={[styles.footer, { borderTopColor: colors.border }]}>
              <Text style={[styles.footerText, { color: colors.text }]}>Have an account? </Text>
              <Link href="/login" asChild>
                  <TouchableOpacity>
                    <Text style={[styles.linkText, { color: colors.tint }]}>Log in</Text>
                  </TouchableOpacity>
              </Link>
            </View>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </TouchableWithoutFeedback>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  container: { flex: 1, justifyContent: 'center', paddingHorizontal: 30 },
  formContainer: { width: '100%', alignSelf: 'center', maxWidth: 400 },
  title: { 
    fontFamily: Platform.OS === 'ios' ? 'Avenir-Heavy' : 'Roboto', 
    fontSize: 36, textAlign: 'center', marginBottom: 10 
  },
  subtitle: { fontSize: 15, textAlign: 'center', marginBottom: 30, lineHeight: 20 },
  
  // Input Styles
  inputWrapper: { marginBottom: 12 },
  input: { 
    borderWidth: 1, 
    borderRadius: 5, 
    paddingHorizontal: 15, 
    paddingVertical: 12, 
    fontSize: 14 
  },
  errorText: { fontSize: 12, marginTop: 5, marginLeft: 2 },
  errorBanner: {
    padding: 10, borderRadius: 5, marginBottom: 15, borderWidth: 1, borderColor: '#ed4956'
  },
  errorBannerText: { color: '#ed4956', textAlign: 'center', fontSize: 13 },

  // Button Styles
  button: { paddingVertical: 14, borderRadius: 5, alignItems: 'center', marginTop: 10 },
  buttonText: { color: '#fff', fontWeight: '600', fontSize: 14 },

  // Footer & Terms
  termsText: { fontSize: 12, textAlign: 'center', marginTop: 20, marginBottom: 20, lineHeight: 16 },
  footer: { flexDirection: 'row', justifyContent: 'center', borderTopWidth: 1, paddingTop: 20, marginTop: 10 },
  footerText: { fontSize: 14 },
  linkText: { fontWeight: '600', fontSize: 14 }
});