import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { 
  View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet, 
  DeviceEventEmitter, Image, Alert, BackHandler, Animated, Easing, Platform
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import api, { BASE_URL } from '../../utils/api'; 
import * as ImagePicker from 'expo-image-picker'; 
import * as Clipboard from 'expo-clipboard';

import { saveToGallery, getCachedFile, saveBatchToGallery } from '../../utils/mediaCache';
import { processMedia } from '../../utils/mediaProcessor';

import { WaveformLive } from '../../components/AudioComponents';
import { useAudioRecorder } from '../../utils/useAudioRecorder';
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
import UploadManager from '../../utils/UploadManager';
import ImageViewer from '../../components/ImageViewer'; 
import { MessageBubble, ChatMessageList, AlbumMessage, AlbumDetailModal } from '../../components/chat/ChatComponents';
import { createStyles } from '../../components/chat/Chat.styles';

export default function ChatScreen() {
  const params = useLocalSearchParams<{ username: string }>();
  const rawParam = Array.isArray(params.username) ? params.username[0] : params.username || "";
  
  const router = useRouter();
  const { user } = useAuth();
  const insets = useSafeAreaInsets(); 
  const { isDark } = useTheme();
  
  const colors = isDark ? Colors.dark : Colors.light;
  const extendedColors = useMemo(() => ({ ...colors, isDark }), [colors, isDark]);
  const styles = useMemo(() => createStyles(colors, insets), [colors, insets]);

  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const dragSelecting = useRef(false);

  // Undo / Delete State
  const [undoState, setUndoState] = useState<{ visible: boolean, ids: string[], scope: 'self' | 'global' | null, timer: any }>({ visible: false, ids: [], scope: null, timer: null });
  const slideAnimX = useRef(new Animated.Value(-150)).current; 
  const slideAnimY = useRef(new Animated.Value(-80)).current;
  const undoProgress = useRef(new Animated.Value(0)).current; 
  const deletedCacheRef = useRef<Message[]>([]);
  const pendingDeleteRef = useRef<{ ids: string[], scope: 'self' | 'global' } | null>(null);

  const { isRecording, recordedUri, recordDuration, setRecordedUri, onMicPressIn, onMicMove, stopRecording, cancelRecording } = useAudioRecorder();

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
  
  // Viewer States
  const [viewerVisible, setViewerVisible] = useState(false);
  const [viewerImages, setViewerImages] = useState<{uri:string}[]>([]);
  const [viewerIndex, setViewerIndex] = useState(0);

  //lbum Feed States (Level 2)
  const [albumModalVisible, setAlbumModalVisible] = useState(false);
  const [albumImages, setAlbumImages] = useState<any[]>([]); 
  const [albumInitialIndex, setAlbumInitialIndex] = useState(0);

  const flatListRef = useRef<FlatList>(null);
  const typingTimeout = useRef<any>(null);
  const lastTypingSent = useRef<number>(0);
  const HEADER_HEIGHT = 60;

  const conversationId = useMemo(() => {
    return getConversationId(user?.username || '', targetUsername);
  }, [user?.username, targetUsername]);

  useEffect(() => { setActiveConversationId(conversationId); return () => setActiveConversationId(null); }, [conversationId]);

  // Exit Trap
  useEffect(() => {
    return () => {
      if (pendingDeleteRef.current) {
        const { ids, scope } = pendingDeleteRef.current;
        deleteMessagesByClientIds(ids); 
        const endpoint = scope === 'self' ? '/chat/delete/self/' : '/chat/delete/global/';
        api.post(endpoint, { client_ids: ids }).catch(() => {});
      }
      cancelRecording(); 
    };
  }, []);

  useEffect(() => {
    const backAction = () => {
      if (selectionMode) { clearSelection(); return true; }
      if (albumModalVisible) { setAlbumModalVisible(false); return true; }
      return false;
    };
    const backHandler = BackHandler.addEventListener('hardwareBackPress', backAction);
    return () => backHandler.remove();
  }, [selectionMode, albumModalVisible]);

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

  // Init Logic
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
      if (net.isConnected && user?.username) {
        const synced = await syncChatMessages(targetUsername, user.username);
        if (isMounted && synced) loadLocalMessages();
      }
      markChatAsRead(conversationId, user?.username || '');
      sendReadSignal(targetUsername);
    };
    initChat();
    const unsubscribeNet = NetInfo.addEventListener(state => { if (isMounted) setIsConnected(state.isConnected ?? false); });
    return () => { isMounted = false; unsubscribeNet(); };
  }, [targetUsername, conversationId, user]);

  useEffect(() => {
    if (!ws || ws.readyState !== WebSocket.OPEN || !targetProfile?.id) return;
    if (isConnected) ws.send(JSON.stringify({ command: 'join_room', recipient_id: targetProfile.id}));
    return () => { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ command: 'leave_room' })); };
  }, [targetProfile, ws, isConnected]); 

  // Listeners
  useEffect(() => {
    const msgListener = DeviceEventEmitter.addListener('new_message', (event) => { if (event.conversation_id === conversationId) loadLocalMessages(); });
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

  const handleTyping = useCallback((val: string) => {
    setText(val);
    const now = Date.now();
    if (isConnected && val.length > 0 && (now - lastTypingSent.current > 2000) && targetProfile?.id) {
      sendTypingSignal(targetProfile.id);
      lastTypingSent.current = now;
    }
  }, [isConnected, targetProfile?.id]);

  const toggleSelect = useCallback((id: string) => {
    setSelectionMode(true);
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      if (next.size === 0) setSelectionMode(false);
      return next;
    });
  }, []);

  const handleSelectGroup = useCallback((group: Message[]) => {
    setSelectionMode(true);
    setSelectedIds(prev => {
        const next = new Set(prev);
        group.forEach(msg => next.add(msg.client_id));
        return next;
    });
  }, []);

  const clearSelection = useCallback(() => {
    setSelectionMode(false);
    setSelectedIds(new Set());
  }, []);

  // ... [Keep existing recording/undo functions] ...
  const sendVoiceMessage = async () => {
    if (!recordedUri || !targetProfile?.id) return;
    const clientId = generateUUID();
    const recipientId = targetProfile.id;
    const token = await getSecure('accessToken');
    const optimisticMsg: Message = {
      id: null, client_id: clientId, conversation_id: conversationId, recipient_id: recipientId,
      sender: user?.username || '', content: recordedUri, status: 'uploading',
      timestamp: Date.now(), media: recordedUri, media_type: 'audio', 
    };
    saveMessage(optimisticMsg); setMessages(prev => [...prev, optimisticMsg]); setRecordedUri(null);
    UploadManager.add({
      id: clientId, files: [{ uri: recordedUri, type: 'audio' as any }], 
      endpoint: `${BASE_URL}/chat/upload/`, headers: { Authorization: `Bearer ${token}` }, additionalData: { id: clientId, recipient_id: recipientId },
    }, {
      onSuccess: (res) => {
        const remoteUrl = res.media_url; const ciphertext = encryptMessage(remoteUrl);
        sendMessage(recipientId, ciphertext, clientId); saveMessage({ ...optimisticMsg, content: remoteUrl, media: remoteUrl, status: 'sent' });
      },
      onError: () => { saveMessage({ ...optimisticMsg, status: 'failed' }); }
    });
  };

  const triggerUndoSequence = (ids: string[], scope: 'self' | 'global') => {
      const msgsToDelete = messages.filter(m => ids.includes(m.client_id)); deletedCacheRef.current = msgsToDelete;
      setMessages(prev => prev.filter(m => !ids.includes(m.client_id))); clearSelection();
      if (undoState.timer) clearTimeout(undoState.timer); pendingDeleteRef.current = { ids, scope };
      const timer = setTimeout(() => { commitDelete(ids, scope); }, 4000);
      setUndoState({ visible: true, ids, scope, timer });
      Animated.parallel([
        Animated.timing(slideAnimX, { toValue: 0, duration: 300, useNativeDriver: true }),
        Animated.timing(slideAnimY, { toValue: 0, duration: 300, useNativeDriver: true }),
        Animated.timing(undoProgress, { toValue: 1, duration: 4000, easing: Easing.linear, useNativeDriver: false })
      ]).start();
  };

  const handleDeleteSelected = () => {
    const selectedMsgs = messages.filter(m => selectedIds.has(m.client_id)); const clientIds = selectedMsgs.map(m => m.client_id); const isMe = (m: Message) => m.sender === user?.username;
    const canDeleteForEveryone = selectedMsgs.every(m => {
        const sentTime = new Date(m.timestamp).getTime(); const sixHoursAgo = Date.now() - (6 * 60 * 60 * 1000);
        return isMe(m) && (sentTime > sixHoursAgo);
    });
    const buttons: any[] = [{ text: "Cancel", style: "cancel" }, { text: "Delete for Me", onPress: () => triggerUndoSequence(clientIds, 'self') }];
    if (canDeleteForEveryone) { buttons.push({ text: "Delete for Everyone", style: 'destructive', onPress: () => triggerUndoSequence(clientIds, 'global') }); }
    Alert.alert("Delete Message?", canDeleteForEveryone ? "Delete for everyone or just you?" : "Delete for you only?", buttons);
  };

  const commitDelete = useCallback((ids: string[], scope: 'self' | 'global') => {
      deleteMessagesByClientIds(ids); 
      if (scope === 'self') api.post('/chat/delete/self/', { client_ids: ids }).catch(console.log); else api.post('/chat/delete/global/', { client_ids: ids }).catch(console.log);
      pendingDeleteRef.current = null; deletedCacheRef.current = []; hideUndoSnackbar();
  }, []);

  const handleUndo = () => {
    if (undoState.timer) clearTimeout(undoState.timer); pendingDeleteRef.current = null; undoProgress.stopAnimation(); undoProgress.setValue(0);
    setMessages(prev => { const combined = [...prev, ...deletedCacheRef.current]; return combined.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()); });
    deletedCacheRef.current = []; hideUndoSnackbar();
  };

  const hideUndoSnackbar = () => {
    Animated.parallel([ Animated.timing(slideAnimX, { toValue: -150, duration: 300, useNativeDriver: true }), Animated.timing(slideAnimY, { toValue: -80, duration: 300, useNativeDriver: true }) ]).start(() => {
        setUndoState({ visible: false, ids: [], scope: null, timer: null }); undoProgress.setValue(0);
    });
  };

  const handleForwardSelected = () => {
    const validMessages = messages.filter(m => selectedIds.has(m.client_id) && !m.locally_deleted && m.content !== "__DELETED__");
    const imageUrls = validMessages.filter(m => m.media_type === 'image').map(m => m.media as string);
    const textMessages = validMessages.filter(m => !m.media_type).map(m => m.content);
    if (imageUrls.length > 0) { setViewerImages(imageUrls.map(u => ({ uri: u }))); setViewerVisible(true); }
    if (textMessages.length > 0) { Alert.alert("Forward text?", `${textMessages.length} text messages selected`, [{ text: "OK" }]); }
    clearSelection();
  };

  const handleCopySelected = async () => {
      const selectedMsgs = messages.filter(m => selectedIds.has(m.client_id) && !m.media_type && m.content !== "__DELETED__");
      if (selectedMsgs.length === 0) return;
      const textToCopy = selectedMsgs.map(m => m.content).join('\n');
      await Clipboard.setStringAsync(textToCopy);
      clearSelection();
  };

