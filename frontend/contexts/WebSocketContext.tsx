import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { DeviceEventEmitter, Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { getSecure } from '../utils/storage';
import { BASE_URL } from '../utils/api';
import { initDB, saveMessage, updateMessageStatus } from '../utils/db';
import { decryptMessage } from '../utils/crypto';
import { useAuth } from '../context/AuthContext';
import { syncPendingMessages } from '../utils/sync';

// 1. CONFIG: Allow notifications to show even when app is open (WhatsApp Style)
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,  
  }),
});

interface WebSocketContextType {
  ws: WebSocket | null;
  isConnected: boolean;
  sendMessage: (targetUser: string, text: string, clientId: string) => void;
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
  const { user, userToken } = useAuth();
  const [ws, setWs] = useState<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const pingInterval = useRef<any>(null);
  const reconnectTimeout = useRef<any>(null);

  useEffect(() => {
    initDB();
    if (userToken) {
      connect();
    } else {
      cleanup();
    }
    return () => cleanup();
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
    // Prevent multiple connections
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const token = await getSecure('accessToken');
    if (!token) return;

    const protocol = BASE_URL.startsWith('https') ? 'wss' : 'ws';
    const cleanUrl = BASE_URL.replace(/^https?:\/\//, '');
    const wsUrl = `${protocol}://${cleanUrl}/ws/unified/?token=${token}`;
    
    const socket = new WebSocket(wsUrl);
    wsRef.current = socket;

    socket.onopen = () => {
      console.log('✅ Global WebSocket connected');
      setIsConnected(true);
      setWs(socket);
      syncPendingMessages();
      if (pingInterval.current) clearInterval(pingInterval.current);
      
      pingInterval.current = setInterval(() => {
        if (socket.readyState === WebSocket.OPEN) {
          console.log("💓 Sending Ping...");
          socket.send(JSON.stringify({ command: 'ping' }));
        }
      }, 30000); 
    };

    socket.onmessage = async (e) => {
      try {
        const data = JSON.parse(e.data);

        // If I sent this message, ignore it (I already have it locally).
        if (data.sender === user?.username) return; 

        // 1. INCOMING CHAT MESSAGE
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

          DeviceEventEmitter.emit('new_message', { conversation_id: data.sender });
        }

        // 2. STATUS UPDATE
        if (data.type === 'status_update') {
          if (data.client_id) updateMessageStatus(data.client_id, data.status);
          DeviceEventEmitter.emit('message_status_changed', data);
        }
        
        // 3. PRESENCE / TYPING
        if (data.type === 'user_status_event') DeviceEventEmitter.emit('presence_update', data);
        if (data.type === 'typing_event') DeviceEventEmitter.emit('typing_event', data);

        // 4. SYSTEM NOTIFICATION
        // If the server tells us to notify (because we are outside the chat room)
        if (data.type === 'new_message_notification') {
          await Notifications.scheduleNotificationAsync({
            content: {
              title: data.sender,
              body: "Sent you a message", 
              // This 'url' data allows _layout.tsx to redirect you when tapped
              data: { url: `/chat/${data.sender}` }, 
            },
            trigger: null, // Show immediately
          });
        }

      } catch (err) {
        console.warn("WS Parse Error", err);
      }
    };

    socket.onclose = () => {
      setIsConnected(false);
      setWs(null);
      reconnectTimeout.current = setTimeout(() => {
        if (userToken) connect();
      }, 3000);
    };
  };

  const sendMessage = (targetUser: string, ciphertext: string, clientId: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        command: 'send_message',
        message: 'blob',
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