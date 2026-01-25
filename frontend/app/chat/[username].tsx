import { 
  View, Text, FlatList, TextInput, TouchableOpacity, StyleSheet, 
  Platform, DeviceEventEmitter, Image, Alert, ActivityIndicator, Dimensions
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { Ionicons } from '@expo/vector-icons';
import api, { BASE_URL } from '../../utils/api'; 
import * as ImagePicker from 'expo-image-picker'; 

import { useWebSocket } from '../../contexts/WebSocketContext';
import { encryptMessage } from '../../utils/crypto';
import { 
  saveMessage, getMessagesForChat, markChatAsRead, 
  deleteLocalChat, generateUUID, addToQueue,
  getUser, saveUser, getConversationId, Message 
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
import { ImageViewer } from '../../components/ImageViewer'; 

export default function ChatScreen() {
  const params = useLocalSearchParams<{ username: string }>();
  const rawParam = Array.isArray(params.username) ? params.username[0] : params.username || "";
  
  const router = useRouter();
  const { user } = useAuth();
  const insets = useSafeAreaInsets(); 
  const { isDark } = useTheme();
  const colors = isDark ? Colors.dark : Colors.light;

  // 1. EXTRACT REAL USERNAME
  const targetUsername = useMemo(() => {
     if (rawParam.includes('__') && user?.username) {
         const parts = rawParam.split('__');
         return parts.find((p: string) => p !== user.username) || rawParam;
     }
     return rawParam;
  }, [rawParam, user?.username]);

  const { sendMessage, sendReadSignal, sendTypingSignal, ws, setActiveConversationId } = useWebSocket();
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState('');
  const [targetProfile, setTargetProfile] = useState<any>(null); 
  const [isTyping, setIsTyping] = useState(false);
  const [isUserOnline, setIsUserOnline] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  
  // Viewer State
  const [viewerVisible, setViewerVisible] = useState(false);
  const [viewerImages, setViewerImages] = useState<{uri:string}[]>([]);
  const [viewerIndex, setViewerIndex] = useState(0);

  const flatListRef = useRef<FlatList>(null);
  const typingTimeout = useRef<any>(null);
  const lastTypingSent = useRef<number>(0);
  const HEADER_HEIGHT = 60;

  // 2. GENERATE CANONICAL ID 
  const conversationId = useMemo(() => {
    return getConversationId(user?.username || '', targetUsername);
  }, [user?.username, targetUsername]);

  // Track active chat for Read Receipts
  useEffect(() => {
    setActiveConversationId(conversationId);
    return () => setActiveConversationId(null);
  }, [conversationId]);

  useEffect(() => {
    let isMounted = true;
    setMessages([]); 
    
    const initChat = async () => {
      // Load cache
      loadLocalMessages();
      
      // Get Profile
      const cachedUser = getUser(targetUsername);
      if (cachedUser) setTargetProfile(cachedUser);
      await fetchTargetProfile();
      
      const net = await NetInfo.fetch();
      if (isMounted) setIsConnected(net.isConnected ?? false);
      if (net.isConnected) {
        const synced = await syncChatMessages(targetUsername);
        if (isMounted && synced) loadLocalMessages();
      }
      
      markChatAsRead(conversationId, user?.username || '');
      sendReadSignal(targetUsername);
    };

    initChat();
    
    const unsubscribeNet = NetInfo.addEventListener(state => {
      if (isMounted) setIsConnected(state.isConnected ?? false);
    });
    return () => { isMounted = false; unsubscribeNet(); };
  }, [targetUsername, conversationId]);

  // WebSocket
  useEffect(() => {
    if (!ws || ws.readyState !== WebSocket.OPEN || !targetProfile?.id) return;
    if (isConnected) ws.send(JSON.stringify({ command: 'join_room', recipient_id: targetProfile.id}));
    return () => {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ command: 'leave_room' }));
    };
  }, [targetProfile, ws, isConnected]); 

  // Listeners
  useEffect(() => {
    const msgListener = DeviceEventEmitter.addListener('new_message', (event) => {
      if (event.conversation_id === conversationId) loadLocalMessages();
    });
    const statusListener = DeviceEventEmitter.addListener('message_status_changed', () => loadLocalMessages());
    const typingListener = DeviceEventEmitter.addListener('typing_event', (event) => {
      if (event.sender === targetUsername) {
        setIsTyping(true);
        if (typingTimeout.current) clearTimeout(typingTimeout.current);
        typingTimeout.current = setTimeout(() => setIsTyping(false), 3000);
      }
    });
    const presenceListener = DeviceEventEmitter.addListener('presence_update', (data) => {
      if (data.username === targetUsername || data.user_id === targetProfile?.id) setIsUserOnline(data.is_online);
    });
    return () => { msgListener.remove(); statusListener.remove(); typingListener.remove(); presenceListener.remove(); };
  }, [targetUsername, targetProfile, conversationId]);

  const fetchTargetProfile = async () => {
    try {
      const res = await api.get(`/auth/api/profile/${targetUsername}/`);
      setTargetProfile(res.data);
      saveUser(res.data); 
      if (res.data.is_online !== undefined) setIsUserOnline(res.data.is_online);
    } catch (e) { console.log("Error fetching profile", e); }
  };

  const loadLocalMessages = useCallback(() => {
    const msgs = getMessagesForChat(conversationId);
    // @ts-ignore
    setMessages(msgs);
  }, [conversationId]);

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
      mediaTypes: ImagePicker.MediaTypeOptions.Images, // Restricted to Images
      allowsMultipleSelection: true, 
      selectionLimit: 10,
      quality: 0.8,
    });
    if (!result.canceled) {
      handleSendMedia(result.assets); // Send array of assets
    }
  };

  // ✅ FIXED: Handle Forwarding (Share) logic with Type Safety
  const handleForwardMedia = async (imageUris: string[], targetUsers: string[]) => {
      try {
          let successCount = 0;

          // Loop through every user
          for (const targetUser of targetUsers) {
              
              // 1. Get ID (Check cache then API)
              let targetId = null;
              const userObj = getUser(targetUser) as any;
              
              if (userObj?.id) {
                  targetId = userObj.id;
              } else {
                  try {
                      const res = await api.get(`/auth/api/profile/${targetUser}/`);
                      targetId = res.data?.id;
                  } catch (e) {
                      console.log(`Failed to resolve user ${targetUser}`);
                      continue;
                  }
              }

              if (!targetId) continue;

              // 2. Loop through every image for this user
              for (const imgUrl of imageUris) {
                  // Normalize URL
                  const cleanUrl = imgUrl.startsWith('http') ? imgUrl : `${BASE_URL}${imgUrl}`;
                  const ciphertext = encryptMessage(cleanUrl);
                  
                  // Send via API (Robust)
                  await api.post(`/chat/send/`, {
                      recipient_id: targetId,
                      ciphertext: ciphertext,
                      client_id: generateUUID()
                  });
              }
              successCount++;
          }

      } catch (e) {
          console.error("Forward failed", e);
          Alert.alert("Error", "Some forwards failed.");
      }
  };

  // ✅ FIXED: Updated to support Array input and UploadManager.files format
  const handleSendMedia = async (assets: ImagePicker.ImagePickerAsset[]) => {
    if (!targetProfile?.id) return;
    
    // Process all images
    for (const asset of assets) {
        const processed = await processMedia(asset.uri, 'image');
        const clientId = generateUUID();
        const recipientId = targetProfile.id;
        const token = await getSecure('accessToken');

        const optimisticMsg: Message = {
            id: null, client_id: clientId, conversation_id: conversationId, recipient_id: recipientId,
            sender: user?.username || '', content: processed.uri, status: 'uploading', 
            timestamp: new Date().toISOString(), media: processed.uri, media_type: 'image',
            // @ts-ignore
            media_progress: 0, media_failed: false
        };

        saveMessage(optimisticMsg); 
        setMessages(prev => [...prev, optimisticMsg]);

        // ✅ FIX: Use 'files' array instead of 'uri'
        UploadManager.add({
            id: clientId,
            files: [{ uri: processed.uri, type: 'image' }], 
            endpoint: `${BASE_URL}/chat/upload/`,
            headers: { 'Authorization': `Bearer ${token}` },
            additionalData: { id: clientId, recipient_id: recipientId },
        }, {
            onProgress: (p) => setMessages(prev => prev.map(m => m.client_id === clientId ? { ...m, media_progress: p } : m)),
            onSuccess: (res) => {
                const remoteUrl = res.media_url || res.url;
                const ciphertext = encryptMessage(remoteUrl);
                
                sendMessage(recipientId, ciphertext, clientId); 
                
                saveMessage({ ...optimisticMsg, content: remoteUrl, media: remoteUrl, status: 'sent' });
                setMessages(prev => prev.map(m => m.client_id === clientId ? { ...m, content: remoteUrl, media: remoteUrl, status: 'sent', media_progress: 100 } : m));
            },
            onError: () => {
                setMessages(prev => prev.map(m => m.client_id === clientId ? { ...m, media_failed: true, status: 'failed' } : m));
                saveMessage({ ...optimisticMsg, status: 'failed' });
            }
        });
    }
  };

  const openImage = (url: string) => {
      const fullUrl = url.startsWith('http') ? url : `${BASE_URL}${url}`;
      setViewerImages([{ uri: fullUrl }]);
      setViewerIndex(0);
      setViewerVisible(true);
  };

  const handleSend = async () => {
    if (!text.trim()) return;
    if (!targetProfile?.id) return;
    const clientId = generateUUID();
    const ciphertext = encryptMessage(text);
    const recipientId = targetProfile.id; 

    const msg: Message = {
      id: null, client_id: clientId, conversation_id: conversationId, recipient_id: recipientId, 
      sender: user?.username || '', content: text, status: 'sending', timestamp: new Date().toISOString(), 
    };
    saveMessage(msg); loadLocalMessages(); setText('');
    
    const net = await NetInfo.fetch();
    if (!net.isConnected || ws?.readyState !== WebSocket.OPEN) {
        addToQueue('SEND_MESSAGE', { conversation_id: conversationId, recipient_id: recipientId, ciphertext, client_id: clientId });
    } else {
        sendMessage(recipientId, ciphertext, clientId);
    }
  };

  const handleClearChat = () => {
      Alert.alert("Clear Chat?", "Delete local history?", [
          { text: "Cancel", style: "cancel" },
          { text: "Delete", style: "destructive", onPress: async () => {
              deleteLocalChat(conversationId); setMessages([]); api.post(`/chat/clear/${targetUsername}/`).catch(() => {}); } 
          }
      ]);
  };

  const renderMessage = ({ item }: { item: any }) => {
    const isMe = item.sender === user?.username;
    let mediaUri = item.media || item.content;
    if (typeof mediaUri === 'string' && mediaUri.startsWith('/media/')) mediaUri = `${BASE_URL}${mediaUri}`;
    const isMedia = item.media_type === 'image' || (typeof item.content === 'string' && item.content.startsWith('file://'));

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
                <TouchableOpacity onPress={() => openImage(mediaUri)}>
                    <Image source={{ uri: mediaUri }} style={styles.mediaImage} resizeMode="cover"/>
                </TouchableOpacity>
                {item.status === 'uploading' && <View style={styles.mediaOverlay}><ActivityIndicator color="#fff" size="small" /></View>}
                {/* ✅ FIX: Pass array to handleSendMedia for retry 
                   We wrap the single failed item in an array to match the new signature
                */}
                {(item.media_failed || item.status === 'failed') && (
                  <TouchableOpacity 
                    style={styles.mediaOverlay} 
                    onPress={() => handleSendMedia([{ uri: item.content } as any])}
                  >
                      <Ionicons name="refresh" size={24} color="#fff" />
                  </TouchableOpacity>
                )}
             </View>
          ) : ( <Text style={[styles.messageText, { color: isMe ? '#fff' : colors.text }]}>{item.content}</Text> )}
          <View style={styles.metaRow}>
            <Text style={[styles.timestamp, { color: isMe ? 'rgba(255,255,255,0.7)' : colors.subText }]}>{new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
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
          <TouchableOpacity onPress={() => router.back()} style={{ marginRight: 10 }}><Ionicons name="arrow-back" size={24} color={colors.icon} /></TouchableOpacity>
          <TouchableOpacity style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }} onPress={() => router.push(`/profile/${targetUsername}`)}>
            {targetProfile?.avatar ? <Image source={{ uri: targetProfile.avatar }} style={styles.avatar} /> : <View style={[styles.avatarPlaceholder, { backgroundColor: colors.border }]}><Ionicons name="person" size={20} color={colors.subText} /></View>}
            <View>
              <Text style={[styles.headerTitle, { color: colors.text }]}>{targetUsername}</Text>
              {isTyping ? <Text style={[styles.headerStatusTyping, { color: colors.tint }]}>typing...</Text> : <Text style={[styles.headerStatus, { color: colors.subText }, (isConnected && isUserOnline) && { color: '#4caf50', fontWeight: 'bold' }]}>{!isConnected ? 'Waiting for network...' : (isUserOnline ? 'Online' : 'Offline')}</Text>}
            </View>
          </TouchableOpacity>
        </View>
        <View style={{ flexDirection: 'row', gap: 15, alignItems: 'center' }}>
            <TouchableOpacity onPress={handleClearChat}><Ionicons name="trash-outline" size={22} color={colors.danger} /></TouchableOpacity>
            {targetProfile?.id && <CallHeaderButton targetId={targetProfile.id} isVideo={false} targetName={targetUsername} />}
        </View>
      </View>
      <KeyboardWrapper headerHeight={HEADER_HEIGHT}>
        <FlatList ref={flatListRef} data={messages} renderItem={renderMessage} keyExtractor={(item) => item.client_id || item.id || Math.random().toString()} contentContainerStyle={styles.messagesList} onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })} onLayout={() => flatListRef.current?.scrollToEnd({ animated: false })} ListFooterComponent={<View style={{ height: 10 }} />}/>
        <View style={[styles.inputContainer, { backgroundColor: colors.background, borderColor: colors.border, paddingBottom: Math.max(insets.bottom, 12) }]}>
          <TouchableOpacity onPress={pickMedia} style={{ padding: 8, marginRight: 4 }}><Ionicons name="add-circle-outline" size={28} color={colors.tint} /></TouchableOpacity>
          <TextInput style={[styles.input, { backgroundColor: colors.card, color: colors.text }]} placeholder="Message..." placeholderTextColor={colors.subText} value={text} onChangeText={handleTyping} multiline textAlignVertical="center" />
          <TouchableOpacity onPress={handleSend} disabled={!text.trim()} style={styles.sendBtn}><Ionicons name="send" size={24} color={text.trim() ? colors.tint : colors.subText} /></TouchableOpacity>
        </View>
      </KeyboardWrapper>

      <ImageViewer 
        visible={viewerVisible} 
        images={viewerImages} 
        index={viewerIndex} 
        onClose={() => setViewerVisible(false)}
        onForward={handleForwardMedia} 
      />
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
  mediaImage: { width: 200, height: 200, borderRadius: 10 },
  videoPlaceholder: { width: 200, height: 200, borderRadius: 10, justifyContent: 'center', alignItems: 'center', backgroundColor: '#000' },
  mediaOverlay: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', borderRadius: 10 }
});