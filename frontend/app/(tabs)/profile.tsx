import { View, Text, StyleSheet, TouchableOpacity, Image, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useState, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import api from '../../utils/api';
import { useTheme } from '../../context/ThemeContext';
import { Colors } from '../../constants/Colors';

export default function ProfileScreen() {
  const router = useRouter();
  const { isDark } = useTheme();
  const colors = isDark ? Colors.dark : Colors.light;

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
      <View style={[styles.center, { backgroundColor: colors.background }]}><ActivityIndicator size="large" color={colors.tint} /></View>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { borderColor: colors.border }]}>
        <Text style={[styles.headerTitle, { color: colors.text }]}>@{profile?.username}</Text>
        
        {/* Menu / More Option */}
        <TouchableOpacity onPress={() => router.push('/settings/menu')}>
            <Ionicons name="menu" size={28} color={colors.icon} />
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
        <Text style={[styles.name, { color: colors.text }]}>{profile?.full_name || profile?.username}</Text>
        <Text style={[styles.email, { color: colors.subText }]}>{profile?.email}</Text>
        
        {profile?.bio && (
          <Text style={[styles.bio, { color: colors.subText }]}>{profile.bio}</Text>
        )}

        {/* --- EDIT PROFILE BUTTON --- */}
        <TouchableOpacity 
          style={[styles.editBtn, { backgroundColor: colors.card, borderColor: colors.border }]} 
          onPress={() => router.push('/profile/edit')}
        >
          <Text style={[styles.editBtnText, { color: colors.text }]}>Edit Profile</Text>
        </TouchableOpacity>

      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  
  header: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'space-between', 
    paddingHorizontal: 20, 
    paddingVertical: 15,
    borderBottomWidth: 1, 
  },
  headerTitle: { fontSize: 20, fontWeight: 'bold' },

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
  email: { fontSize: 14, marginBottom: 15 },
  bio: { fontSize: 15, textAlign: 'center', marginBottom: 30, lineHeight: 22 },

  editBtn: {
    paddingVertical: 12,
    paddingHorizontal: 40,
    borderRadius: 8,
    width: '100%',
    alignItems: 'center',
    borderWidth: 1,
  },
  editBtnText: {
    fontWeight: '600',
    fontSize: 16,
  },
});