const handleCopySelection = async () => {
    const selectedMsgs = messages.filter(m => selectedIds.has(m.client_id));
    if (selectedMsgs.length === 0) return;
    const textToCopy = selectedMsgs
        .filter(m => m.content && !m.media_type)
        .map(m => m.content)
        .join('\n\n');

    if (!textToCopy) {
        Alert.alert("Nothing to Copy", "Selected messages contain no text.");
        return;
    }
    await Clipboard.setStringAsync(textToCopy);
    Alert.alert("Copied", "Text copied to clipboard.");
    clearSelection();
  };

  const handleDownloadSelected = async () => {
    const selectedMsgs = messages.filter(m => 
      selectedIds.has(m.client_id) && 
      (m.media_type === 'image' || m.media_type === 'video')
    );

    if (selectedMsgs.length === 0) return;

    const urisToSave: string[] = [];
    for (const msg of selectedMsgs) {
        const uri = msg.media || msg.content;
        if (uri) urisToSave.push(uri);
    }

    if (urisToSave.length === 0) return;

    try {
        const count = await saveBatchToGallery(urisToSave);
        
        if (count > 0) {
             Alert.alert("Success", `${count} items saved to 'Connect' album.`);
        } else {
             Alert.alert("Error", "No items could be saved.");
        }
    } catch (e: any) {
        Alert.alert("Error", "Failed to save media. Check permissions.");
    }

    clearSelection();
  };

  const pickMedia = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ 
      mediaTypes: ['images'] as any, 
      allowsMultipleSelection: true, 
      selectionLimit: 10, 
      quality: 0.8 
    });
    if (!result.canceled) handleSendMedia(result.assets);
  };

  const handleForwardMedia = useCallback(async (imageUris: string[], targetUsers: string[]) => {
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
                  try { const res = await api.get(`/auth/api/profile/${cleanTarget}/`); targetId = res.data?.id; } catch (e) { continue; }
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
                          timestamp: Date.now(), media: cleanUrl, media_type: 'image',
                      };
                      saveMessage(optimisticMsg);
                      setMessages(prev => [...prev, optimisticMsg]);
                  }
              }
              successCount++;
          }
          if (successCount > 0) Alert.alert("Success", "Images forwarded!");
      } catch (e) { Alert.alert("Error", "Forward failed."); }
  }, [user?.username, conversationId, targetUsername, sendMessage]);

