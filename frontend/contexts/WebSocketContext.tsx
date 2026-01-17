import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { DeviceEventEmitter } from 'react-native';
import { getSecure } from '../utils/storage';
import { BASE_URL } from '../utils/api';
import { initDB, saveMessage, updateMessageStatus } from '../utils/db';
import { decryptMessage } from '../utils/crypto';
import { useAuth } from '../context/AuthContext';
import { syncPendingMessages } from '../utils/sync';

interface WebSocketContextType {
  ws: WebSocket | null;
  isConnected: boolean;
  sendMessage: (targetUser: string, text: string, clientId: string) => void;
  sendSeen: (targetUser: string) => void;
}

const WebSocketContext = createContext<WebSocketContextType>({ 
  ws: null, isConnected: false, sendMessage: () => {}, sendSeen: () => {} 
});

export const useWebSocket = () => useContext(WebSocketContext);

export const WebSocketProvider = ({ children }: { children: React.ReactNode }) => {
  const { userToken } = useAuth(); // ✅ Get Token from Auth Context
  const [ws, setWs] = useState<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const pingInterval = useRef<any>(null);

  // Only connect when userToken is ready
  useEffect(() => {
    initDB();
    
    if (userToken) {
      connect();
    } else {
      // Cleanup if logged out
      if (wsRef.current) wsRef.current.close();
      setIsConnected(false);
    }

    return () => {
      if (pingInterval.current) clearInterval(pingInterval.current);
      if (wsRef.current) wsRef.current.close();
    };
  }, [userToken]); 

  const connect = async () => {
    // Double check token from storage to be safe
    const token = await getSecure('accessToken');
    if (!token) return;

    const protocol = BASE_URL.startsWith('https') ? 'wss' : 'ws';
    const wsUrl = `${protocol}://${BASE_URL.replace(/^https?:\/\//, '')}/ws/unified/?token=${token}`;
    
    const socket = new WebSocket(wsUrl);
    wsRef.current = socket;

    socket.onopen = () => {
      console.log('✅ Global WebSocket connected');
      setIsConnected(true);
      
      // TRIGGER SYNC: Download missed messages immediately
      syncPendingMessages();

      pingInterval.current = setInterval(() => {
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({ command: 'ping' }));
        }
      }, 20000);
    };

    socket.onmessage = async (e) => {
      const data = JSON.parse(e.data);

      // INCOMING MESSAGE
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

      // STATUS UPDATE
      if (data.type === 'status_update') {
        updateMessageStatus(data.client_id, data.status);
        DeviceEventEmitter.emit('message_status_changed', data);
      }
      
      // PRESENCE UPDATE (Real-time Online/Offline)
      if (data.type === 'user_status_event') {
         DeviceEventEmitter.emit('presence_update', data);
      }
    };

    socket.onclose = () => {
      console.log('❌ WebSocket Disconnected');
      setIsConnected(false);
      // Only reconnect if we still have a token
      if (userToken) setTimeout(connect, 3000); 
    };

    setWs(socket);
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

  const sendSeen = (targetUser: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ command: 'mark_seen' }));
    }
  };

  return (
    <WebSocketContext.Provider value={{ ws, isConnected, sendMessage, sendSeen }}>
      {children}
    </WebSocketContext.Provider>
  );
};