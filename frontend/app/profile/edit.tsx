import { View, Text, TextInput, TouchableOpacity, StyleSheet, Image, ScrollView, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useState, useEffect } from 'react';
import { Ionicons } from '@expo/vector-icons';
import api from '../../utils/api';
import * as ImagePicker from 'expo-image-picker';

export default function EditProfileScreen() {
  const router = useRouter();
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
        // Upload logic would go here (Multipart form data)
        Alert.alert("Info", "Avatar upload logic needs to be connected to backend.");
    }
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      // ⚠️ Ensure your Backend Serializer allows 'username' and 'email' updates
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
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
            <Text style={styles.cancelText}>Cancel</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Edit profile</Text>
        <TouchableOpacity onPress={handleSave} disabled={loading}>
            {loading ? <ActivityIndicator color="#0095f6" /> : <Text style={styles.doneText}>Done</Text>}
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content}>
        <View style={styles.avatarSection}>
            <Image source={{ uri: data.avatar_url || 'https://via.placeholder.com/150' }} style={styles.avatar} />
            <TouchableOpacity onPress={pickImage}>
                <Text style={styles.changePhotoText}>Edit picture</Text>
            </TouchableOpacity>
        </View>

        {/* Public Info */}
        <View style={styles.fieldContainer}>
            <Text style={styles.label}>Name</Text>
            <TextInput 
                style={styles.input} 
                value={data.username} // Using username as name for now
                onChangeText={(t) => setData({...data, username: t})}
                placeholder="Name"
            />
        </View>

        <View style={styles.fieldContainer}>
            <Text style={styles.label}>Bio</Text>
            <TextInput 
                style={styles.input} 
                value={data.bio}
                onChangeText={(t) => setData({...data, bio: t})}
                placeholder="Bio"
                multiline
            />
        </View>

        <View style={styles.divider} />

        <Text style={styles.sectionHeader}>Private Information</Text>

        <View style={styles.fieldContainer}>
            <Text style={styles.label}>Email</Text>
            <TextInput 
                style={styles.input} 
                value={data.email}
                onChangeText={(t) => setData({...data, email: t})}
                placeholder="Email"
                keyboardType="email-address"
            />
        </View>
        
        {/* Password Link */}
        <TouchableOpacity style={styles.linkRow} onPress={() => Alert.alert("Reset Password", "Link to reset password flow")}>
            <Text style={styles.label}>Password</Text>
            <Text style={styles.linkText}>Change Password</Text>
        </TouchableOpacity>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: { flexDirection: 'row', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderColor: '#efefef' },
  cancelText: { fontSize: 16, color: '#000' },
  doneText: { fontSize: 16, fontWeight: 'bold', color: '#0095f6' },
  title: { fontSize: 16, fontWeight: 'bold' },
  
  content: { padding: 16 },
  avatarSection: { alignItems: 'center', marginBottom: 20 },
  avatar: { width: 80, height: 80, borderRadius: 40, marginBottom: 10 },
  changePhotoText: { color: '#0095f6', fontWeight: '600', fontSize: 13 },
  
  fieldContainer: { marginBottom: 20 },
  label: { color: '#666', fontSize: 12, marginBottom: 5 },
  input: { borderBottomWidth: 1, borderBottomColor: '#eee', fontSize: 16, paddingVertical: 8, color: '#000' },
  
  divider: { height: 1, backgroundColor: '#eee', marginVertical: 10 },
  sectionHeader: { fontSize: 15, fontWeight: 'bold', marginBottom: 15, marginTop: 10 },
  
  linkRow: { marginBottom: 20 },
  linkText: { fontSize: 16, color: '#0095f6', marginTop: 5 }
});