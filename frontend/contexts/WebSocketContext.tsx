import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { DeviceEventEmitter, AppState } from 'react-native';
import * as Notifications from 'expo-notifications';
import { getSecure } from '../utils/storage';
import { BASE_URL } from '../utils/api';
import { initDB, saveMessage, updateMessageStatus } from '../utils/db';
import { decryptMessage } from '../utils/crypto';
import { useAuth } from '../context/AuthContext';
import { syncPendingMessages, resendStuckMessages } from '../utils/sync'; 
import { processOfflineQueue, clearOfflineQueue } from '../utils/offlineQueue'; 
import { registerForPushNotificationsAsync } from '../utils/pushNotifications'; 

interface WebSocketContextType {
  ws: WebSocket | null;
  isConnected: boolean;
  sendMessage: (targetId: string, ciphertext: string, clientId: string) => void;
  sendReadSignal: (targetUser: string) => void;
  sendTypingSignal: (targetUser: string) => void;
}

const WebSocketContext = createContext<WebSocketContextType>({ 
  ws: null, 
  isConnected: false, 
  sendMessage: () => {}, 
  sendReadSignal: () => {},
  sendTypingSignal: () => {} 
});

export const useWebSocket = () => useContext(WebSocketContext);

export const WebSocketProvider = ({ children }: { children: React.ReactNode }) => {
  const { user, userToken } = useAuth(); // Need user for filtering own messages
  const [ws, setWs] = useState<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  
  const wsRef = useRef<WebSocket | null>(null);
  const pingInterval = useRef<any>(null);
  const reconnectTimeout = useRef<any>(null);
  const appState = useRef(AppState.currentState);

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
        // Run safety checks once on mount
        resendStuckMessages().then(() => processOfflineQueue());
        syncPendingMessages();
    } else {
        cleanup();
    }

    const subscription = AppState.addEventListener('change', nextAppState => {
      if (appState.current.match(/inactive|background/) && nextAppState === 'active') {
        if (userToken) {
             console.log('🟢 App Foreground: Ensuring connection...');
             connect(); 
        }
      } 
      // else if (nextAppState.match(/inactive|background/)) {
      //   console.log('🔴 App Background: Pausing Socket...');
      //   if (wsRef.current) {
      //       wsRef.current.close();
      //       wsRef.current = null;
      //       setIsConnected(false);
      //   }
      // }
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
    
    console.log("🔌 Connecting WS...");
    const socket = new WebSocket(wsUrl);
    wsRef.current = socket;

    socket.onopen = () => {
      console.log('✅ WebSocket Connected');
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

        // Filter own messages echoes
        if (data.sender === user?.username && data.type === 'chat_message') return;

        if (data.type === 'message_ack') {
            updateMessageStatus(data.client_id, 'sent');
            return;
        }
        if (data.type === 'chat_message') {
          const decryptedContent = decryptMessage(data.ciphertext);
          
          saveMessage({
            id: data.id.toString(),
            client_id: data.client_id,
            conversation_id: data.sender,
            sender: data.sender,
            content: decryptedContent,
            status: 'delivered',
            timestamp: data.timestamp,
            is_own: false
          });

          socket.send(JSON.stringify({ command: 'ack_delivery', message_id: data.id }));
          DeviceEventEmitter.emit('new_message', { conversation_id: data.sender });
        }

        if (data.type === 'status_update') {
          if (data.client_id) updateMessageStatus(data.client_id, data.status);
          DeviceEventEmitter.emit('message_status_changed', data);
        }
        
        if (data.type === 'user_status_event') DeviceEventEmitter.emit('presence_update', data);
        if (data.type === 'typing_event') DeviceEventEmitter.emit('typing_event', data);

        if (data.type === 'new_message_notification') {
          await Notifications.scheduleNotificationAsync({
            content: {
              title: data.sender,
              body: "Sent you a message", 
              data: { url: `/chat/${data.sender}` }, 
            },
            trigger: null, 
          });
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

  const sendMessage = (targetId: string, ciphertext: string, clientId: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        command: 'send_message',
        recipient_id: targetId, 
        ciphertext: ciphertext,
        client_id: clientId
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
    <WebSocketContext.Provider value={{ ws, isConnected, sendMessage, sendReadSignal, sendTypingSignal }}>
      {children}
    </WebSocketContext.Provider>
  );
};