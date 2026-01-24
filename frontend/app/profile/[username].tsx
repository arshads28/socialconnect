import { View, Text, TouchableOpacity, StyleSheet, Image, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import api from '../../utils/api';
import { useTheme } from '../../context/ThemeContext';
import { Colors } from '../../constants/Colors';

export default function ProfileScreen() {
  const { username } = useLocalSearchParams();
  const router = useRouter();
  const { isDark } = useTheme();
  const colors = isDark ? Colors.dark : Colors.light;

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

  if (loading) return <ActivityIndicator size="large" color={colors.tint} style={{flex: 1, backgroundColor: colors.background}} />;
  if (!profile) return <View style={[styles.centerContainer, { backgroundColor: colors.background }]}><Text style={{ color: colors.text }}>User not found</Text></View>;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { borderColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={colors.icon} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>@{profile.username}</Text>
        <View style={{ width: 24 }} />
      </View>

      <View style={styles.profileContent}>
        <Image 
          source={{ uri: profile.avatar_url || 'https://via.placeholder.com/150' }} 
          style={styles.avatar} 
        />
        <Text style={[styles.username, { color: colors.text }]}>{profile.full_name || profile.username}</Text>
        <Text style={[styles.bio, { color: colors.subText }]}>{profile.bio || "No bio available"}</Text>

        <View style={styles.actions}>
          
          {/* Message Button */}
          <TouchableOpacity 
            style={[styles.btnMessage, { backgroundColor: colors.tint }]}
            onPress={() => router.push(`/chat/${username}`)}
          >
            <Ionicons name="chatbubble-outline" size={20} color="#fff" />
            <Text style={styles.btnMessageText}>Message</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[
              styles.btnBlock, 
              { backgroundColor: colors.background, borderColor: colors.border },
              isBlocked && { backgroundColor: isDark ? '#333' : '#eee', borderColor: isDark ? '#444' : '#ccc' }
            ]}
            onPress={toggleBlock}
            disabled={isProcessing}
          >
            <Text style={[styles.btnBlockText, { color: colors.text }, isBlocked && { color: colors.danger }]}>
              {isBlocked ? 'Unblock' : 'Block'}
            </Text>
          </TouchableOpacity>

        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1 },
  headerTitle: { fontSize: 18, fontWeight: 'bold' },
  profileContent: { alignItems: 'center', padding: 32 },
  avatar: { width: 100, height: 100, borderRadius: 50, marginBottom: 16 },
  username: { fontSize: 24, fontWeight: 'bold', marginBottom: 4 },
  bio: { fontSize: 15, textAlign: 'center', marginBottom: 12, paddingHorizontal: 20 },
  actions: { flexDirection: 'row', gap: 12, marginTop: 16 },
  btnMessage: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 8 },
  btnMessageText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  btnBlock: { borderWidth: 1, paddingHorizontal: 32, paddingVertical: 12, borderRadius: 8 },
  btnBlockText: { fontWeight: 'bold', fontSize: 16 },
});