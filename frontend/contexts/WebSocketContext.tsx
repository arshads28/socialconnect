import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { DeviceEventEmitter, AppState } from 'react-native';
import { getSecure } from '../utils/storage';
import { BASE_URL } from '../utils/api';
import { 
  initDB, 
  saveMessage, 
  updateMessageStatus, 
  markChatAsRead, 
  getConversationId,
  deleteMessagesByClientIds, 
  Message 
} from '../utils/db';
import { decryptMessage } from '../utils/crypto';
import { useAuth } from '../context/AuthContext';
import { syncPendingMessages, resendStuckMessages } from '../utils/sync'; 
import { processOfflineQueue, clearOfflineQueue } from '../utils/offlineQueue'; 
import { registerForPushNotificationsAsync } from '../utils/pushNotifications'; 
import Toast from 'react-native-toast-message';

interface WebSocketContextType {
  ws: WebSocket | null;
  isConnected: boolean;
  sendMessage: (targetId: string, ciphertext: string, clientId: string, albumId?: string) => void;
  sendReadSignal: (targetUser: string) => void;
  sendTypingSignal: (targetUser: string) => void;
  setActiveConversationId: (id: string | null) => void;
}

const WebSocketContext = createContext<WebSocketContextType>({ 
  ws: null, 
  isConnected: false, 
  sendMessage: () => {}, 
  sendReadSignal: () => {},
  sendTypingSignal: () => {},
  setActiveConversationId: () => {} 
});

export const useWebSocket = () => useContext(WebSocketContext);

