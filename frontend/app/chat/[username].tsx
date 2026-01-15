import { View, Text, FlatList, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState, useRef } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { getSecure } from '../../utils/storage';
import api, { BASE_URL } from '../../utils/api';

export default function ChatScreen() {
  const { username } = useLocalSearchParams();
  const router = useRouter();
  const [messages, setMessages] = useState<any[]>([]);
  const [text, setText] = useState('');
  const [ws, setWs] = useState<WebSocket | null>(null);
  const flatListRef = useRef<FlatList>(null);

  useEffect(() => {
    loadHistory();
    connectWebSocket();

    return () => {
      if (ws) ws.close();
    };
  }, [username]);

  const loadHistory = async () => {
    try {
      const response = await api.get(`/chat/history/${username}/`);
      setMessages(response.data.messages || []);
    } catch (error) {
      console.error('Error loading history:', error);
    }
  };

  const connectWebSocket = async () => {
    try {
      const token = await getSecure('accessToken');
      if (!token) return;
      
      const protocol = BASE_URL.startsWith('https') ? 'wss' : 'ws';
      const wsUrl = `${protocol}://${BASE_URL.replace(/^https?:\/\//, '')}/ws/chat/${username}/?token=${token}`;
      
      const socket = new WebSocket(wsUrl);

      socket.onopen = () => {
        console.log('Chat WebSocket connected');
      };
      
      socket.onmessage = (e) => {
        const data = JSON.parse(e.data);
        if (data.type === 'chat_message') {
          setMessages(prev => [...prev, {
            id: data.id,
            sender: data.sender,
            message: data.message,
            timestamp: data.timestamp,
          }]);
        }
      };

      socket.onerror = () => {};
      socket.onclose = () => {};

      setWs(socket);
    } catch (error) {
      console.error('Error connecting WebSocket:', error);
    }
  };

  const sendMessage = () => {
    if (!text.trim() || !ws) return;
    
    ws.send(JSON.stringify({ message: text }));
    setText('');
  };

  const renderMessage = ({ item }: { item: any }) => {
    const isMe = item.sender !== username;
    
    return (
      <View style={[styles.messageRow, isMe ? styles.messageRowRight : styles.messageRowLeft]}>
        <View style={[styles.bubble, isMe ? styles.bubbleMe : styles.bubbleOther]}>
          <Text style={[styles.messageText, isMe && { color: '#fff' }]}>{item.message}</Text>
          <Text style={[styles.timestamp, isMe && { color: 'rgba(255,255,255,0.7)' }]}>{item.timestamp}</Text>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#000" />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => router.push(`/profile/${username}`)}>
          <Text style={styles.headerTitle}>{username}</Text>
        </TouchableOpacity>
        <View style={{ width: 24 }} />
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
          keyExtractor={(item, index) => `${item.id}-${index}`}
          contentContainerStyle={styles.messagesList}
          onContentSizeChange={() => flatListRef.current?.scrollToEnd()}
        />

        <View style={styles.inputContainer}>
          <TextInput
            style={styles.input}
            placeholder="Message..."
            value={text}
            onChangeText={setText}
            multiline
          />
          <TouchableOpacity onPress={sendMessage} disabled={!text.trim()}>
            <Ionicons name="send" size={24} color={text.trim() ? '#0095f6' : '#ccc'} />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderColor: '#eee' },
  headerTitle: { fontSize: 18, fontWeight: 'bold' },
  messagesList: { padding: 16 },
  messageRow: { marginBottom: 12, maxWidth: '75%' },
  messageRowLeft: { alignSelf: 'flex-start' },
  messageRowRight: { alignSelf: 'flex-end' },
  bubble: { padding: 12, borderRadius: 18 },
  bubbleMe: { backgroundColor: '#0095f6' },
  bubbleOther: { backgroundColor: '#efefef' },
  messageText: { fontSize: 15, marginBottom: 4 },
  timestamp: { fontSize: 11, color: '#666' },
  inputContainer: { flexDirection: 'row', alignItems: 'center', padding: 12, borderTopWidth: 1, borderColor: '#eee' },
  input: { flex: 1, backgroundColor: '#f0f0f0', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 8, marginRight: 12, maxHeight: 100 },
});
