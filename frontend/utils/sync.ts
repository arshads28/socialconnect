import api from './api';
import { 
  getQueue, addToQueue, getMessagesForChat, updateMessageStatus, getLocalInbox, saveMessage
} from './db';
import { decryptMessage } from './crypto';
import { DeviceEventEmitter, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getSecure } from './storage';

const LAST_SYNC_TS_KEY = 'connect_last_sync_ts_v1';

// 1. GLOBAL SYNC (Background "Postman" fetch)

let isSyncingMessages = false;

export const syncPendingMessages = async () => {
  // 1. LOCK CHECK
  if (isSyncingMessages) {
      console.log("⚠️ Sync already in progress. Skipping.");
      return;
  }

  try {
    isSyncingMessages = true; // 🔒 LOCK

    const token = await getSecure('accessToken');
    if (!token) return;

    // console.log("📥 Checking for pending messages..."); // Optional log to reduce noise

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
    console.error("❌ Sync Failed (Network):", error);
  } finally {
      isSyncingMessages = false; // 🔓 UNLOCK
  }
};


export const syncServerInbox = async () => {
  try {
    const response = await api.get('/chat/inbox/');

    const serverInbox = Array.isArray(response.data) 
      ? response.data 
      : response.data.results; 

    if (!serverInbox) return [];

    return serverInbox.map((entry: any) => {
      let plainText = "";
      if (entry.last_message) {
        try {
          plainText = decryptMessage(entry.last_message);
        } catch (e) {
          plainText = "Encrypted message";
        }
      }
      
      return {
        ...entry,
        content: plainText,
        timestamp: entry.last_message_time
      };
    });

  } catch (error) {
    console.error("Inbox Sync Failed:", error);
    return [];
  }
};

export const syncChatMessages = async (username: string) => {
  try {
    console.log(`📥 Syncing history for ${username}...`);
    const response = await api.get(`/chat/history/${username}/`);
    const messages = response.data;
    if (!Array.isArray(messages)) return;

    for (const msg of messages) {
      const plainText = decryptMessage(msg.encrypted_content);
      saveMessage({
        id: msg.id.toString(),
        client_id: msg.client_id,
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

// 🔒 MUTEX FOR STUCK MESSAGES
let isCheckingStuck = false;

export const resendStuckMessages = async () => {
    if (isCheckingStuck) return; // Prevent overlapping checks
    
    try {
        isCheckingStuck = true;
        const token = await getSecure('accessToken');
        if (!token) return;

        // console.log("🧹 Checking for stuck messages...");
        const inbox = getLocalInbox();
        
        for (const chat of inbox) {
            const messages = getMessagesForChat(chat.conversation_id);
            const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString();
            
            const stuckMessages = messages.filter(m => 
                m.status === 'sending' && 
                m.is_own === 1 && 
                m.timestamp < twoMinutesAgo
            );

            for (const msg of stuckMessages) {
                // Ensure we don't re-queue if it's already in the queue (simple check)
                const payload = {
                    conversation_id: chat.conversation_id,
                    recipient_id: msg.recipient_id, 
                    ciphertext: msg.content,
                    client_id: msg.client_id
                };

                const queued = addToQueue('SEND_MESSAGE', payload);
                if (queued) console.log(`🔄 Re-queued stuck message: ${msg.client_id}`);
            }
        }
    } finally {
        isCheckingStuck = false;
    }
};