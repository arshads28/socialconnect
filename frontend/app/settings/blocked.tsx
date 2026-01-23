import { View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useState, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import api from '../../utils/api';

export default function BlockedUsersScreen() {
  const router = useRouter();
  const [blockedUsers, setBlockedUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // 1. Auto-refresh list every time this screen appears
  useFocusEffect(
    useCallback(() => {
      fetchBlockedUsers();
    }, [])
  );

  const fetchBlockedUsers = async () => {
    try {
      // Calls the new backend endpoint we just made
      const response = await api.get('/auth/api/profile/blocked/'); 
      setBlockedUsers(response.data);
    } catch (error) {
      console.log("Error fetching blocked list", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color="black" />
        </TouchableOpacity>
        <Text style={styles.title}>Blocked Accounts</Text>
        <View style={{ width: 24 }} />
      </View>

      {loading ? (
        <ActivityIndicator size="large" color="#0095f6" style={{ marginTop: 20 }} />
      ) : (
        <FlatList
            data={blockedUsers}
            keyExtractor={(item) => item.username}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Ionicons name="shield-checkmark-outline" size={48} color="#ccc" />
                <Text style={styles.emptyText}>No blocked accounts.</Text>
              </View>
            }
            renderItem={({ item }) => (
                <TouchableOpacity 
                  style={styles.row}
                  // 2. Navigate to Profile on click
                  onPress={() => router.push(`/profile/${item.username}`)}
                >
                    <View style={styles.userInfo}>
                        <Image 
                          source={{ uri: item.avatar_url || 'https://via.placeholder.com/150' }} 
                          style={styles.avatar} 
                        />
                        <View>
                            <Text style={styles.username}>{item.username}</Text>
                            <Text style={styles.fullname} numberOfLines={1}>
                                {item.full_name || "Instagram User"}
                            </Text>
                        </View>
                    </View>

                    {/* Unblock Button (Visual indicator) */}
                    <View style={styles.unblockBtn}>
                        <Text style={styles.unblockText}>Unblock</Text>
                    </View>
                </TouchableOpacity>
            )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderColor: '#eee' },
  title: { fontSize: 16, fontWeight: 'bold' },
  
  row: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center', 
    padding: 16, 
    borderBottomWidth: 1, 
    borderColor: '#f0f0f0' 
  },
  userInfo: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#eee' },
  username: { fontSize: 14, fontWeight: 'bold' },
  fullname: { fontSize: 12, color: '#666' },

  unblockBtn: { 
    borderWidth: 1, 
    borderColor: '#dbdbdb', 
    paddingHorizontal: 14, 
    paddingVertical: 6, 
    borderRadius: 4 
  },
  unblockText: { fontSize: 12, fontWeight: '600', color: '#000' },

  emptyContainer: { alignItems: 'center', marginTop: 60, gap: 10 },
  emptyText: { color: '#666', fontSize: 16 },
});