export const WebSocketProvider = ({ children }: { children: React.ReactNode }) => {
  const { user, userToken } = useAuth(); 
  
  const [ws, setWs] = useState<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  
  //  Track which chat is open on screen
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const activeConversationIdRef = useRef<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const pingInterval = useRef<any>(null);
  const reconnectTimeout = useRef<any>(null);
  const appState = useRef(AppState.currentState);

  // 0. Sync State to Ref
  useEffect(() => {
    activeConversationIdRef.current = activeConversationId;
  }, [activeConversationId]);

  // 1. REGISTER PUSH
  useEffect(() => {
    if (userToken) registerForPushNotificationsAsync();
  }, [userToken]);

  // 2. CLEAR QUEUE ON LOGOUT
  useEffect(() => {
    const sub = DeviceEventEmitter.addListener('auth_session_expired', () => {
      clearOfflineQueue(); 
      cleanup(); 
    });
    return () => sub.remove();
  }, []);

  // 3. MAIN CONNECTION LOGIC
  useEffect(() => {
    initDB();

    if (userToken) {
        connect();
        resendStuckMessages().then(() => processOfflineQueue());
        syncPendingMessages();
    } else {
        cleanup();
    }

    const subscription = AppState.addEventListener('change', nextAppState => {
      if (appState.current.match(/inactive|background/) && nextAppState === 'active') {
        if (userToken) {
             console.log(' App Foreground: Ensuring connection...');
             connect(); 
        }
      } 
      appState.current = nextAppState;
    });

    return () => {
      subscription.remove();
      cleanup();
    };
  }, [userToken]);

  const cleanup = () => {
    if (pingInterval.current) clearInterval(pingInterval.current);
    if (reconnectTimeout.current) clearTimeout(reconnectTimeout.current);
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setIsConnected(false);
    setWs(null);
  };

  const connect = async () => {
    if (wsRef.current && (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING)) {
        return;
    }

    const token = await getSecure('accessToken');
    if (!token) return;

    const protocol = BASE_URL.startsWith('https') ? 'wss' : 'ws';
    const cleanUrl = BASE_URL.replace(/^https?:\/\//, '').replace(/\/$/, '');
    const wsUrl = `${protocol}://${cleanUrl}/ws/unified/?token=${token}`;
    
    console.log(" Connecting WS...", wsUrl);
    const socket = new WebSocket(wsUrl);
    wsRef.current = socket;

    socket.onopen = () => {
      console.log(' WebSocket Connected');
      setIsConnected(true);
      setWs(socket);
      
      if (pingInterval.current) clearInterval(pingInterval.current);
      pingInterval.current = setInterval(() => {
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({ command: 'ping' }));
        }
      }, 30000); 
    };

    socket.onmessage = async (e) => {
      try {
        const data = JSON.parse(e.data);

        //  Filter echoes
        if (data.sender === user?.username && data.type === 'chat_message') return;

        //  Handle Server Acknowledgment
        if (data.type === 'message_ack') {
            updateMessageStatus(data.client_id, 'sent');
            return;
        }

        //  Handle Incoming Chat Message
        if (data.type === 'chat_message') {
          const decryptedContent = decryptMessage(data.ciphertext);
          
          let conversationId = data.conversation_id;
          
          if (!conversationId || conversationId === 'unknown') {
              conversationId = getConversationId(user?.username || '', data.sender);
          }

          // Save to DB
          saveMessage({
            client_id: data.client_id,
            id: data.id.toString(),
            conversation_id: conversationId, 
            sender: data.sender,
            recipient_id: user?.username || '',
            content: decryptedContent,
            status: 'delivered', 
            timestamp: data.timestamp || new Date().toISOString(),
            media: data.media,
            media_type: data.media_type,
          });

          //  Send Delivery Receipt
          if (socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ command: 'ack_delivery', message_id: data.id }));
          }

          // ⚡ Check Read Status
          const isActiveChat = activeConversationIdRef.current === conversationId;

          if (isActiveChat) {
            markChatAsRead(conversationId, user?.username || '');
          } 

          // Update Legacy Listeners
          DeviceEventEmitter.emit('new_message', { conversation_id: conversationId });
        }

        //  Handle Deleted Messages
        if (data.type === 'messages_deleted') {
            console.log("🗑️ Received Delete Signal:", data.client_ids);
            deleteMessagesByClientIds(data.client_ids);
            DeviceEventEmitter.emit('messages_deleted_event', data.client_ids);
        }

        //  Handle Status Updates
        if (data.type === 'status_update') {
          if (data.client_id) {
            updateMessageStatus(data.client_id, data.status);
          }
          DeviceEventEmitter.emit('message_status_changed', data);
        }
        
        // Handle Presence / Typing
        if (data.type === 'user_status_event') DeviceEventEmitter.emit('presence_update', data);
        if (data.type === 'typing_event') DeviceEventEmitter.emit('typing_event', data);

        //  Handle Notifications
        if (data.type === 'new_message_notification') {
          const notifConvId = data.conversation_id || getConversationId(user?.username || '', data.sender);
          
          // Only show in-app alert if we are NOT in that chat
          if (activeConversationIdRef.current !== notifConvId) {
              Toast.show({
                type: 'info',
                text1: data.sender,
                text2: 'Sent you a message',
                position: 'top',
                visibilityTime: 4000,
              });
          }
        }

      } catch (err) {
        console.warn("WS Parse Error", err);
      }
    };

    socket.onclose = () => {
      setIsConnected(false);
      setWs(null);
      wsRef.current = null;
      if (AppState.currentState === 'active' && userToken) {
          reconnectTimeout.current = setTimeout(connect, 3000);
      }
    };
  };

  const sendMessage = (targetId: string, ciphertext: string, clientId: string, albumId?: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        command: 'send_message',
        recipient_id: targetId, 
        ciphertext: ciphertext,
        client_id: clientId,
        album_id: albumId 
      }));
    }
  };

  const sendReadSignal = (targetUser: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ command: 'mark_read', sender: targetUser }));
    }
  };

  const sendTypingSignal = (targetUser: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ command: 'typing' }));
    }
  };

  return (
    <WebSocketContext.Provider value={{ 
      ws, 
      isConnected, 
      sendMessage, 
      sendReadSignal, 
      sendTypingSignal,
      setActiveConversationId
    }}>
      {children}
    </WebSocketContext.Provider>
  );
};