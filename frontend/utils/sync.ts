import api from './api';
import { saveMessage } from './db';
import { decryptMessage } from './crypto';
import { DeviceEventEmitter, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const LAST_SYNC_KEY = 'connect_last_msg_id_v1';

export const syncPendingMessages = async () => {
  try {
    console.log("📥 Checking for pending messages...");

    // 1. Get the Last ID we successfully synced
    let lastId = 0;
    if (Platform.OS === 'web') {
        lastId = parseInt(localStorage.getItem(LAST_SYNC_KEY) || '0');
    } else {
        const stored = await AsyncStorage.getItem(LAST_SYNC_KEY);
        lastId = stored ? parseInt(stored) : 0;
    }

    // 2. Ask Server: "Give me everything AFTER this ID"
    const response = await api.get(`/chat/sync/?after_id=${lastId}`);
    const { messages, count, last_id } = response.data;

    if (count === 0) {
      console.log("✅ No new messages.");
      return;
    }

    console.log(`📥 Downloading ${count} new messages...`);

    for (const msg of messages) {
      const plainText = decryptMessage(msg.ciphertext);
      saveMessage({
        id: msg.id.toString(),
        client_id: msg.client_id,
        conversation_id: msg.sender,
        sender: msg.sender,
        content: plainText,
        status: 'delivered',
        timestamp: msg.timestamp,
        is_own: false
      });
    }

    // 3. Save the new "High Score" (ID) so we don't fetch these again
    if (last_id > 0) {
        if (Platform.OS === 'web') {
            localStorage.setItem(LAST_SYNC_KEY, last_id.toString());
        } else {
            await AsyncStorage.setItem(LAST_SYNC_KEY, last_id.toString());
        }
    }

    DeviceEventEmitter.emit('new_message', { count });
    console.log("✅ Sync complete.");

  } catch (error) {
    console.error("❌ Sync Failed:", error);
  }
};

// ... keep syncServerInbox as is ...







// Syncs the Inbox List (Previews)
export const syncServerInbox = async () => {
  try {
    const response = await api.get('/chat/inbox/');
    const serverInbox = response.data;

    for (const entry of serverInbox) {
      if (entry.last_message) {
        const plainText = decryptMessage(entry.last_message);
        saveMessage({
          id: `preview_${entry.id}`, 
          client_id: `preview_${entry.id}`, 
          conversation_id: entry.username,
          sender: entry.username,
          content: plainText,
          status: 'delivered',
          timestamp: entry.last_message_time,
          is_own: false 
        });
      }
    }
    return serverInbox;
  } catch (error) {
    console.error("Inbox Sync Failed:", error);
    return [];
  }
};