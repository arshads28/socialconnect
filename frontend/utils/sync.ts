import api from './api';
import { 
  getQueue, addToQueue, getMessagesForChat, updateMessageStatus, getLocalInbox, saveMessage, Message, getConversationId, getUser 
} from './db';
import { decryptMessage } from './crypto';
import { DeviceEventEmitter } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getSecure, saveSecure } from './storage';

const LAST_SYNC_TS_KEY = 'connect_last_sync_ts_v1';

// Type definition for Inbox items
interface InboxChat {
  conversation_id: string;
  sender: string;
  last_message?: string;
  unread_count?: number;
}

let isSyncingMessages = false;

// 1. GLOBAL SYNC (Background "Postman" fetch)
export const syncPendingMessages = async () => {
  if (isSyncingMessages) {
      console.log("⚠️ Sync already in progress. Skipping.");
      return;
  }

  try {
    isSyncingMessages = true; 

    const token = await getSecure('accessToken');
    const currentUser = await getSecure('username'); 
    
    if (!token || !currentUser) return;

    const lastSyncTime = await AsyncStorage.getItem(LAST_SYNC_TS_KEY);

    const url = lastSyncTime 
        ? `/chat/sync/?last_sync=${encodeURIComponent(lastSyncTime)}` 
        : `/chat/sync/`;

    const response = await api.get(url);
    const messages = response.data.messages || response.data;
    const count = Array.isArray(messages) ? messages.length : 0;

    if (!messages || count === 0) {
      return;
    }

    console.log(`📥 Downloading ${count} new messages...`);

    let newestTimestamp = lastSyncTime; 

    for (const msg of messages) {
      // 1. Decrypt
      let plainText = "";
      try {
        const content = msg.encrypted_content || msg.ciphertext || msg.content;
        plainText = decryptMessage(content);
      } catch (e) {
        console.warn(`Failed to decrypt message ${msg.id}`);
        plainText = "Encrypted message";
      }

      // 🛡️ CRITICAL FIX 1: Determine Recipient ID
      // If server sends empty recipient and sender is NOT me, then I am the recipient.
      let finalRecipientId = msg.receiver_username || msg.recipient_id || msg.receiver;
      if (!finalRecipientId && msg.sender !== currentUser) {
          finalRecipientId = currentUser;
      }

      // 🛡️ CRITICAL FIX 2: Repair "unknown" Conversation IDs
      let validConversationId = msg.conversation_id;
      
      if (!validConversationId || validConversationId === 'unknown') {
          // Identify the "other" person
          const otherUser = msg.sender === currentUser ? finalRecipientId : (msg.sender_username || msg.sender);
          
          if (otherUser) {
              validConversationId = getConversationId(currentUser, otherUser);
          } else {
              console.warn(`⚠️ Skipping msg ${msg.id}: Cannot determine conversation_id`);
              continue; 
          }
      }

      saveMessage({
        id: msg.id.toString(),
        client_id: msg.client_id || msg.id.toString(), // Fallback
        conversation_id: validConversationId, // ✅ Uses fixed ID
        sender: msg.sender_username || msg.sender,
        recipient_id: finalRecipientId || currentUser,
        content: plainText,
        status: 'delivered',
        timestamp: msg.timestamp,
        media: msg.media,
        media_type: msg.media_type
      });

      if (!newestTimestamp || new Date(msg.timestamp) > new Date(newestTimestamp)) {
        newestTimestamp = msg.timestamp;
      }
    }

    if (newestTimestamp) {
        await AsyncStorage.setItem(LAST_SYNC_TS_KEY, newestTimestamp);
    }

    DeviceEventEmitter.emit('new_message', { count });
    console.log("✅ Sync complete.");

  } catch (error) {
    console.error("❌ Sync Failed (Network):", error);
  } finally {
      isSyncingMessages = false; 
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
    const currentUser = await getSecure('username'); 
    
    // 🛡️ FIX: If username looks like "arsh__asdf", extract the real user
    let targetUser = username;
    if (username.includes('__') && currentUser) {
        const parts = username.split('__');
        targetUser = parts.find(p => p !== currentUser) || username;
    }

    console.log(`📥 Syncing history for ${targetUser}...`);

    const response = await api.get(`/chat/history/${targetUser}/`);
    const messages = response.data;
    if (!Array.isArray(messages)) return;

    for (const msg of messages) {
      let plainText = "";
      try {
        const content = msg.encrypted_content || msg.ciphertext || msg.content;
        plainText = decryptMessage(content);
      } catch (e) {
        plainText = "Encrypted message";
      }

      // Always recalculate ID to be safe
      const conversationId = getConversationId(msg.sender_username || msg.sender, msg.receiver_username || msg.receiver);

      saveMessage({
        id: msg.id.toString(),
        client_id: msg.client_id || msg.id.toString(),
        conversation_id: conversationId, 
        sender: msg.sender_username || msg.sender,
        recipient_id: msg.receiver_username || msg.receiver,
        content: plainText,
        status: msg.status || 'read', 
        timestamp: msg.timestamp,
        media: msg.media,
        media_type: msg.media_type
      });
    }
    console.log(`✅ History synced for ${targetUser}`);
    return true;
  } catch (error) {
    console.error(`❌ Failed to sync history for ${username}:`, error);
    return false;
  }
};

// MUTEX FOR STUCK MESSAGES
let isCheckingStuck = false;

export const resendStuckMessages = async () => {
    if (isCheckingStuck) return;
    
    try {
        isCheckingStuck = true;
        const token = await getSecure('accessToken');
        const currentUser = await getSecure('username'); 
        
        if (!token || !currentUser) return;

        const inbox = getLocalInbox(currentUser) as InboxChat[];
        
        for (const chat of inbox) {
            const messages = getMessagesForChat(chat.conversation_id) as Message[];
            
            const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString();
            
            const stuckMessages = messages.filter((m) => 
                m.status === 'sending' && 
                m.sender === currentUser && 
                m.timestamp < twoMinutesAgo
            );

            for (const msg of stuckMessages) {
                if (msg.media || (msg.content && msg.content.startsWith('file://'))) {
                    continue;
                }

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