import { 
  View, Text, FlatList, TextInput, TouchableOpacity, StyleSheet, 
  Platform, DeviceEventEmitter, Image, Alert, ActivityIndicator
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState, useRef, useCallback } from 'react';
import { Ionicons } from '@expo/vector-icons';
import api, { BASE_URL } from '../../utils/api'; 
import * as ImagePicker from 'expo-image-picker'; 

import { useWebSocket } from '../../contexts/WebSocketContext';
import { encryptMessage } from '../../utils/crypto';
import { 
  saveMessage, getMessagesForChat, markChatAsRead, 
  deleteLocalChat, generateUUID, addToQueue,
  getUser, saveUser  
} from '../../utils/db';
import { useAuth } from '../../context/AuthContext';
import { syncChatMessages } from '../../utils/sync';
import NetInfo from '@react-native-community/netinfo';
import { CallHeaderButton } from '../../contexts/CallComponent';
import KeyboardWrapper from '../../components/KeyboardWrapper'; 
import { getSecure } from '../../utils/storage'; 

import { useTheme } from '../../context/ThemeContext';
import { Colors } from '../../constants/Colors';
import { processMedia } from '../../utils/mediaProcessor';
import UploadManager from '../../utils/UploadManager';

export default function ChatScreen() {
  const { username } = useLocalSearchParams<{ username: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const insets = useSafeAreaInsets(); 
  const { isDark } = useTheme();
  const colors = isDark ? Colors.dark : Colors.light;

  const { sendMessage, sendReadSignal, sendTypingSignal, ws } = useWebSocket();
  const [messages, setMessages] = useState<any[]>([]);
  const [text, setText] = useState('');
  const [targetProfile, setTargetProfile] = useState<any>(null); 
  const [isTyping, setIsTyping] = useState(false);
  const [isUserOnline, setIsUserOnline] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [isNetworkChecked, setIsNetworkChecked] = useState(false);
  
  const flatListRef = useRef<FlatList>(null);
  const typingTimeout = useRef<any>(null);
  const lastTypingSent = useRef<number>(0);
  const HEADER_HEIGHT = 60;

  // 1. INIT CHAT & NETWORK MONITOR
  useEffect(() => {
    let isMounted = true;
    setMessages([]); 
    setIsNetworkChecked(false); 
    const initChat = async () => {
      loadLocalMessages();
      const cachedUser = getUser(username as string);
      if (cachedUser) setTargetProfile(cachedUser);
      await fetchTargetProfile();
      const net = await NetInfo.fetch();
      if (isMounted) {
          setIsConnected(net.isConnected ?? false);
          setIsNetworkChecked(true); 
      }
      if (net.isConnected) {
        const synced = await syncChatMessages(username as string);
        if (isMounted && synced) loadLocalMessages();
      }
      markChatAsRead(username as string);
      sendReadSignal(username as string);
    };
    initChat();
    const unsubscribeNet = NetInfo.addEventListener(state => {
      if (isMounted) {
          setIsConnected(state.isConnected ?? false);
          setIsNetworkChecked(true);
      }
    });
    return () => { isMounted = false; unsubscribeNet(); };
  }, [username]);

  // 2. WEBSOCKET
  useEffect(() => {
    if (!ws || ws.readyState !== WebSocket.OPEN || !targetProfile?.id) return;
    if (isConnected) ws.send(JSON.stringify({ command: 'join_room', recipient_id: targetProfile.id}));
    return () => {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ command: 'leave_room' }));
    };
  }, [targetProfile, ws, isConnected]); 

  // 3. LISTENERS
  useEffect(() => {
    const msgListener = DeviceEventEmitter.addListener('new_message', (event) => {
      if (event.conversation_id === username) {
        loadLocalMessages();
        markChatAsRead(username as string);
        sendReadSignal(username as string);
      }
    });
    const statusListener = DeviceEventEmitter.addListener('message_status_changed', () => loadLocalMessages());
    const typingListener = DeviceEventEmitter.addListener('typing_event', (event) => {
      if (event.sender === username) {
        setIsTyping(true);
        if (typingTimeout.current) clearTimeout(typingTimeout.current);
        typingTimeout.current = setTimeout(() => setIsTyping(false), 3000);
      }
    });
    const presenceListener = DeviceEventEmitter.addListener('presence_update', (data) => {
      if (data.username === username || data.user_id === targetProfile?.id) setIsUserOnline(data.is_online);
    });
    return () => {
      msgListener.remove();
      statusListener.remove();
      typingListener.remove();
      presenceListener.remove();
    };
  }, [username, targetProfile]);

  const fetchTargetProfile = async () => {
    try {
      const res = await api.get(`/auth/api/profile/${username}/`);
      setTargetProfile(res.data);
      saveUser(res.data); 
      if (res.data.is_online !== undefined) setIsUserOnline(res.data.is_online);
    } catch (e) { console.log("Error fetching profile", e); }
  };

  const loadLocalMessages = useCallback(() => {
    const msgs = getMessagesForChat(username as string);
    if (Array.isArray(msgs)) setMessages(msgs);
  }, [username]);

  const handleTyping = (val: string) => {
    setText(val);
    const now = Date.now();
    if (isConnected && val.length > 0 && (now - lastTypingSent.current > 2000) && targetProfile?.id) {
      sendTypingSignal(targetProfile.id);
      lastTypingSent.current = now;
    }
  };

  const pickMedia = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.All,
      allowsEditing: true,
      quality: 1,
    });
    if (!result.canceled) {
      handleSendMedia(result.assets[0].uri, result.assets[0].type === 'video' ? 'video' : 'image');
    }
  };

  const handleSendMedia = async (uri: string, type: 'image' | 'video') => {
    if (!targetProfile?.id) return;
    const processed = await processMedia(uri, type);
    const clientId = generateUUID();
    const recipientId = targetProfile.id;
    const token = await getSecure('accessToken');

    const optimisticMsg = {
        id: null,
        client_id: clientId,
        conversation_id: username,
        recipient_id: recipientId,
        sender: user?.username,
        content: processed.uri, 
        local_media_uri: processed.uri, // ✅ HARDENING: Keep local path for retry
        status: 'uploading', 
        timestamp: new Date().toISOString(),
        is_own: true,
        media_type: type,
        media_progress: 0,
        media_failed: false,
    };

    saveMessage(optimisticMsg); 
    loadLocalMessages(); // This usually reloads from DB, might lose transient 'local_media_uri' if not in schema.
    // For pure in-memory smoothness, we also update state directly
    setMessages(prev => [...prev, optimisticMsg]);

    UploadManager.add({
        id: clientId,
        uri: processed.uri,
        type: type,
        endpoint: `${BASE_URL}/chat/upload/`,
        headers: { 'Authorization': `Bearer ${token}` },
        onProgress: (p) => {
             setMessages(prev => prev.map(m => m.client_id === clientId ? { ...m, media_progress: p } : m));
        },
        onSuccess: (response) => {
             const remoteUrl = response.media_url || response.url;
             const ciphertext = encryptMessage(remoteUrl);
             sendMessage(recipientId, ciphertext, clientId); 
             setMessages(prev => prev.map(m => m.client_id === clientId ? { ...m, content: remoteUrl, status: 'sent', media_progress: 100 } : m));
        },
        onError: () => {
             setMessages(prev => prev.map(m => m.client_id === clientId ? { ...m, media_failed: true, status: 'failed' } : m));
        }
    });
  };

  const handleSend = async () => {
    if (!text.trim()) return;
    if (!targetProfile?.id) { Alert.alert("Error", "Recipient details missing."); return; }

    const clientId = generateUUID();
    const ciphertext = encryptMessage(text);
    const timestamp = new Date().toISOString();
    const recipientId = targetProfile.id; 

    saveMessage({
      id: null, client_id: clientId, conversation_id: username, recipient_id: recipientId, 
      sender: user?.username, content: text, status: 'sending', timestamp: timestamp, is_own: true
    });

    loadLocalMessages();
    setText('');
    
    const netState = await NetInfo.fetch();
    const isNetworkUp = netState.isConnected && netState.isInternetReachable;

    if (!isNetworkUp || ws?.readyState !== WebSocket.OPEN) {
        addToQueue('SEND_MESSAGE', { conversation_id: username, recipient_id: recipientId, ciphertext, client_id: clientId });
    } else {
        sendMessage(recipientId, ciphertext, clientId);
    }
  };

  const handleClearChat = () => {
      Alert.alert("Clear Chat?", "Delete local history?", [
          { text: "Cancel", style: "cancel" },
          { text: "Delete", style: "destructive", onPress: async () => {
              deleteLocalChat(username as string);
              setMessages([]); 
              api.post(`/chat/clear/${username}/`).catch(() => {}); 
            } 
          }
        ]);
  };

  const renderMessage = ({ item }: { item: any }) => {
    const isMe = item.is_own === 1 || item.is_own === true;
    const isMedia = item.media_type === 'image' || item.media_type === 'video' || (typeof item.content === 'string' && (item.content.startsWith('file://') || item.content.includes('cloudinary') || item.content.includes('s3'))); 

    const renderTicks = () => {
      if (!isMe) return null;
      if (item.status === 'sending') return <Ionicons name="time-outline" size={14} color="#ddd" />; 
      if (item.status === 'sent') return <Ionicons name="checkmark" size={16} color="#ddd" />; 
      if (item.status === 'delivered') return <Ionicons name="checkmark-done" size={16} color="#ddd" />; 
      if (item.status === 'read') return <Ionicons name="checkmark-done" size={16} color={isDark ? '#4dabf7' : '#0095f6'} />; 
      return null;
    };

    return (
      <View style={[styles.messageRow, isMe ? styles.messageRowRight : styles.messageRowLeft]}>
        <View style={[styles.bubble, isMe ? { backgroundColor: colors.tint } : { backgroundColor: isDark ? '#2c2c2e' : '#efefef' }]}>
          {isMedia ? (
             <View>
                {item.media_type === 'video' ? (
                     <View style={{ width: 200, height: 200, borderRadius: 10, justifyContent: 'center', alignItems: 'center', backgroundColor: '#000' }}>
                         <Ionicons name="play" size={40} color="#fff" />
                     </View>
                ) : (
                     <Image source={{ uri: item.content }} style={{ width: 200, height: 200, borderRadius: 10 }} />
                )}
                {item.status === 'uploading' && (
                  <View style={styles.mediaOverlay}>
                      <ActivityIndicator color="#fff" size="small" />
                      <Text style={{color:'#fff', fontSize:10, marginTop: 4}}>{item.media_progress}%</Text>
                  </View>
                )}
                {item.media_failed && (
                  // ✅ HARDENING: Pass correct local_media_uri (fallback to content) and media_type
                  <TouchableOpacity style={styles.mediaOverlay} onPress={() => handleSendMedia(item.local_media_uri || item.content, item.media_type || 'image')}>
                      <Ionicons name="refresh" size={24} color="#fff" />
                  </TouchableOpacity>
                )}
             </View>
          ) : (
             <Text style={[styles.messageText, { color: isMe ? '#fff' : colors.text }]}>{item.content}</Text>
          )}
          <View style={styles.metaRow}>
            <Text style={[styles.timestamp, { color: isMe ? 'rgba(255,255,255,0.7)' : colors.subText }]}>
              {new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </Text>
            {isMe && <View style={{marginLeft: 4}}>{renderTicks()}</View>}
          </View>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top', 'left', 'right']}>
      <View style={[styles.header, { borderColor: colors.border, height: HEADER_HEIGHT }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
          <TouchableOpacity style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }} onPress={() => router.push(`/profile/${username}`)}>
            {targetProfile?.avatar ? (
              <Image source={{ uri: targetProfile.avatar }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatarPlaceholder, { backgroundColor: colors.border }]}><Ionicons name="person" size={20} color={colors.subText} /></View>
            )}
            <View>
              <Text style={[styles.headerTitle, { color: colors.text }]}>{username}</Text>
              
              {isTyping ? (
                <Text style={[styles.headerStatusTyping, { color: colors.tint }]}>typing...</Text>
              ) : (
                <Text style={[
                    styles.headerStatus, 
                    { color: colors.subText },
                    (isNetworkChecked && isConnected && isUserOnline) && { color: '#4caf50', fontWeight: 'bold' }
                ]}>
                  {!isNetworkChecked 
                    ? 'Connecting...' 
                    : isConnected 
                        ? (isUserOnline ? 'Online' : 'Offline') 
                        : 'Waiting for network...'} 
                </Text>
              )}
            </View>
          </TouchableOpacity>
        </View>
        <View style={{ flexDirection: 'row', gap: 15, alignItems: 'center' }}>
            <TouchableOpacity onPress={handleClearChat}><Ionicons name="trash-outline" size={22} color={colors.danger} /></TouchableOpacity>
            {targetProfile?.id && <CallHeaderButton targetId={targetProfile.id} isVideo={false} />}
        </View>
      </View>
      
      <KeyboardWrapper headerHeight={HEADER_HEIGHT}>
        <FlatList
          style={{ flex: 1 }}
          ref={flatListRef}
          data={messages}
          renderItem={renderMessage}
          keyExtractor={(item) => item.client_id} 
          contentContainerStyle={styles.messagesList}
          onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
          onLayout={() => flatListRef.current?.scrollToEnd({ animated: false })}
          ListFooterComponent={<View style={{ height: 10 }} />}
        />
        <View style={[styles.inputContainer, { backgroundColor: colors.background, borderColor: colors.border, paddingBottom: Math.max(insets.bottom, 12) }]}>
          <TouchableOpacity onPress={pickMedia} style={{ padding: 8, marginRight: 4 }}><Ionicons name="add-circle-outline" size={28} color={colors.tint} /></TouchableOpacity>
          <TextInput
            style={[styles.input, { backgroundColor: colors.card, color: colors.text }]}
            placeholder="Message..."
            placeholderTextColor={colors.subText}
            value={text}
            onChangeText={handleTyping}
            multiline
            textAlignVertical="center" 
          />
          <TouchableOpacity onPress={handleSend} disabled={!text.trim()} style={styles.sendBtn}>
            <Ionicons name="send" size={24} color={text.trim() ? colors.tint : colors.subText} />
          </TouchableOpacity>
        </View>
      </KeyboardWrapper>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 10, borderBottomWidth: 1 },
  headerTitle: { fontSize: 16, fontWeight: 'bold' },
  headerStatus: { fontSize: 12 },
  headerStatusTyping: { fontSize: 12, fontWeight: 'bold' },
  avatar: { width: 36, height: 36, borderRadius: 18, marginRight: 10 },
  avatarPlaceholder: { width: 36, height: 36, borderRadius: 18, marginRight: 10, justifyContent: 'center', alignItems: 'center' },
  messagesList: { padding: 16 },
  messageRow: { marginBottom: 12, maxWidth: '75%' },
  messageRowLeft: { alignSelf: 'flex-start' },
  messageRowRight: { alignSelf: 'flex-end' },
  bubble: { padding: 12, borderRadius: 18 },
  messageText: { fontSize: 15, marginBottom: 4 },
  metaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', marginTop: 2 },
  timestamp: { fontSize: 10 },
  inputContainer: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingTop: 10, borderTopWidth: 1 },
  input: { flex: 1, borderRadius: 20, paddingHorizontal: 16, paddingTop: Platform.OS === 'ios' ? 12 : 10, paddingBottom: Platform.OS === 'ios' ? 12 : 10, marginRight: 10, maxHeight: 100, fontSize: 16 },
  sendBtn: { padding: 4 },
  mediaOverlay: { position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', borderRadius: 10 }
});