import { View, Text, FlatList, TouchableOpacity, StyleSheet, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { useState, useCallback } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { getLocalInbox } from '../../utils/db';
import { syncServerInbox } from '../../utils/sync';

export default function MessagesScreen() {
  const router = useRouter();
  const [conversations, setConversations] = useState<any[]>([]);

  const refreshInbox = useCallback(async () => {
    // 1. Show whatever local history we have (Real messages from open chats)
    const localData = getLocalInbox();
    setConversations(localData);

    // 2. Fetch fresh previews from Server
    const serverData = await syncServerInbox();
    
    if (serverData && serverData.length > 0) {
      const formatted = serverData.map((item: any) => {
         // Check if we have a real local message (Offline support)
         const localMatch = localData.find(l => l.conversation_id === item.username);
         
         return {
           conversation_id: item.username,
           
           //Prefer Server Preview (Real-time), fallback to Local, then placeholder
           content: item.content || localMatch?.content || "New Message", 
           
           timestamp: item.timestamp,
           unread_count: item.unread_count,
           avatar: item.avatar_url, 
           is_own: false
         };
      });
      setConversations(formatted);
    } 
  }, []);

  useFocusEffect(
    useCallback(() => {
      refreshInbox();
    }, [refreshInbox])
  );

  const renderUser = ({ item }: { item: any }) => (
    <TouchableOpacity 
      style={styles.userRow}
      onPress={() => router.push(`/chat/${item.conversation_id}`)}
    >
      <View style={styles.avatarContainer}>
        {item.avatar ? (
          <Image source={{ uri: item.avatar }} style={styles.avatar} />
        ) : (
          <View style={styles.avatarPlaceholder}>
            <Ionicons name="person" size={24} color="#666" />
          </View>
        )}
      </View>
      
      <View style={styles.userInfo}>
        <Text style={styles.username}>{item.conversation_id}</Text>
        <Text style={styles.status} numberOfLines={1}>
          {item.content}
        </Text>
      </View>

      <View style={{ alignItems: 'flex-end' }}>
        <Text style={styles.time}>
          {new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </Text>
        {item.unread_count > 0 && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{item.unread_count}</Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Messages</Text>
      </View>

      <FlatList
        data={conversations}
        renderItem={renderUser}
        keyExtractor={(item) => item.conversation_id}
        ListEmptyComponent={
          <Text style={styles.emptyText}>No messages yet</Text>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: { padding: 16, borderBottomWidth: 1, borderColor: '#eee' },
  headerTitle: { fontSize: 24, fontWeight: 'bold' },
  userRow: { flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderColor: '#f0f0f0' },
  avatarContainer: { marginRight: 12 },
  avatar: { width: 50, height: 50, borderRadius: 25, backgroundColor: '#eee' },
  avatarPlaceholder: { width: 50, height: 50, borderRadius: 25, backgroundColor: '#eee', justifyContent: 'center', alignItems: 'center' },
  userInfo: { flex: 1 },
  username: { fontSize: 16, fontWeight: '600', marginBottom: 4 },
  status: { fontSize: 14, color: '#666' },
  time: { fontSize: 12, color: '#999', marginBottom: 4 },
  badge: { backgroundColor: '#0095f6', borderRadius: 12, minWidth: 24, height: 24, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 8 },
  badgeText: { color: '#fff', fontSize: 12, fontWeight: 'bold' },
  emptyText: { textAlign: 'center', color: '#888', marginTop: 50 },
});