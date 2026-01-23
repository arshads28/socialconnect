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
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    fetchProfile();
  }, [username]);

  const fetchProfile = async () => {
    try {
      const response = await api.get(`/auth/api/profile/${username}/`);
      setProfile(response.data);
    } catch (error) {
      console.error('Error fetching profile:', error);
      Alert.alert("Error", "Could not load profile");
    } finally {
      setLoading(false);
    }
  };

  const isBlocked = profile?.connection_status === 'BLOCKED';

  const toggleBlock = async () => {
    if (isProcessing) return;
    setIsProcessing(true);
    
    const action = isBlocked ? 'unblock' : 'block';
    
    try {
      await api.post(`/auth/api/profile/${username}/${action}/`);
      
      // Optimistic Update (Update UI immediately before refetching)
      setProfile((prev: any) => ({
        ...prev,
        connection_status: action === 'block' ? 'BLOCKED' : 'NONE'
      }));

      Alert.alert('Success', `User ${action}ed`);
      
    } catch (error) {
      console.log(error);
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
          source={{ uri: profile.avatar_url || 'https://via.placeholder.com/150' }} 
          style={styles.avatar} 
        />
        <Text style={styles.username}>{profile.full_name || profile.username}</Text>
        <Text style={styles.bio}>{profile.bio || "No bio available"}</Text>

        <View style={styles.actions}>
          
          {/* Message Button */}
          <TouchableOpacity 
            style={styles.btnMessage}
            onPress={() => router.push(`/chat/${username}`)}
          >
            <Ionicons name="chatbubble-outline" size={20} color="#fff" />
            <Text style={styles.btnMessageText}>Message</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.btnBlock, isBlocked && { backgroundColor: '#eee', borderColor: '#ccc' }]}
            onPress={toggleBlock}
            disabled={isProcessing}
          >
            <Text style={[styles.btnBlockText, isBlocked && { color: '#ff3b30' }]}>
              {isBlocked ? 'Unblock' : 'Block'}
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
  username: { fontSize: 24, fontWeight: 'bold', marginBottom: 4 },
  bio: { fontSize: 15, textAlign: 'center', marginBottom: 12, paddingHorizontal: 20 },
  actions: { flexDirection: 'row', gap: 12, marginTop: 16 },
  btnMessage: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#0095f6', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 8 },
  btnMessageText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  btnBlock: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#dbdbdb', paddingHorizontal: 32, paddingVertical: 12, borderRadius: 8 },
  btnBlockText: { color: '#000', fontWeight: 'bold', fontSize: 16 },
});
