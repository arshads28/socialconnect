import { View, Text, TouchableOpacity, StyleSheet, Image, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import api from '../../utils/api';

export default function ProfileScreen() {
  const { username } = useLocalSearchParams();
  const router = useRouter();
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchProfile();
  }, [username]);

  const fetchProfile = async () => {
    try {
      const response = await api.get(`/auth/profile/${username}/`);
      setProfile(response.data);
    } catch (error) {
      console.error('Error fetching profile:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleBlock = async () => {
    try {
      await api.post(`/auth/profile/${username}/block/`);
      Alert.alert('Success', `You blocked ${username}`);
      router.back();
    } catch (error) {
      Alert.alert('Error', 'Could not block user');
    }
  };

  const handleUnblock = async () => {
    try {
      await api.post(`/auth/profile/${username}/unblock/`);
      Alert.alert('Success', `You unblocked ${username}`);
      fetchProfile();
    } catch (error) {
      Alert.alert('Error', 'Could not unblock user');
    }
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#0095f6" />
      </View>
    );
  }

  if (!profile) {
    return (
      <View style={styles.centerContainer}>
        <Text>User not found</Text>
      </View>
    );
  }

  const isBlocked = profile.connection_status === 'BLOCKED';

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#000" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{profile.username}</Text>
        <View style={{ width: 24 }} />
      </View>

      <View style={styles.profileContent}>
        {profile.avatar_url ? (
          <Image source={{ uri: profile.avatar_url }} style={styles.avatar} />
        ) : (
          <View style={styles.avatarPlaceholder}>
            <Ionicons name="person" size={50} color="#666" />
          </View>
        )}

        <Text style={styles.username}>@{profile.username}</Text>
        <Text style={styles.email}>{profile.email}</Text>
        
        {profile.bio && <Text style={styles.bio}>{profile.bio}</Text>}
        {profile.interests && <Text style={styles.interests}>{profile.interests}</Text>}

        <View style={styles.actions}>
          <TouchableOpacity 
            style={styles.btnMessage}
            onPress={() => router.push(`/chat/${username}`)}
          >
            <Text style={styles.btnMessageText}>Message</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.btnBlock}
            onPress={isBlocked ? handleUnblock : handleBlock}
          >
            <Text style={styles.btnBlockText}>{isBlocked ? 'Unblock' : 'Block'}</Text>
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
