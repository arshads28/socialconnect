// socialconnect/frontend/utils/sync.ts
import api from './api';
import { saveMessage } from './db';
import { decryptMessage } from './crypto';
import { DeviceEventEmitter, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const LAST_SYNC_TS_KEY = 'connect_last_sync_ts_v1';

// ==============================================================================
// 1. GLOBAL SYNC (Background "Postman" fetch)
//    - Downloads ALL missed messages from ALL users.
// ==============================================================================
export const syncPendingMessages = async () => {
  try {
    console.log("📥 Checking for pending messages...");

    let lastSyncTime = null;
    if (Platform.OS === 'web') {
        lastSyncTime = localStorage.getItem(LAST_SYNC_TS_KEY);
    } else {
        lastSyncTime = await AsyncStorage.getItem(LAST_SYNC_TS_KEY);
    }

    const url = lastSyncTime 
        ? `/chat/sync/?last_sync=${encodeURIComponent(lastSyncTime)}` 
        : `/chat/sync/`;

    const response = await api.get(url);
    const { messages, count } = response.data;

    if (!messages || messages.length === 0) {
      console.log("✅ No new messages.");
      return;
    }

    console.log(`📥 Downloading ${count} new messages...`);

    let newestTimestamp = lastSyncTime; 

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

      if (!newestTimestamp || new Date(msg.timestamp) > new Date(newestTimestamp)) {
        newestTimestamp = msg.timestamp;
      }
    }

    if (newestTimestamp) {
        if (Platform.OS === 'web') {
            localStorage.setItem(LAST_SYNC_TS_KEY, newestTimestamp);
        } else {
            await AsyncStorage.setItem(LAST_SYNC_TS_KEY, newestTimestamp);
        }
    }

    DeviceEventEmitter.emit('new_message', { count });
    console.log("✅ Sync complete.");

  } catch (error) {
    console.error("❌ Sync Failed:", error);
  }
};


// ==============================================================================
// 2. INBOX SYNC (Read-Only Preview)
//    - Fetches list, decrypts in RAM, returns to UI.
//    - ❌ NEVER SAVES TO DB.
// ==============================================================================
export const syncServerInbox = async () => {
  try {
    const response = await api.get('/chat/inbox/');

    const serverInbox = Array.isArray(response.data) 
      ? response.data 
      : response.data.results; 

    if (!serverInbox) return [];

    // Map and Decrypt for DISPLAY ONLY
    return serverInbox.map((entry: any) => {
      let plainText = "";
      if (entry.last_message) {
        try {
          plainText = decryptMessage(entry.last_message);
        } catch (e) {
          console.warn(`Decrypt error for ${entry.username}`);
          plainText = "Encrypted message";
        }
      }
      
      return {
        ...entry,
        content: plainText, // Pass decrypted text to UI
        timestamp: entry.last_message_time
      };
    });

  } catch (error) {
    console.error("Inbox Sync Failed:", error);
    return [];
  }
};

// ==============================================================================
// 3. FULL CHAT HISTORY SYNC (Persistence)
//    - Stores real messages when chat is opened.
// ==============================================================================
export const syncChatMessages = async (username: string) => {
  try {
    console.log(`📥 Syncing history for ${username}...`);
    
    const response = await api.get(`/chat/history/${username}/`);
    const messages = response.data;

    if (!Array.isArray(messages)) return;

    for (const msg of messages) {
      const plainText = decryptMessage(msg.encrypted_content);
      
      saveMessage({
        // ✅ 1. SERVER ID: Ensure it is a string (e.g., "204")
        id: msg.id.toString(),
        
        // ✅ 2. UNIQUE KEY: This matches your local UUID
        client_id: msg.client_id,
        
        // ✅ 3. FIX: FORCE conversation_id to be the 'username' we are chatting with.
        // Even if I sent the message, it belongs to the conversation with "Sam".
        conversation_id: username, 
        
        sender: msg.sender,
        content: plainText,
        status: msg.status || 'read', 
        timestamp: msg.timestamp,
        is_own: msg.is_own 
      });
    }
    console.log(`✅ History synced for ${username}`);
    return true;
  } catch (error) {
    console.error(`❌ Failed to sync history for ${username}:`, error);
    return false;
  }
};