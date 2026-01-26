import { 
  View, Text, FlatList, TextInput, TouchableOpacity, StyleSheet, 
  Platform, DeviceEventEmitter, Image, Alert, ActivityIndicator, BackHandler, Animated
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
  deleteMessagesByClientIds 
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

  // 1️⃣ REFS FOR SAFE UNDO & UNMOUNT TRAPS
  const [undoState, setUndoState] = useState<{ visible: boolean, ids: string[], scope: 'self' | 'global' | null, timer: any }>({
    visible: false, ids: [], scope: null, timer: null
  });
  const slideAnim = useRef(new Animated.Value(100)).current; 
  
  // Cache deleted messages so Undo doesn't jump the scroll view
  const deletedCacheRef = useRef<Message[]>([]);
  // Trap pending deletes in case user leaves the screen
  const pendingDeleteRef = useRef<{ ids: string[], scope: 'self' | 'global' } | null>(null);

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

  // CRITICAL FIX: The "Exit Trap" for unmounting
  useEffect(() => {
    return () => {
      // If user leaves screen while timer is running, commit instantly
      if (pendingDeleteRef.current) {
        console.log("Navigating away - forcing delete commit for:", pendingDeleteRef.current.ids);
        commitDelete(pendingDeleteRef.current.ids, pendingDeleteRef.current.scope);
      }
    };
  }, []);

  // Hardware Back Button
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

  useEffect(() => {
    const deleteListener = DeviceEventEmitter.addListener('messages_deleted_event', (deletedIds: string[]) => {
      setMessages(prev => prev.filter(msg => !deletedIds.includes(msg.client_id)));
      if (selectionMode) {
        const remainingSelection = new Set(selectedIds);
        deletedIds.forEach(id => remainingSelection.delete(id));
        setSelectedIds(remainingSelection);
        if (remainingSelection.size === 0) setSelectionMode(false);
      }
    });
    return () => deleteListener.remove();
  }, [selectionMode, selectedIds]); 

  // Init
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

  // WebSockets
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

  // TELEGRAM DELETE LOGIC
  const handleDeleteSelected = () => {
    const selectedMsgs = messages.filter(m => selectedIds.has(m.client_id));
    const clientIds = selectedMsgs.map(m => m.client_id);

    const isMe = (m: Message) => m.sender === user?.username;
    const canDeleteForEveryone = selectedMsgs.every(m => {
        const sentTime = new Date(m.timestamp).getTime();
        const sixHoursAgo = Date.now() - (6 * 60 * 60 * 1000);
        return isMe(m) && (sentTime > sixHoursAgo);
    });

    const triggerUndoSnackbar = (scope: 'self' | 'global') => {
        // Cache messages for smooth undo
        deletedCacheRef.current = selectedMsgs; 
        
        // Optimistic UI Removal
        setMessages(prev => prev.filter(m => !selectedIds.has(m.client_id))); 
        clearSelection();

        // Safe Reset
        if (undoState.timer) clearTimeout(undoState.timer);

        //EXIT TRAP: Assign to ref
        pendingDeleteRef.current = { ids: clientIds, scope };

        Animated.timing(slideAnim, { toValue: 0, duration: 300, useNativeDriver: true }).start();

        const timer = setTimeout(() => {
            commitDelete(clientIds, scope);
            hideUndoSnackbar();
        }, 6000);

        setUndoState({ visible: true, ids: clientIds, scope, timer });
    };

    const buttons: any[] = [
        { text: "Cancel", style: "cancel" },
        { text: "Delete for Me", onPress: () => triggerUndoSnackbar('self') }
    ];

    if (canDeleteForEveryone) {
        buttons.push({
            text: "Delete for Everyone",
            style: 'destructive',
            onPress: () => triggerUndoSnackbar('global')
        });
    }

    Alert.alert(
      "Delete Message?", 
      canDeleteForEveryone ? "You can delete this for everyone or just yourself." : "This will delete the message from your device only.", 
      buttons
    );
  };

  //CRITICAL FIX: DB operations ONLY happen here, not during Undo window
  const commitDelete = (ids: string[], scope: 'self' | 'global') => {
    deleteMessagesByClientIds(ids); 
    addToQueue('DELETE_MESSAGE', { client_ids: ids, scope }); 
    
    // Clear refs
    pendingDeleteRef.current = null;
    deletedCacheRef.current = [];
  };

  // CRITICAL FIX: Restore from Cache (No Scroll Jump)
  const handleUndo = () => {
    if (undoState.timer) clearTimeout(undoState.timer);
    pendingDeleteRef.current = null; // Cancel commit trap

    setMessages(prev => {
        const combined = [...prev, ...deletedCacheRef.current];
        return combined.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    });

    deletedCacheRef.current = [];
    hideUndoSnackbar();
  };

  const hideUndoSnackbar = () => {
    Animated.timing(slideAnim, { toValue: 100, duration: 300, useNativeDriver: true }).start(() => {
        setUndoState({ visible: false, ids: [], scope: null, timer: null });
    });
  };

  //  SECURE FORWARDING
  const handleForwardSelected = () => {
    // CRITICAL FIX: Do not forward deleted tombstones
    const validMessages = messages.filter(m => selectedIds.has(m.client_id) && !m.locally_deleted && m.content !== "__DELETED__");
    
    const imageUrls = validMessages.filter(m => m.media_type === 'image').map(m => m.media as string);
    const textMessages = validMessages.filter(m => !m.media_type).map(m => m.content);
  
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

  // ORIGINAL FORWARD
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
              if (userObj?.id) { targetId = userObj.id; } 
              else {
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

    // TYPED ALBUM ID GENERATION
    const albumId = assets.length > 1 ? generateUUID() : undefined;

    for (const asset of assets) {
        const processed = await processMedia(asset.uri, 'image');
        const clientId = generateUUID();
        const recipientId = targetProfile.id;
        const token = await getSecure('accessToken');

        const optimisticMsg: Message = {
            id: null, client_id: clientId, conversation_id: conversationId, recipient_id: recipientId,
            sender: user?.username || '', content: processed.uri, status: 'uploading', 
            timestamp: new Date().toISOString(), media: processed.uri, media_type: 'image',
            album_id: albumId, // ✅ Properly typed
            // @ts-ignore
            media_progress: 0, media_failed: false
        };

        saveMessage(optimisticMsg); 
        setMessages(prev => [...prev, optimisticMsg]);

        UploadManager.add({
            id: clientId, files: [{ uri: processed.uri, type: 'image' }], 
            endpoint: `${BASE_URL}/chat/upload/`, headers: { 'Authorization': `Bearer ${token}` },
            additionalData: { id: clientId, recipient_id: recipientId, album_id: albumId }, 
        }, {
            onProgress: (p) => setMessages(prev => prev.map(m => m.client_id === clientId ? { ...m, media_progress: p } : m)),
            onSuccess: (res) => {
                const remoteUrl = res.media_url || res.url;
                const ciphertext = encryptMessage(remoteUrl);
                // 5️⃣ CRITICAL FIX: Send album_id to WebSocket
                sendMessage(recipientId, ciphertext, clientId, albumId); 
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
      .filter(m => m.media_type === 'image' && (m.media || m.content))
      .map(m => {
        const rawUrl = m.media || m.content || ""; // Fallback to content
        return { uri: rawUrl.startsWith('http') ? rawUrl : `${BASE_URL}${rawUrl}` };
      });

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

  //  STABLE ALBUM GROUPING USING album_id
  const groupedMessages = useMemo(() => {
    const groups: any[] = [];
    const albums = new Map<string, Message[]>();
    let buffer: any[] = [];

    messages.forEach(msg => {
      if (msg.album_id) {
        if (!albums.has(msg.album_id)) albums.set(msg.album_id, []);
        albums.get(msg.album_id)!.push(msg);
      } else if (msg.media_type === 'image') {
        buffer.push(msg); 
      } else {
        if (buffer.length) { groups.push([...buffer]); buffer = []; }
        groups.push([msg]);
      }
    });
    if (buffer.length) groups.push(buffer);
    albums.forEach(v => groups.push(v));

    return groups.sort((a, b) => new Date(a[0].timestamp).getTime() - new Date(b[0].timestamp).getTime());
  }, [messages]);

  const renderSingleMessage = (item: any) => {
    const isMe = item.sender === user?.username;
    const isSelected = selectedIds.has(item.client_id);
    
    if (item.content === "__DELETED__") return null;

    let mediaUri = item.media || item.content;
    if (!mediaUri || typeof mediaUri !== 'string') mediaUri = "";
    if (mediaUri.startsWith('/media/')) { mediaUri = `${BASE_URL}${mediaUri}`; }

    if (!mediaUri && item.media_type === 'image') return null;

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
                  <TouchableOpacity onPress={() => selectionMode ? toggleSelect(item.client_id) : openImage(mediaUri)}>
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
    // Check if it's a multi-image album
    if (item.length > 1 && item[0].media_type === 'image') {
      const isMe = item[0].sender === user?.username;
      
      // TELEGRAM LOGIC: Max 4 photos visible.
      const DISPLAY_LIMIT = 4;
      const visibleItems = item.slice(0, DISPLAY_LIMIT);
      const overflowCount = item.length - DISPLAY_LIMIT;

      return (
        <View style={[
          styles.albumContainer, 
          isMe ? { alignSelf: 'flex-end', marginRight: 12 } : { alignSelf: 'flex-start', marginLeft: 12 }
        ]}>
          {visibleItems.map((m, i) => {
            const isSelected = selectedIds.has(m.client_id);
            const isLastVisible = i === DISPLAY_LIMIT - 1;
            
            const rawUrl = m.media || m.content || "";
            const fullUrl = rawUrl.startsWith('http') ? rawUrl : `${BASE_URL}${rawUrl}`;

            // Dynamic grid sizing (2x2 style)
            const isLarge = item.length === 3 && i === 0; // If 3 images, make the first one take full width

            return (
              <TouchableOpacity 
                key={i} 
                onPress={() => selectionMode ? toggleSelect(m.client_id) : openImage(fullUrl)}
                onLongPress={() => { setSelectionMode(true); toggleSelect(m.client_id); }}
                onPressIn={() => { if (selectionMode && !dragSelecting.current) { dragSelecting.current = true; toggleSelect(m.client_id); } }}
                onPressOut={() => { dragSelecting.current = false; }}
                style={[
                  styles.albumImageWrapper,
                  isLarge ? { width: '100%', height: 160 } : { width: '49%', height: 120 },
                  isSelected && { borderWidth: 2, borderColor: colors.tint }
                ]} 
              >
                <Image source={{ uri: fullUrl }} style={styles.albumImage} />
                
                {/* 🔢 TELEGRAM-STYLE COUNT OVERLAY */}
                {(isLastVisible && overflowCount > 0) && (
                  <View style={styles.overflowOverlay}>
                    <Text style={styles.overflowText}>+{overflowCount}</Text>
                  </View>
                )}

                {isSelected && <View style={styles.selectionTickContainer}><Ionicons name="checkmark-circle" size={20} color={colors.tint} /></View>}
              </TouchableOpacity>
            )
          })}
        </View>
      );
    }
    return renderSingleMessage(item[0]);
  };

  //  DYNAMIC INSETS FOR LAYOUT COLLISION (Keyboard vs Undo Bar)
  const safeBottom = useSafeAreaInsets().bottom;

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

      {/* Undo Snackbar with Safe Area layout protection */}
      {undoState.visible && (
        <Animated.View style={[styles.undoSnackbar, { bottom: 20 + (safeBottom > 0 ? safeBottom : 60), transform: [{ translateY: slideAnim }] }]}>
          <Text style={styles.undoText}>
            {undoState.ids.length} message{undoState.ids.length > 1 ? 's' : ''} deleted
          </Text>
          <TouchableOpacity onPress={handleUndo} style={styles.undoButton}>
            <Text style={styles.undoButtonText}>UNDO (6s)</Text>
          </TouchableOpacity>
        </Animated.View>
      )}

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
  
  undoSnackbar: {
    position: 'absolute',
    left: 20,
    right: 20,
    backgroundColor: '#323232',
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
    zIndex: 999
  },
  undoText: { color: '#fff', fontSize: 14, fontWeight: '500' },
  undoButton: { padding: 4 },
  undoButtonText: { color: '#4dabf7', fontWeight: 'bold', fontSize: 14 },
  
  albumContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    width: 250, // Fixed width to force the grid shape
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 12,
    gap: 2, // Space between images
  },
  albumImageWrapper: {
    position: 'relative',
    overflow: 'hidden',
  },
  albumImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  overflowOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  overflowText: {
    color: '#fff',
    fontSize: 24,
    fontWeight: 'bold',
  },
});