import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { Alert, Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { getSecure } from '../utils/storage';
import { BASE_URL } from '../utils/api';
import { registerForPushNotificationsAsync, sendPushTokenToBackend } from '../utils/pushNotifications';

interface WebSocketContextType {
  ws: WebSocket | null;
  isConnected: boolean;
}

const WebSocketContext = createContext<WebSocketContextType>({ ws: null, isConnected: false });

export const useWebSocket = () => useContext(WebSocketContext);

export const WebSocketProvider = ({ children }: { children: React.ReactNode }) => {
  const [ws, setWs] = useState<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const reconnectTimeout = useRef<NodeJS.Timeout>();
  const wsRef = useRef<WebSocket | null>(null);

  const connect = async () => {
    try {
      const token = await getSecure('accessToken');
      if (!token) return;

      // Close existing connection
      if (wsRef.current) {
        wsRef.current.close();
      }

      const protocol = BASE_URL.startsWith('https') ? 'wss' : 'ws';
      const wsUrl = `${protocol}://${BASE_URL.replace(/^https?:\/\//, '')}/ws/unified/?token=${token}`;
      
      const socket = new WebSocket(wsUrl);
      wsRef.current = socket;

      socket.onopen = () => {
        console.log('Global WebSocket connected');
        setIsConnected(true);
      };

      socket.onmessage = (e) => {
        const data = JSON.parse(e.data);
        if (data.type === 'notification') {
          console.log('📩 New message from:', data.sender, '-', data.message);
          if (Platform.OS === 'web') {
            if (Notification.permission === 'granted') {
              new Notification(`New message from ${data.sender}`, { body: data.message });
            }
          } else {
            Alert.alert(`New message from ${data.sender}`, data.message);
          }
        }
      };

      socket.onerror = () => setIsConnected(false);

      socket.onclose = () => {
        console.log('Global WebSocket closed');
        setIsConnected(false);
        wsRef.current = null;
        reconnectTimeout.current = setTimeout(connect, 3000);
      };

      setWs(socket);
    } catch (error) {
      console.error('WebSocket connection error:', error);
    }
  };

  useEffect(() => {
    if (Platform.OS === 'web' && typeof Notification !== 'undefined' && Notification.permission === 'default') {
      Notification.requestPermission();
    }
    
    // Register for push notifications
    registerForPushNotificationsAsync().then(token => {
      if (token) sendPushTokenToBackend(token);
    });

    // Handle notification received while app is open
    const subscription = Notifications.addNotificationReceivedListener(notification => {
      console.log('Notification received:', notification);
    });

    connect();
    return () => {
      subscription.remove();
      if (reconnectTimeout.current) clearTimeout(reconnectTimeout.current);
      if (ws) ws.close();
    };
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      (window as any).globalWs = ws;
    }
  }, [ws]);

  return (
    <WebSocketContext.Provider value={{ ws, isConnected }}>
      {children}
    </WebSocketContext.Provider>
  );
};
