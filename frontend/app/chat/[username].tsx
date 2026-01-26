import { 
  View, Text, FlatList, TextInput, TouchableOpacity, StyleSheet, 
  Platform, DeviceEventEmitter, Image, Alert, ActivityIndicator, BackHandler
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
  getUser, saveUser, getConversationId, Message,
  deleteMessagesByClientIds // ✅ Use Soft Delete
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
import ImageViewer from '../../components/ImageViewer'; 

export default function ChatScreen() {
  const params = useLocalSearchParams<{ username: string }>();
  const rawParam = Array.isArray(params.username) ? params.username[0] : params.username || "";
  
  const router = useRouter();
  const { user } = useAuth();
  const insets = useSafeAreaInsets(); 
  const { isDark } = useTheme();
  const colors = isDark ? Colors.dark : Colors.light;

  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const dragSelecting = useRef(false);

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
  
  const [viewerVisible, setViewerVisible] = useState(false);
  const [viewerImages, setViewerImages] = useState<{uri:string}[]>([]);
  const [viewerIndex, setViewerIndex] = useState(0);

  const flatListRef = useRef<FlatList>(null);
  const typingTimeout = useRef<any>(null);
  const lastTypingSent = useRef<number>(0);
  const HEADER_HEIGHT = 60;

  const conversationId = useMemo(() => {
    return getConversationId(user?.username || '', targetUsername);
  }, [user?.username, targetUsername]);

  useEffect(() => {
    setActiveConversationId(conversationId);
    return () => setActiveConversationId(null);
  }, [conversationId]);

  useEffect(() => {
    let isMounted = true;
    setMessages([]); 
    
    const initChat = async () => {
      loadLocalMessages();
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

  useEffect(() => {
    if (!ws || ws.readyState !== WebSocket.OPEN || !targetProfile?.id) return;
    if (isConnected) ws.send(JSON.stringify({ command: 'join_room', recipient_id: targetProfile.id}));
    return () => {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ command: 'leave_room' }));
    };
  }, [targetProfile, ws, isConnected]); 

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

  // Handle Hardware Back Button
  useEffect(() => {
    const backAction = () => {
      if (selectionMode) {
        clearSelection();
        return true;
      }
      return false;
    };
    const backHandler = BackHandler.addEventListener('hardwareBackPress', backAction);
    return () => backHandler.remove();
  }, [selectionMode]);

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

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const clearSelection = () => {
    setSelectionMode(false);
    setSelectedIds(new Set());
  };

  // ✅ UPDATED: Delete Logic (Soft Delete Locally)
  const handleDeleteSelected = () => {
    const selectedMsgs = messages.filter(m => selectedIds.has(m.client_id));
    const clientIds = selectedMsgs.map(m => m.client_id);

    const isMe = (m: Message) => m.sender === user?.username;
    const isRecent = (m: Message) => {
        const sentTime = new Date(m.timestamp).getTime();
        const sixHoursAgo = Date.now() - (6 * 60 * 60 * 1000);
        return sentTime > sixHoursAgo;
    };

    const canDeleteForEveryone = selectedMsgs.every(m => isMe(m) && isRecent(m));

    const performLocalDelete = () => {
        deleteMessagesByClientIds(clientIds); // Soft Delete
        setMessages(prev => prev.filter(m => !selectedIds.has(m.client_id))); // Update UI
        clearSelection();
    };

    const buttons: any[] = [
        { text: "Cancel", style: "cancel" },
        { 
            text: "Delete for Me", 
            onPress: async () => {
                performLocalDelete();
                api.post('/chat/delete/self/', { client_ids: clientIds }).catch(() => {});
            }
        }
    ];

    if (canDeleteForEveryone) {
        buttons.push({
            text: "Delete for Everyone",
            style: 'destructive',
            onPress: async () => {
                performLocalDelete(); 
                api.post('/chat/delete/global/', { client_ids: clientIds }).catch(() => {});
            }
        });
    }

    Alert.alert("Delete Message?", canDeleteForEveryone ? "You can delete this for everyone or just yourself." : "This will delete the message from your device only.", buttons);
  };

  const handleForwardSelected = () => {
    const selectedMessages = messages.filter(m => selectedIds.has(m.client_id));
    const imageUrls = selectedMessages.filter(m => m.media_type === 'image').map(m => m.media as string);
    const textMessages = selectedMessages.filter(m => !m.media_type).map(m => m.content);
  
    if (imageUrls.length > 0) {
      setViewerImages(imageUrls.map(u => ({ uri: u })));
      setViewerVisible(true);
    }

    if (textMessages.length > 0) {
      Alert.alert("Forward text?", `${textMessages.length} text messages selected`, [{ text: "OK" }]);
    }
    clearSelection();
  };

  const pickMedia = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true, 
      selectionLimit: 10,
      quality: 0.8,
    });
    if (!result.canceled) {
      handleSendMedia(result.assets);
    }
  };

  const handleForwardMedia = async (imageUris: string[], targetUsers: string[]) => {
      try {
          let successCount = 0;
          for (let i = 0; i < targetUsers.length; i++) {
              const rawTarget = targetUsers[i];
              let cleanTarget = rawTarget;
              if (rawTarget.includes('__') && user?.username) {
                  const parts = rawTarget.split('__');
                  cleanTarget = parts.find(p => p !== user.username) || rawTarget;
              }

              let targetId = null;
              const userObj = getUser(cleanTarget) as any;
              if (userObj?.id) {
                  targetId = userObj.id;
              } else {
                  try {
                      const res = await api.get(`/auth/api/profile/${cleanTarget}/`);
                      targetId = res.data?.id;
                  } catch (e) { continue; }
              }

              if (!targetId) continue;

              for (const imgUrl of imageUris) {
                  const cleanUrl = imgUrl.startsWith('http') ? imgUrl : `${BASE_URL}${imgUrl}`;
                  const ciphertext = encryptMessage(cleanUrl);
                  const clientId = generateUUID();

                  sendMessage(targetId, ciphertext, clientId);

                  if (cleanTarget === targetUsername) {
                      const optimisticMsg: Message = {
                          id: null, client_id: clientId, conversation_id: conversationId, recipient_id: targetId,
                          sender: user?.username || '', content: cleanUrl, status: 'sending',
                          timestamp: new Date().toISOString(), media: cleanUrl, media_type: 'image',
                          // @ts-ignore
                          media_progress: 100, media_failed: false
                      };
                      saveMessage(optimisticMsg);
                      setMessages(prev => [...prev, optimisticMsg]);
                  }
              }
              successCount++;
          }
          if (successCount > 0) Alert.alert("Success", "Images forwarded!");
      } catch (e) {
          Alert.alert("Error", "Forward failed.");
      }
  };

  const handleSendMedia = async (assets: ImagePicker.ImagePickerAsset[]) => {
    if (!targetProfile?.id) return;
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

        UploadManager.add({
            id: clientId, files: [{ uri: processed.uri, type: 'image' }], 
            endpoint: `${BASE_URL}/chat/upload/`, headers: { 'Authorization': `Bearer ${token}` },
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
    const images = messages
      .filter(m => m.media_type === 'image')
      .map(m => ({ uri: m.media!.startsWith('http') ? m.media! : `${BASE_URL}${m.media}` }));

    const index = images.findIndex(i => i.uri === url);
    setViewerImages(images);
    setViewerIndex(index === -1 ? 0 : index);
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

  const groupedMessages = useMemo(() => {
    const groups: any[] = [];
    let buffer: any[] = [];
    messages.forEach(msg => {
      if (msg.media_type === 'image') { buffer.push(msg); } 
      else {
        if (buffer.length) { groups.push([...buffer]); buffer = []; }
        groups.push([msg]);
      }
    });
    if (buffer.length) groups.push(buffer);
    return groups;
  }, [messages]);

  const renderSingleMessage = (item: any) => {
    const isMe = item.sender === user?.username;
    const isSelected = selectedIds.has(item.client_id);
    
    let mediaUri = item.media || item.content;
    if (!mediaUri || typeof mediaUri !== 'string') mediaUri = "";
    if (mediaUri.startsWith('/media/')) { mediaUri = `${BASE_URL}${mediaUri}`; }

    const isMedia = item.media_type === 'image' || mediaUri.startsWith('file://') || /\.(jpg|jpeg|png|gif|webp|bmp)$/i.test(mediaUri);

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
        <TouchableOpacity
          activeOpacity={0.9}
          onLongPress={() => { setSelectionMode(true); toggleSelect(item.client_id); }}
          onPressIn={() => { if (selectionMode && !dragSelecting.current) { dragSelecting.current = true; toggleSelect(item.client_id); } }}
          onPressOut={() => { dragSelecting.current = false; }}
        >
          <View style={[
              styles.bubble, 
              isMe ? { backgroundColor: colors.tint } : { backgroundColor: isDark ? '#2c2c2e' : '#efefef' },
              isSelected && { borderWidth: 2, borderColor: colors.tint },
            ]}
          >
            {isMedia ? (
               <View>
                  <TouchableOpacity onPress={() => openImage(mediaUri)}>
                      <Image source={{ uri: mediaUri }} style={styles.mediaImage} resizeMode="cover"/>
                  </TouchableOpacity>
                  {item.status === 'uploading' && <View style={styles.mediaOverlay}><ActivityIndicator color="#fff" size="small" /></View>}
                  {(item.media_failed || item.status === 'failed') && (
                    <TouchableOpacity style={styles.mediaOverlay} onPress={() => handleSendMedia([{ uri: item.content } as any])}>
                        <Ionicons name="refresh" size={24} color="#fff" />
                    </TouchableOpacity>
                  )}
               </View>
            ) : ( <Text style={[styles.messageText, { color: isMe ? '#fff' : colors.text }]}>{item.content}</Text> )}
            
            <View style={styles.metaRow}>
              <Text style={[styles.timestamp, { color: isMe ? 'rgba(255,255,255,0.7)' : colors.subText }]}>{new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
              {isMe && <View style={{marginLeft: 4}}>{renderTicks()}</View>}
            </View>
            {isSelected && <View style={styles.selectionTickContainer}><Ionicons name="checkmark-circle" size={20} color={colors.tint} /></View>}
          </View>
        </TouchableOpacity>
      </View>
    );
  };

  const renderMessage = ({ item }: { item: Message[] }) => {
    if (item.length > 1 && item[0].media_type === 'image') {
      return (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 12, justifyContent: item[0].sender === user?.username ? 'flex-end' : 'flex-start' }}>
          {item.map((m, i) => {
            const isSelected = selectedIds.has(m.client_id);
            return (
              <TouchableOpacity 
                key={i} 
                onPress={() => openImage(m.media!)}
                onLongPress={() => { setSelectionMode(true); toggleSelect(m.client_id); }}
                onPressIn={() => { if (selectionMode && !dragSelecting.current) { dragSelecting.current = true; toggleSelect(m.client_id); } }}
                onPressOut={() => { dragSelecting.current = false; }}
                style={{ position: 'relative' }} 
              >
                <Image source={{ uri: m.media! }} style={[styles.mediaImage, { width: 100, height: 100, margin: 2 }, isSelected && { borderWidth: 2, borderColor: colors.tint }]} />
                {isSelected && <View style={styles.selectionTickContainer}><Ionicons name="checkmark-circle" size={20} color={colors.tint} /></View>}
              </TouchableOpacity>
            )
          })}
        </View>
      );
    }
    return renderSingleMessage(item[0]);
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top', 'left', 'right']}>
      <View style={[styles.header, { borderColor: colors.border, height: HEADER_HEIGHT }]}>
        {selectionMode ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
            <TouchableOpacity onPress={clearSelection}><Ionicons name="close" size={24} color={colors.text} /></TouchableOpacity>
            <Text style={{ marginLeft: 12, fontWeight: 'bold', color: colors.text, fontSize: 18 }}>{selectedIds.size}</Text>
            <View style={{ flexDirection: 'row', marginLeft: 'auto', gap: 18 }}>
              <TouchableOpacity onPress={handleForwardSelected}><Ionicons name="arrow-redo-outline" size={22} color={colors.text} /></TouchableOpacity>
              <TouchableOpacity onPress={handleDeleteSelected}><Ionicons name="trash-outline" size={22} color={colors.danger} /></TouchableOpacity>
            </View>
          </View>
        ) : (
          <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
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
        )}
      </View>
      <KeyboardWrapper headerHeight={HEADER_HEIGHT}>
        <FlatList ref={flatListRef} data={groupedMessages} renderItem={renderMessage} keyExtractor={(item) => item.map(m => m.client_id).join('_')} contentContainerStyle={styles.messagesList} onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })} onLayout={() => flatListRef.current?.scrollToEnd({ animated: false })} ListFooterComponent={<View style={{ height: 10 }} />} />
        <View style={[styles.inputContainer, { backgroundColor: colors.background, borderColor: colors.border, paddingBottom: Math.max(insets.bottom, 12) }]}>
          <TouchableOpacity onPress={pickMedia} style={{ padding: 8, marginRight: 4 }}><Ionicons name="add-circle-outline" size={28} color={colors.tint} /></TouchableOpacity>
          <TextInput style={[styles.input, { backgroundColor: colors.card, color: colors.text }]} placeholder="Message..." placeholderTextColor={colors.subText} value={text} onChangeText={handleTyping} multiline textAlignVertical="center" />
          <TouchableOpacity onPress={handleSend} disabled={!text.trim()} style={styles.sendBtn}><Ionicons name="send" size={24} color={text.trim() ? colors.tint : colors.subText} /></TouchableOpacity>
        </View>
      </KeyboardWrapper>
      <ImageViewer visible={viewerVisible} images={viewerImages} index={viewerIndex} onClose={() => setViewerVisible(false)} onForward={handleForwardMedia} />
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
  bubble: { padding: 12, borderRadius: 18, overflow: 'hidden' }, 
  messageText: { fontSize: 15, marginBottom: 4 },
  metaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', marginTop: 2 },
  timestamp: { fontSize: 10 },
  inputContainer: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingTop: 10, borderTopWidth: 1 },
  input: { flex: 1, borderRadius: 20, paddingHorizontal: 16, paddingTop: Platform.OS === 'ios' ? 12 : 10, paddingBottom: Platform.OS === 'ios' ? 12 : 10, marginRight: 10, maxHeight: 100, fontSize: 16 },
  sendBtn: { padding: 4 },
  mediaImage: { width: 200, height: 200, borderRadius: 10 },
  mediaOverlay: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', borderRadius: 10 },
  selectionTickContainer: { position: 'absolute', bottom: 4, right: 4, backgroundColor: '#fff', borderRadius: 12, zIndex: 10, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.2, shadowRadius: 1, elevation: 2 },
});