const handleSendMedia = async (assets: ImagePicker.ImagePickerAsset[]) => {
    if (!targetProfile?.id) return;
    const albumId = assets.length > 1 ? generateUUID() : undefined;

    for (const asset of assets) {
        try {
            // Attempt Processing (Compress/Resize)
            const processed = await processMedia(asset.uri, 'image'); 
            
            const clientId = generateUUID(); 
            const recipientId = targetProfile.id; 
            const token = await getSecure('accessToken');

            // 2. Create Optimistic Message
            const optimisticMsg: Message = {
                id: null, client_id: clientId, conversation_id: conversationId, recipient_id: recipientId, 
                sender: user?.username || '', content: processed.uri, status: 'uploading', 
                timestamp: Date.now(), media: processed.uri, media_type: 'image', album_id: albumId, 
            };

            saveMessage(optimisticMsg); 
            setMessages(prev => [...prev, optimisticMsg]);

            UploadManager.add({
                id: clientId, 
                files: [{ uri: processed.uri, type: 'image' as any }], 
                endpoint: `${BASE_URL}/chat/upload/`, 
                headers: { 'Authorization': `Bearer ${token}` }, 
                additionalData: { id: clientId, recipient_id: recipientId, album_id: albumId }, 
            }, {
                onProgress: (p) => setMessages(prev => prev.map(m => m.client_id === clientId ? { ...m, media_progress: p } : m)),
                onSuccess: (res) => {
                    const remoteUrl = res.media_url || res.url; 
                    const ciphertext = encryptMessage(remoteUrl); 
                    sendMessage(recipientId, ciphertext, clientId, albumId); 
                    
                    saveMessage({ ...optimisticMsg, content: remoteUrl, media: remoteUrl, status: 'sent' }); 
                    setMessages(prev => prev.map(m => m.client_id === clientId ? { ...m, content: remoteUrl, media: remoteUrl, status: 'sent', media_progress: 100 } : m));
                },
                onError: () => { 
                    setMessages(prev => prev.map(m => m.client_id === clientId ? { ...m, media_failed: true, status: 'failed' } : m)); 
                    saveMessage({ ...optimisticMsg, status: 'failed' }); 
                }
            });

        } catch (e) {
            console.error("Media processing failed for:", asset.uri, e);
            Alert.alert("Error", "One or more images could not be processed.");
        }
    }
  };

  const openAlbumViewer = useCallback((images: Message[], clickedIndex: number) => {
    const formattedImages = images.map(m => {
        const rawUrl = m.media || m.content || "";
        if(!rawUrl) return null;
        const uri = rawUrl.startsWith('http') ? rawUrl : `${BASE_URL}${rawUrl}`;
        return { uri, client_id: m.client_id };
    }).filter(i => i !== null) as any[];

    if (formattedImages.length > 0) {
        setAlbumImages(formattedImages);
        setAlbumInitialIndex(clickedIndex);
        setAlbumModalVisible(true);
    }
  }, []);

  const openSingleImage = useCallback((url: string) => {
    if (!url) return;
    const rawUrl = url.startsWith('http') ? url : `${BASE_URL}${url}`;
    setViewerImages([{ uri: rawUrl }]);
    setViewerIndex(0);
    setViewerVisible(true);
  }, []);

  const handleSend = async () => {
    if (!text.trim()) return; if (!targetProfile?.id) return;
    const clientId = generateUUID(); const ciphertext = encryptMessage(text); const recipientId = targetProfile.id; 
    const msg: Message = { id: null, client_id: clientId, conversation_id: conversationId, recipient_id: recipientId, sender: user?.username || '', content: text, status: 'sending', timestamp: Date.now(), };
    saveMessage(msg); loadLocalMessages(); setText('');
    const net = await NetInfo.fetch();
    if (!net.isConnected || ws?.readyState !== WebSocket.OPEN) { addToQueue('SEND_MESSAGE', { conversation_id: conversationId, recipient_id: recipientId, ciphertext, client_id: clientId }); } else { sendMessage(recipientId, ciphertext, clientId); }
  };

  const handleClearChat = () => { Alert.alert("Clear Chat?", "Delete local history?", [{ text: "Cancel", style: "cancel" }, { text: "Delete", style: "destructive", onPress: async () => { deleteLocalChat(conversationId); setMessages([]); api.post(`/chat/clear/${targetUsername}/`).catch(() => {}); } }]); };

  // ... (Grouping & Rendering logic) ...
  const groupedMessages = useMemo(() => {
    const groups: any[] = []; 
    let buffer: Message[] = [];

    messages.forEach(msg => {
      if (msg.media_type === 'image') {
        if (buffer.length > 0) {
          const lastMsg = buffer[0];
          const isSameSender = lastMsg.sender === msg.sender;
          const isSameAlbum = (msg.album_id && lastMsg.album_id === msg.album_id) || 
                              (!msg.album_id && !lastMsg.album_id);
          if (isSameSender && isSameAlbum) { 
             buffer.push(msg); 
          } else { 
             groups.push(buffer); 
             buffer = [msg]; 
          }
        } else { 
          buffer.push(msg); 
        }
      } else { 
        if (buffer.length > 0) { 
            groups.push(buffer); 
            buffer = []; 
        } 
        groups.push([msg]); 
      }
    });

    if (buffer.length > 0) groups.push(buffer);
    return groups;
  }, [messages]);

  const renderMessage = useCallback(({ item }: { item: Message[] }) => {
    if (item.length > 1 && item[0].media_type === 'image') {
      return (
        <AlbumMessage 
          item={item}
          isMe={item[0].sender === user?.username}
          selectedIds={selectedIds}
          toggleSelect={toggleSelect}
          onSelectGroup={handleSelectGroup} 
          onOpenAlbum={(index: number) => openAlbumViewer(item, index)} 
          selectionMode={selectionMode}
          dragSelectingRef={dragSelecting}
          styles={styles}
          colors={extendedColors}
        />
      );
    }
    return (
      <MessageBubble 
        item={item[0]} 
        isMe={item[0].sender === user?.username}
        isSelected={selectedIds.has(item[0].client_id)}
        toggleSelect={toggleSelect}
        openImage={openSingleImage} 
        selectionMode={selectionMode}
        handleSendMedia={handleSendMedia}
        styles={styles}
        colors={extendedColors}
      />
    );
  }, [user?.username, selectedIds, selectionMode, extendedColors, styles, toggleSelect, openAlbumViewer, openSingleImage, handleSendMedia, handleSelectGroup]);

  // Check if any media is selected
  const hasMediaSelected = useMemo(() => {
      return messages.some(m => selectedIds.has(m.client_id) && (m.media_type === 'image' || m.media_type === 'video'));
  }, [selectedIds, messages]);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      {/* Header */}
      <View style={[styles.header, { height: HEADER_HEIGHT }]}>
        {selectionMode ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
            <TouchableOpacity onPress={clearSelection}><Ionicons name="close" size={24} color={colors.text} /></TouchableOpacity>
            <Text style={{ marginLeft: 12, fontWeight: 'bold', color: colors.text, fontSize: 18 }}>{selectedIds.size}</Text>
            
            <View style={{ flexDirection: 'row', marginLeft: 'auto', gap: 18 }}>
              {hasMediaSelected && (
                  <TouchableOpacity onPress={handleDownloadSelected}><Ionicons name="download-outline" size={22} color={colors.text} /></TouchableOpacity>
              )}
              <TouchableOpacity onPress={handleCopySelected}><Ionicons name="copy-outline" size={22} color={colors.text} /></TouchableOpacity>
              <TouchableOpacity onPress={handleForwardSelected}><Ionicons name="arrow-redo-outline" size={22} color={colors.text} /></TouchableOpacity>
              <TouchableOpacity onPress={handleDeleteSelected}><Ionicons name="trash-outline" size={22} color={colors.danger} /></TouchableOpacity>
            </View>
          </View>
        ) : (
          <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
             {/* ... Normal Header ... */}
             <TouchableOpacity onPress={() => router.back()} style={{ marginRight: 10 }}><Ionicons name="arrow-back" size={24} color={colors.icon} /></TouchableOpacity>
             <TouchableOpacity style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }} onPress={() => router.push(`/profile/${targetUsername}`)}>
               {targetProfile?.avatar ? <Image source={{ uri: targetProfile.avatar }} style={styles.avatar} /> : <View style={styles.avatarPlaceholder}><Ionicons name="person" size={20} color={colors.subText} /></View>}
               <View>
                 <Text style={styles.headerTitle}>{targetUsername}</Text>
                 {isTyping ? <Text style={styles.headerStatusTyping}>typing...</Text> : <Text style={[styles.headerStatus, (isConnected && isUserOnline) && styles.headerStatusOnline]}>{!isConnected ? 'Waiting for network...' : (isUserOnline ? 'Online' : 'Offline')}</Text>}
               </View>
             </TouchableOpacity>
             <View style={{ flexDirection: 'row', gap: 15, alignItems: 'center' }}>
                 <TouchableOpacity onPress={handleClearChat}><Ionicons name="trash-outline" size={22} color={colors.danger} /></TouchableOpacity>
                 {targetProfile?.id && <CallHeaderButton targetId={targetProfile.id} isVideo={false} targetName={targetUsername} />}
             </View>
          </View>
        )}
      </View>

      <KeyboardWrapper headerHeight={HEADER_HEIGHT}>
        <ChatMessageList groupedMessages={groupedMessages} renderMessage={renderMessage} flatListRef={flatListRef} styles={styles} />
        
        {/* Input */}
        <View style={styles.inputContainer}>
          {recordedUri ? (
            <View style={styles.recordingRow}>
              <TouchableOpacity onPress={cancelRecording} style={styles.cancelRecButton}><Ionicons name="trash" size={22} color={colors.danger} /></TouchableOpacity>
              <WaveformLive active={false} color={colors.tint} /><Text style={styles.recTimer}>{Math.floor(recordDuration / 60)}:{String(recordDuration % 60).padStart(2, '0')}</Text>
              <TouchableOpacity onPress={sendVoiceMessage} style={styles.sendRecButton}><Ionicons name="send" size={22} color="#fff" /></TouchableOpacity>
            </View>
          ) : isRecording ? (
            <View style={styles.recordingRow}>
              <WaveformLive active={true} color={colors.danger} /><Text style={[styles.recTimer, { color: colors.danger }]}>{Math.floor(recordDuration / 60)}:{String(recordDuration % 60).padStart(2, '0')}</Text>
              <Text style={{ color: colors.subText, fontStyle: 'italic', flex: 1, textAlign: 'center' }}>← Swipe to cancel</Text>
              <View onStartShouldSetResponder={() => true} onResponderRelease={stopRecording} onResponderMove={onMicMove} style={styles.recordingMicPulse}><Ionicons name="mic" size={26} color="#fff" /></View>
            </View>
          ) : (
            <>
              <TouchableOpacity onPress={pickMedia} style={{ padding: 8, marginRight: 4 }}><Ionicons name="add-circle-outline" size={28} color={colors.tint} /></TouchableOpacity>
              <TextInput style={styles.input} placeholder="Message..." placeholderTextColor={colors.subText} value={text} onChangeText={handleTyping} multiline textAlignVertical="center" />
              {text.trim() ? ( <TouchableOpacity onPress={handleSend} style={styles.sendBtn}><Ionicons name="send" size={24} color={colors.tint} /></TouchableOpacity> ) : ( <View onStartShouldSetResponder={() => true} onResponderGrant={onMicPressIn} onResponderRelease={stopRecording} onResponderMove={onMicMove} style={styles.sendBtn}><Ionicons name="mic-outline" size={26} color={colors.tint} /></View> )}
            </>
          )}
        </View>
      </KeyboardWrapper>
      
      <AlbumDetailModal 
        visible={albumModalVisible} 
        onClose={() => setAlbumModalVisible(false)} 
        images={albumImages} 
        initialIndex={albumInitialIndex} 
        onImagePress={openSingleImage} 
        selectedIds={selectedIds}
        toggleSelect={toggleSelect}
        colors={extendedColors}
        styles={styles} 
      />

      <ImageViewer visible={viewerVisible} images={viewerImages} index={viewerIndex} onClose={() => setViewerVisible(false)} onForward={handleForwardMedia} />
      {undoState.visible && (
        <Animated.View style={[ styles.undoSnackbar, { top: insets.top + 12, left: 12, right: undefined, transform: [{ translateX: slideAnimX }, { translateY: slideAnimY }] } ]}>
          <Text style={styles.undoText}>{undoState.ids.length} message{undoState.ids.length > 1 ? 's' : ''} deleted</Text>
          <TouchableOpacity onPress={handleUndo} style={{ padding: 4 }}><Text style={styles.undoButtonText}>UNDO</Text></TouchableOpacity>
          <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(255,255,255,0.1)', width: undoProgress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) }]} />
        </Animated.View>
      )}
    </SafeAreaView>
  );
}