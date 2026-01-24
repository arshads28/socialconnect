import { View, Text, FlatList, TouchableOpacity, StyleSheet, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { useState, useCallback } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { getLocalInbox } from '../../utils/db';
import { syncServerInbox } from '../../utils/sync';
import { useTheme } from '../../context/ThemeContext';
import { Colors } from '../../constants/Colors';

interface InboxItem {
  conversation_id: string;
  content: string;
  timestamp: string;
  unread_count: number;
  avatar?: string;
  is_own?: boolean;
}

export default function MessagesScreen() {
  const router = useRouter();
  const { isDark } = useTheme();
  const colors = isDark ? Colors.dark : Colors.light;

  const [conversations, setConversations] = useState<InboxItem[]>([]);

  const refreshInbox = useCallback(async () => {
    const localData = getLocalInbox() as any[]; 
    setConversations(localData);

    const serverData = await syncServerInbox();
    
    if (serverData && serverData.length > 0) {
      const formatted: InboxItem[] = serverData.map((item: any) => {
         const localMatch = localData.find((l: any) => l.conversation_id === item.username);
         
         return {
           conversation_id: item.username,
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

  const renderUser = ({ item }: { item: InboxItem }) => (
    <TouchableOpacity 
      style={[styles.userRow, { borderColor: colors.border }]}
      onPress={() => router.push(`/chat/${item.conversation_id}`)}
    >
      <View style={styles.avatarContainer}>
        {item.avatar ? (
          <Image source={{ uri: item.avatar }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatarPlaceholder, { backgroundColor: colors.border }]}>
            <Ionicons name="person" size={24} color={colors.subText} />
          </View>
        )}
      </View>
      
      <View style={styles.userInfo}>
        <Text style={[styles.username, { color: colors.text }]}>{item.conversation_id}</Text>
        <Text style={[styles.status, { color: colors.subText }]} numberOfLines={1}>
          {item.content}
        </Text>
      </View>

      <View style={{ alignItems: 'flex-end' }}>
        <Text style={[styles.time, { color: colors.subText }]}>
          {new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </Text>
        {item.unread_count > 0 && (
          <View style={[styles.badge, { backgroundColor: colors.tint }]}>
            <Text style={styles.badgeText}>{item.unread_count}</Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { borderColor: colors.border }]}>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Messages</Text>
      </View>

      <FlatList
        data={conversations}
        renderItem={renderUser}
        keyExtractor={(item) => item.conversation_id}
        ListEmptyComponent={
          <Text style={[styles.emptyText, { color: colors.subText }]}>No messages yet</Text>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { padding: 16, borderBottomWidth: 1 },
  headerTitle: { fontSize: 24, fontWeight: 'bold' },
  userRow: { flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: 1 },
  avatarContainer: { marginRight: 12 },
  avatar: { width: 50, height: 50, borderRadius: 25, backgroundColor: '#eee' },
  avatarPlaceholder: { width: 50, height: 50, borderRadius: 25, justifyContent: 'center', alignItems: 'center' },
  userInfo: { flex: 1 },
  username: { fontSize: 16, fontWeight: '600', marginBottom: 4 },
  status: { fontSize: 14 },
  time: { fontSize: 12, marginBottom: 4 },
  badge: { borderRadius: 12, minWidth: 24, height: 24, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 8 },
  badgeText: { color: '#fff', fontSize: 12, fontWeight: 'bold' },
  emptyText: { textAlign: 'center', marginTop: 50 },
});