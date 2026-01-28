import { View, Text, FlatList, TouchableOpacity, StyleSheet, Image, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { useState, useCallback } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { getLocalInbox } from '../../utils/db';
import { syncServerInbox } from '../../utils/sync';
import { useTheme } from '../../context/ThemeContext';
import { Colors } from '../../constants/Colors';
import { useAuth } from '../../context/AuthContext';

interface InboxItem {
  conversation_id: string; // The clean username (e.g., "john_doe")
  original_id: string;     // The DB key (e.g., "arsh__john_doe")
  content: string;
  timestamp: number | string;
  unread_count: number;
  avatar?: string;
  is_own?: boolean;
  media_type?: string | null; 
}

export default function MessagesScreen() {
  const router = useRouter();
  const { user } = useAuth(); 
  const { isDark } = useTheme();
  const colors = isDark ? Colors.dark : Colors.light;

  const [conversations, setConversations] = useState<InboxItem[]>([]);
  const [loading, setLoading] = useState(true);

  // HELPER: Bulletproof Preview Logic
  const getLastMessagePreview = (item: InboxItem) => {
    const content = item.content || "";

    // 1. Trust the DB type if it exists
    if (item.media_type === 'image') return '📷 Photo';
    if (item.media_type === 'video') return '🎥 Video';
    if (item.media_type === 'audio') return '🎤 Voice Message';

    // 2. Fallback: Check Content Strings (Aggressive Check)
    // If the sender just sent it, it might be a raw file:// URI or a remote http:// URL
    const lowerContent = content.toLowerCase();

    // Check for Image Extensions in the URL
    if (lowerContent.match(/\.(jpeg|jpg|png|gif|webp|bmp)(\?.*)?$/i)) {
        return '📷 Photo';
    }
    // Check for Video Extensions
    if (lowerContent.match(/\.(mp4|mov|avi|wmv)(\?.*)?$/i)) {
        return '🎥 Video';
    }
    // Check for Audio Extensions
    if (lowerContent.match(/\.(mp3|wav|m4a|aac)(\?.*)?$/i)) {
        return '🎤 Voice Message';
    }

    // 3. Check for specific prefixes (Uploads often start with /media/)
    if (content.startsWith('/media/') || content.startsWith('file://')) {
        return '📷 Photo'; 
    }

    // 4. Handle Deleted/Empty
    if (content === '__DELETED__' || !content) return '🚫 Message deleted';

    // 5. If it looks like a long URL but didn't match extensions (fallback safety)
    if (content.startsWith('http') && content.length > 50) {
        return '📎 Attachment'; 
    }

    // 6. Return actual text
    return content;
  };

  const formatTime = (ts: string | number) => {
    if (!ts) return '';
    const date = new Date(ts);
    const now = new Date();
    const isToday = date.getDate() === now.getDate() && date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
    const isYesterday = date.getDate() === now.getDate() - 1 && date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
    
    if (isToday) return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    if (isYesterday) return 'Yesterday';
    return date.toLocaleDateString();
  };

  const refreshInbox = useCallback(async () => {
    if (!user?.username) return;

    try {
        const localData = getLocalInbox(user.username) as any[]; 
        const serverData = await syncServerInbox();
        
        const chatMap = new Map<string, InboxItem>();

        const processItem = (item: any, source: 'local' | 'server') => {
            let partnerName = item.conversation_id || item.username;
            const originalId = item.conversation_id;

            if (partnerName.includes('__')) {
                const parts = partnerName.split('__');
                partnerName = parts.find((p: string) => p !== user.username) || partnerName;
            }

            const ts = new Date(item.timestamp || item.last_message_time || 0).getTime();

            const newItem: InboxItem = {
                conversation_id: partnerName,
                original_id: originalId,
                content: item.content || item.last_message || "",
                timestamp: ts,
                unread_count: item.unread_count || 0,
                avatar: item.avatar || item.avatar_url,
                media_type: item.media_type || null, 
                is_own: source === 'local' ? item.sender === user.username : false
            };

            if (chatMap.has(partnerName)) {
                const existing = chatMap.get(partnerName)!;
                if (ts >= new Date(existing.timestamp).getTime()) {
                    if (!newItem.media_type && existing.media_type && source === 'server') {
                        newItem.media_type = existing.media_type;
                    }
                    chatMap.set(partnerName, newItem);
                }
            } else {
                chatMap.set(partnerName, newItem);
            }
        };

        localData.forEach(item => processItem(item, 'local'));
        if (Array.isArray(serverData)) {
            serverData.forEach(item => processItem(item, 'server'));
        }

        const sortedChats = Array.from(chatMap.values()).sort((a, b) => 
            new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
        );

        setConversations(sortedChats);
    } catch (e) {
        console.error("Inbox Refresh Error:", e);
    } finally {
        setLoading(false);
    }

  }, [user?.username]);

  useFocusEffect(
    useCallback(() => {
      refreshInbox();
    }, [refreshInbox])
  );

  const renderUser = ({ item }: { item: InboxItem }) => {
    const previewText = getLastMessagePreview(item);
    const isMediaPreview = previewText.startsWith('📷') || previewText.startsWith('🎥') || previewText.startsWith('🎤') || previewText.startsWith('📎');

    return (
        <TouchableOpacity 
          style={[styles.userRow, { borderColor: colors.border }]}
          activeOpacity={0.7}
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
            
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                {item.is_own && <Ionicons name="return-up-forward-outline" size={14} color={colors.subText} style={{ marginRight: 4 }} />}
                <Text 
                    style={[
                        styles.status, 
                        { color: isMediaPreview ? colors.tint : colors.subText },
                        isMediaPreview && { fontStyle: 'italic', fontWeight: '500' }
                    ]} 
                    numberOfLines={1}
                >
                  {previewText}
                </Text>
            </View>
          </View>

          <View style={{ alignItems: 'flex-end', marginLeft: 8 }}>
            <Text style={[styles.time, { color: colors.subText }]}>
              {formatTime(item.timestamp)}
            </Text>
            {item.unread_count > 0 && (
              <View style={[styles.badge, { backgroundColor: colors.tint }]}>
                <Text style={styles.badgeText}>{item.unread_count > 99 ? '99+' : item.unread_count}</Text>
              </View>
            )}
          </View>
        </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { borderColor: colors.border }]}>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Messages</Text>
        <TouchableOpacity onPress={() => refreshInbox()} disabled={loading}>
             {loading ? <ActivityIndicator size="small" color={colors.text} /> : <Ionicons name="sync" size={20} color={colors.text} />}
        </TouchableOpacity>
      </View>

      <FlatList
        data={conversations}
        renderItem={renderUser}
        keyExtractor={(item) => item.conversation_id}
        contentContainerStyle={{ paddingBottom: 20 }}
        ListEmptyComponent={
          !loading ? (
            <View style={{ alignItems: 'center', marginTop: 100, opacity: 0.6 }}>
                <Ionicons name="chatbubbles-outline" size={64} color={colors.subText} />
                <Text style={[styles.emptyText, { color: colors.subText }]}>No messages yet</Text>
            </View>
          ) : null
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { 
    padding: 16, 
    borderBottomWidth: 1, 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center' 
  },
  headerTitle: { fontSize: 28, fontWeight: 'bold' },
  userRow: { flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: StyleSheet.hairlineWidth },
  avatarContainer: { marginRight: 14 },
  avatar: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#eee' },
  avatarPlaceholder: { width: 56, height: 56, borderRadius: 28, justifyContent: 'center', alignItems: 'center' },
  userInfo: { flex: 1, justifyContent: 'center' },
  username: { fontSize: 17, fontWeight: '600', marginBottom: 4 },
  status: { fontSize: 15 },
  time: { fontSize: 12, marginBottom: 6 },
  badge: { borderRadius: 10, minWidth: 20, height: 20, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 6 },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: 'bold' },
  emptyText: { textAlign: 'center', marginTop: 16, fontSize: 16 },
});