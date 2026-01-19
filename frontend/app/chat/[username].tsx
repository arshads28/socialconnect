import { 
  View, Text, FlatList, TextInput, TouchableOpacity, StyleSheet, 
  KeyboardAvoidingView, Platform, DeviceEventEmitter, Image, Alert 
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState, useRef, useCallback } from 'react';
import { Ionicons } from '@expo/vector-icons';
import api from '../../utils/api'; 

import { useWebSocket } from '../../contexts/WebSocketContext';
import { encryptMessage } from '../../utils/crypto';
import { 
  saveMessage, getMessagesForChat, markChatAsRead, 
  deleteLocalChat, generateUUID, addToQueue 
} from '../../utils/db';
import { useAuth } from '../../context/AuthContext';
import { syncChatMessages } from '../../utils/sync';
import NetInfo from '@react-native-community/netinfo';

export default function ChatScreen() {
  const { username } = useLocalSearchParams<{ username: string }>();
  const router = useRouter();
  const { user } = useAuth();
  
  const { sendMessage, sendReadSignal, sendTypingSignal, ws } = useWebSocket();
  
  const [messages, setMessages] = useState<any[]>([]);
  const [text, setText] = useState('');
  const [targetProfile, setTargetProfile] = useState<any>(null); 
  const [isTyping, setIsTyping] = useState(false);
  const [isOnline, setIsOnline] = useState(false);
  
  const flatListRef = useRef<FlatList>(null);
  const typingTimeout = useRef<any>(null);
  const lastTypingSent = useRef<number>(0);

  // 1. INITIAL LOAD & SYNC
  useEffect(() => {
    let isMounted = true;

    const initChat = async () => {
      loadLocalMessages();
      fetchTargetProfile();

      const synced = await syncChatMessages(username as string);
      
      if (isMounted && synced) {
        loadLocalMessages();
      }
      
      markChatAsRead(username as string);
      sendReadSignal(username as string);
    };

    initChat();

    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ command: 'join_room', username }));
    }

    return () => {
      isMounted = false;
      if (ws?.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ command: 'leave_room' }));
      }
    };
  }, [username, ws]);

  // 2. LISTENERS
  useEffect(() => {
    const msgListener = DeviceEventEmitter.addListener('new_message', (event) => {
      if (event.conversation_id === username) {
        loadLocalMessages();
        markChatAsRead(username as string);
        sendReadSignal(username as string);
      }
    });

    const statusListener = DeviceEventEmitter.addListener('message_status_changed', (event) => {
      loadLocalMessages();
    });

    const typingListener = DeviceEventEmitter.addListener('typing_event', (event) => {
      if (event.sender === username) {
        setIsTyping(true);
        if (typingTimeout.current) clearTimeout(typingTimeout.current);
        typingTimeout.current = setTimeout(() => setIsTyping(false), 3000);
      }
    });

    const presenceListener = DeviceEventEmitter.addListener('presence_update', (data) => {
      if (data.username === username) {
        setIsOnline(data.is_online);
      }
    });

    return () => {
      msgListener.remove();
      statusListener.remove();
      typingListener.remove();
      presenceListener.remove();
    };
  }, [username]);

  const fetchTargetProfile = async () => {
    try {
      const res = await api.get(`/auth/api/profile/${username}/`);
      setTargetProfile(res.data);
      // setIsOnline(res.data.is_online);
    } catch (e) {
      console.log("Error fetching profile", e);
    }
  };

  const loadLocalMessages = useCallback(() => {
    const msgs = getMessagesForChat(username as string);
    if (msgs) setMessages(msgs);
  }, [username]);

  const handleTyping = (val: string) => {
    setText(val);
    const now = Date.now();
    if (val.length > 0 && (now - lastTypingSent.current > 2000)) {
      sendTypingSignal(username as string);
      lastTypingSent.current = now;
    }
  };

  const handleSend = async () => {
    if (!text.trim()) return;

    const clientId = generateUUID();
    const ciphertext = encryptMessage(text);
    const timestamp = new Date().toISOString();

    // 1. Optimistic Save (This creates the "Temporary" row)
    saveMessage({
      id: null, 
      client_id: clientId, 
      conversation_id: username,
      sender: user?.username,
      content: text, 
      status: 'sending',
      timestamp: timestamp,
      is_own: true
    });

    // 2. Refresh UI immediately
    loadLocalMessages();
    setText('');
    
    // 3. Network Check & Queue
    const netState = await NetInfo.fetch();

    if (!netState.isConnected || ws?.readyState !== WebSocket.OPEN) {
        // OFFLINE: Attempt to Queue
        const queued = addToQueue('SEND_MESSAGE', {
            conversation_id: username,
            ciphertext: ciphertext,
            client_id: clientId
        });

        if (!queued) {
            Alert.alert(
                "Not Sent", 
                "Offline queue is full. Message not saved. Connect to internet."
            );
            // Optional: Remove the message if queue failed
            // deleteLocalMessage(clientId); 
            // loadLocalMessages();
        }
    } else {
        //  ONLINE: Send via Socket
        sendMessage(username as string, ciphertext, clientId);
    }
  };

  const handleClearChat = () => {
      Alert.alert(
        "Clear Chat?",
        "Delete local and server history?",
        [
          { text: "Cancel", style: "cancel" },
          { 
            text: "Delete", 
            style: "destructive", 
            onPress: async () => {
              deleteLocalChat(username as string);
              setMessages([]); 
              try { await api.post(`/chat/clear/${username}/`); } catch(e){}
            } 
          }
        ]
      );
  };

  const renderMessage = ({ item }: { item: any }) => {
    const isMe = item.is_own === 1;
    
    const renderTicks = () => {
      if (!isMe) return null;
      if (item.status === 'sending') return <Ionicons name="time-outline" size={14} color="#ddd" />;
      if (item.status === 'sent') return <Ionicons name="checkmark" size={16} color="#ddd" />;
      if (item.status === 'delivered') return <Ionicons name="checkmark-done" size={16} color="#ddd" />;
      if (item.status === 'read') return <Ionicons name="checkmark-done" size={16} color="#4dabf7" />;
      return null;
    };

    return (
      <View style={[styles.messageRow, isMe ? styles.messageRowRight : styles.messageRowLeft]}>
        <View style={[styles.bubble, isMe ? styles.bubbleMe : styles.bubbleOther]}>
          <Text style={[styles.messageText, isMe && { color: '#fff' }]}>{item.content}</Text>
          <View style={styles.metaRow}>
            <Text style={[styles.timestamp, isMe && { color: 'rgba(255,255,255,0.7)' }]}>
              {new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </Text>
            {isMe && <View style={{marginLeft: 4}}>{renderTicks()}</View>}
          </View>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
          <TouchableOpacity onPress={() => router.back()} style={{ marginRight: 10 }}>
            <Ionicons name="arrow-back" size={24} color="#000" />
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }} 
            onPress={() => router.push(`/profile/${username}`)}
          >
            {targetProfile?.avatar ? (
              <Image source={{ uri: targetProfile.avatar }} style={styles.avatar} />
            ) : (
              <View style={styles.avatarPlaceholder}><Ionicons name="person" size={20} color="#666" /></View>
            )}
            <View>
              <Text style={styles.headerTitle}>{username}</Text>
              {isTyping ? (
                <Text style={styles.headerStatusTyping}>typing...</Text>
              ) : (
                <Text style={[styles.headerStatus, isOnline && { color: '#4caf50', fontWeight: 'bold' }]}>
                  {isOnline ? 'Online' : 'Offline'}
                </Text>
              )}
            </View>
          </TouchableOpacity>
        </View>
        
        <View style={{ flexDirection: 'row', gap: 15, alignItems: 'center' }}>
            <TouchableOpacity onPress={handleClearChat}>
                 <Ionicons name="trash-outline" size={22} color="#ff3b30" />
            </TouchableOpacity>
            <Ionicons name="call-outline" size={24} color="#0095f6" />
        </View>
      </View>

      <KeyboardAvoidingView 
        style={{ flex: 1 }} 
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        <FlatList
          ref={flatListRef}
          data={messages}
          renderItem={renderMessage}
          keyExtractor={(item) => item.client_id}
          contentContainerStyle={styles.messagesList}
          onContentSizeChange={() => flatListRef.current?.scrollToEnd()}
          ListFooterComponent={<View style={{ height: 10 }} />}
        />

        <View style={styles.inputContainer}>
          <TextInput
            style={styles.input}
            placeholder="Message..."
            value={text}
            onChangeText={handleTyping}
            multiline
          />
          <TouchableOpacity onPress={handleSend} disabled={!text.trim()}>
            <Ionicons name="send" size={24} color={text.trim() ? '#0095f6' : '#ccc'} />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 10, borderBottomWidth: 1, borderColor: '#eee', height: 60 },
  headerTitle: { fontSize: 16, fontWeight: 'bold' },
  headerStatus: { fontSize: 12, color: '#666' },
  headerStatusTyping: { fontSize: 12, color: '#0095f6', fontWeight: 'bold' },
  avatar: { width: 36, height: 36, borderRadius: 18, marginRight: 10 },
  avatarPlaceholder: { width: 36, height: 36, borderRadius: 18, marginRight: 10, backgroundColor: '#eee', justifyContent: 'center', alignItems: 'center' },
  messagesList: { padding: 16 },
  messageRow: { marginBottom: 12, maxWidth: '75%' },
  messageRowLeft: { alignSelf: 'flex-start' },
  messageRowRight: { alignSelf: 'flex-end' },
  bubble: { padding: 12, borderRadius: 18 },
  bubbleMe: { backgroundColor: '#0095f6' },
  bubbleOther: { backgroundColor: '#efefef' },
  messageText: { fontSize: 15, marginBottom: 4 },
  metaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', marginTop: 2 },
  timestamp: { fontSize: 10, color: '#666' },
  inputContainer: { flexDirection: 'row', alignItems: 'center', padding: 10, borderTopWidth: 1, borderColor: '#eee', backgroundColor: '#fff' },
  input: { flex: 1, backgroundColor: '#f0f0f0', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10, marginRight: 10, maxHeight: 100, fontSize: 16 },
});