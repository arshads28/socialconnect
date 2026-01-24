import { View, Text, TextInput, TouchableOpacity, StyleSheet, Image, ScrollView, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useState, useEffect } from 'react';
import { Ionicons } from '@expo/vector-icons';
import api from '../../utils/api';
import * as ImagePicker from 'expo-image-picker';
import { useTheme } from '../../context/ThemeContext';
import { Colors } from '../../constants/Colors';

export default function EditProfileScreen() {
  const router = useRouter();
  const { isDark } = useTheme();
  const colors = isDark ? Colors.dark : Colors.light;

  const [loading, setLoading] = useState(false);
  const [data, setData] = useState({
    username: '',
    email: '',
    bio: '',
    avatar_url: ''
  });

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    try {
      const res = await api.get('/auth/api/profile/me/');
      setData({
        username: res.data.username || '',
        email: res.data.email || '',
        bio: res.data.bio || '',
        avatar_url: res.data.avatar_url || ''
      });
    } catch (e) {
      console.log(e);
    }
  };

  const pickImage = async () => {
    let result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (!result.canceled) {
        Alert.alert("Info", "Avatar upload logic needs to be connected to backend.");
    }
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      await api.patch('/auth/api/profile/me/', {
        username: data.username,
        email: data.email,
        bio: data.bio
      });
      router.back();
    } catch (error: any) {
        Alert.alert("Error", "Could not update profile.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { borderColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()}>
            <Text style={[styles.cancelText, { color: colors.text }]}>Cancel</Text>
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>Edit profile</Text>
        <TouchableOpacity onPress={handleSave} disabled={loading}>
            {loading ? <ActivityIndicator color={colors.tint} /> : <Text style={[styles.doneText, { color: colors.tint }]}>Done</Text>}
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content}>
        <View style={styles.avatarSection}>
            <Image source={{ uri: data.avatar_url || 'https://via.placeholder.com/150' }} style={styles.avatar} />
            <TouchableOpacity onPress={pickImage}>
                <Text style={[styles.changePhotoText, { color: colors.tint }]}>Edit picture</Text>
            </TouchableOpacity>
        </View>

        {/* Public Info */}
        <View style={styles.fieldContainer}>
            <Text style={[styles.label, { color: colors.subText }]}>Name</Text>
            <TextInput 
                style={[styles.input, { borderBottomColor: colors.border, color: colors.text }]} 
                value={data.username} 
                onChangeText={(t) => setData({...data, username: t})}
                placeholder="Name"
                placeholderTextColor={colors.subText}
            />
        </View>

        <View style={styles.fieldContainer}>
            <Text style={[styles.label, { color: colors.subText }]}>Bio</Text>
            <TextInput 
                style={[styles.input, { borderBottomColor: colors.border, color: colors.text }]} 
                value={data.bio}
                onChangeText={(t) => setData({...data, bio: t})}
                placeholder="Bio"
                placeholderTextColor={colors.subText}
                multiline
            />
        </View>

        <View style={[styles.divider, { backgroundColor: colors.border }]} />

        <Text style={[styles.sectionHeader, { color: colors.text }]}>Private Information</Text>

        <View style={styles.fieldContainer}>
            <Text style={[styles.label, { color: colors.subText }]}>Email</Text>
            <TextInput 
                style={[styles.input, { borderBottomColor: colors.border, color: colors.text }]} 
                value={data.email}
                onChangeText={(t) => setData({...data, email: t})}
                placeholder="Email"
                placeholderTextColor={colors.subText}
                keyboardType="email-address"
            />
        </View>
        
        {/* Password Link */}
        <TouchableOpacity style={styles.linkRow} onPress={() => Alert.alert("Reset Password", "Link to reset password flow")}>
            <Text style={[styles.label, { color: colors.subText }]}>Password</Text>
            <Text style={[styles.linkText, { color: colors.tint }]}>Change Password</Text>
        </TouchableOpacity>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1 },
  cancelText: { fontSize: 16 },
  doneText: { fontSize: 16, fontWeight: 'bold' },
  title: { fontSize: 16, fontWeight: 'bold' },
  
  content: { padding: 16 },
  avatarSection: { alignItems: 'center', marginBottom: 20 },
  avatar: { width: 80, height: 80, borderRadius: 40, marginBottom: 10 },
  changePhotoText: { fontWeight: '600', fontSize: 13 },
  
  fieldContainer: { marginBottom: 20 },
  label: { fontSize: 12, marginBottom: 5 },
  input: { borderBottomWidth: 1, fontSize: 16, paddingVertical: 8 },
  
  divider: { height: 1, marginVertical: 10 },
  sectionHeader: { fontSize: 15, fontWeight: 'bold', marginBottom: 15, marginTop: 10 },
  
  linkRow: { marginBottom: 20 },
  linkText: { fontSize: 16, marginTop: 5 }
});