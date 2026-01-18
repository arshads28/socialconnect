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
//    - Runs when app opens or socket reconnects.
// ==============================================================================
export const syncPendingMessages = async () => {
  try {
    console.log("📥 Checking for pending messages...");

    // ✅ CHANGE 2: Get Last Timestamp instead of ID
    let lastSyncTime = null;
    if (Platform.OS === 'web') {
        lastSyncTime = localStorage.getItem(LAST_SYNC_TS_KEY);
    } else {
        lastSyncTime = await AsyncStorage.getItem(LAST_SYNC_TS_KEY);
    }

    // ✅Send 'last_sync' param
    // If lastSyncTime is null, send empty string (Backend handles it)
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

    // Keep track of the newest timestamp we receive
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

      // Update newest timestamp logic
      if (!newestTimestamp || new Date(msg.timestamp) > new Date(newestTimestamp)) {
        newestTimestamp = msg.timestamp;
      }
    }

    // ✅ CHANGE 4: Save the Newest Timestamp
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
// 2. INBOX SYNC (Previews for the list)
//    - Gets the last message for every conversation to show in the list.
// ==============================================================================
export const syncServerInbox = async () => {
  try {
    const response = await api.get('/chat/inbox/');

    const serverInbox = Array.isArray(response.data) 
      ? response.data 
      : response.data.results; 

    if (!serverInbox) return [];

    for (const entry of serverInbox) {
      if (entry.last_message) {
        try {
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
        } catch (decryptError) {
          console.warn(`Failed to decrypt preview for ${entry.username}`);
        }
      }
    }
    return serverInbox;
  } catch (error) {
    console.error("Inbox Sync Failed:", error);
    return [];
  }
};

// ==============================================================================
// 3. ✅ FULL CHAT HISTORY SYNC (The "Race Condition" Fix)
//    - Called by ChatScreen to ensure we have every single message for THIS user.
// ==============================================================================
export const syncChatMessages = async (username: string) => {
  try {
    console.log(`📥 Syncing history for ${username}...`);
    
    // Call the History API (Uses 'chat_history' view)
    const response = await api.get(`/chat/history/${username}/`);
    const messages = response.data;

    if (!Array.isArray(messages)) return;

    for (const msg of messages) {
      // Use 'encrypted_content' matching your Python view
      const plainText = decryptMessage(msg.encrypted_content);
      
      saveMessage({
        id: msg.id.toString(),
        client_id: msg.client_id,
        conversation_id: username,
        sender: msg.sender,
        content: plainText,
        status: msg.status || 'read', // Trust server status
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