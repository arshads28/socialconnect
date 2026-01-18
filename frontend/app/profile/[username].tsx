import { View, Text, TouchableOpacity, StyleSheet, Image, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import api from '../../utils/api';

// Complete logic for app/profile/[username].tsx

export default function ProfileScreen() {
  const { username } = useLocalSearchParams();
  const router = useRouter();
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    fetchProfile();
  }, [username]);

  const fetchProfile = async () => {
    try {
      // Backend URL is /auth/api/profile{username}/
      const response = await api.get(`/auth/api/profile${username}/`);
      setProfile(response.data);
    } catch (error) {
      console.error('Error fetching profile:', error);
      Alert.alert("Error", "Could not load profile");
    } finally {
      setLoading(false);
    }
  };

  const toggleBlock = async () => {
    if (isProcessing) return;
    setIsProcessing(true);
    
    // Determine action based on whether they are currently blocked
    const action = profile.is_blocked ? 'unblock' : 'block';
    
    try {
      await api.post(`/auth/api/profile${username}/${action}/`);
      Alert.alert('Success', `User ${action}ed`);
      fetchProfile(); // Refresh profile data to update UI
    } catch (error) {
      Alert.alert('Error', `Could not ${action} user`);
    } finally {
      setIsProcessing(false);
    }
  };

  if (loading) return <ActivityIndicator size="large" style={{flex: 1}} />;
  if (!profile) return <View style={styles.centerContainer}><Text>User not found</Text></View>;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#000" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>@{profile.username}</Text>
        <View style={{ width: 24 }} />
      </View>

      <View style={styles.profileContent}>
        <Image 
          source={{ uri: profile.avatar || 'https://via.placeholder.com/150' }} 
          style={styles.avatar} 
        />
        <Text style={styles.username}>{profile.full_name || profile.username}</Text>
        <Text style={styles.bio}>{profile.bio || "No bio available"}</Text>

        <View style={styles.actions}>
          {/* ✅ MESSAGE BUTTON */}
          <TouchableOpacity 
            style={styles.btnMessage}
            onPress={() => router.push(`/chat/${username}`)}
          >
            <Ionicons name="chatbubble-outline" size={20} color="#fff" />
            <Text style={styles.btnMessageText}>Message</Text>
          </TouchableOpacity>

          {/* ✅ BLOCK/UNBLOCK BUTTON */}
          <TouchableOpacity 
            style={[styles.btnBlock, profile.is_blocked && { backgroundColor: '#eee' }]}
            onPress={toggleBlock}
            disabled={isProcessing}
          >
            <Text style={[styles.btnBlockText, profile.is_blocked && { color: '#666' }]}>
              {profile.is_blocked ? 'Unblock' : 'Block'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderColor: '#eee' },
  headerTitle: { fontSize: 18, fontWeight: 'bold' },
  profileContent: { alignItems: 'center', padding: 32 },
  avatar: { width: 100, height: 100, borderRadius: 50, marginBottom: 16 },
  avatarPlaceholder: { width: 100, height: 100, borderRadius: 50, backgroundColor: '#eee', justifyContent: 'center', alignItems: 'center', marginBottom: 16 },
  username: { fontSize: 24, fontWeight: 'bold', marginBottom: 4 },
  email: { fontSize: 14, color: '#666', marginBottom: 16 },
  bio: { fontSize: 15, textAlign: 'center', marginBottom: 12, paddingHorizontal: 20 },
  interests: { fontSize: 14, color: '#0095f6', marginBottom: 24 },
  actions: { flexDirection: 'row', gap: 12, marginTop: 16 },
  btnMessage: { backgroundColor: '#0095f6', paddingHorizontal: 32, paddingVertical: 12, borderRadius: 8 },
  btnMessageText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  btnBlock: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#dbdbdb', paddingHorizontal: 32, paddingVertical: 12, borderRadius: 8 },
  btnBlockText: { color: '#000', fontWeight: 'bold', fontSize: 16 },
});
