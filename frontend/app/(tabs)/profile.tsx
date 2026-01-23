import { View, Text, StyleSheet, TouchableOpacity, Image, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useState, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import api from '../../utils/api';

export default function ProfileScreen() {
  const router = useRouter();
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      fetchProfile();
    }, [])
  );

  const fetchProfile = async () => {
    try {
      const response = await api.get('/auth/api/profile/me/');
      setProfile(response.data);
    } catch (error) {
      console.error('Error fetching profile:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.center}><ActivityIndicator size="large" color="#0095f6" /></View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>@{profile?.username}</Text>
        
        {/* Menu / More Option */}
        <TouchableOpacity onPress={() => router.push('/settings/menu')}>
            <Ionicons name="menu" size={28} color="#000" />
        </TouchableOpacity>
      </View>

      <View style={styles.content}>
        {/* Centered Avatar */}
        <View style={styles.avatarContainer}>
          <Image 
            source={{ uri: profile?.avatar_url || 'https://via.placeholder.com/150' }} 
            style={styles.avatar} 
          />
        </View>
        
        {/* User Info */}
        <Text style={styles.name}>{profile?.full_name || profile?.username}</Text>
        <Text style={styles.email}>{profile?.email}</Text>
        
        {profile?.bio && (
          <Text style={styles.bio}>{profile.bio}</Text>
        )}

        {/* --- EDIT PROFILE BUTTON --- */}
        <TouchableOpacity 
          style={styles.editBtn} 
          onPress={() => router.push('/profile/edit')}
        >
          <Text style={styles.editBtnText}>Edit Profile</Text>
        </TouchableOpacity>

      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  
  // Header
  header: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'space-between', 
    paddingHorizontal: 20, 
    paddingVertical: 15,
    borderBottomWidth: 1, 
    borderColor: '#f0f0f0' 
  },
  headerTitle: { fontSize: 20, fontWeight: 'bold' },

  // Content (Centered Layout)
  content: { 
    flex: 1, 
    alignItems: 'center', 
    paddingTop: 40, 
    paddingHorizontal: 30 
  },
  
  avatarContainer: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 5,
    elevation: 3,
    marginBottom: 20,
  },
  avatar: { 
    width: 120, 
    height: 120, 
    borderRadius: 60, 
    backgroundColor: '#f0f0f0' 
  },
  
  name: { fontSize: 24, fontWeight: 'bold', marginBottom: 5, textAlign: 'center' },
  email: { fontSize: 14, color: '#666', marginBottom: 15 },
  bio: { fontSize: 15, color: '#333', textAlign: 'center', marginBottom: 30, lineHeight: 22 },

  // Edit Button Style (Clean & Professional)
  editBtn: {
    backgroundColor: '#f0f0f0',
    paddingVertical: 12,
    paddingHorizontal: 40,
    borderRadius: 8,
    width: '100%',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#dbdbdb',
  },
  editBtnText: {
    color: '#000',
    fontWeight: '600',
    fontSize: 16,
  },
});