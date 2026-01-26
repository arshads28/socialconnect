import api from './api';
import { 
  getQueue, addToQueue, getMessagesForChat, updateMessageStatus, getLocalInbox, saveMessage, Message, getConversationId, getUser 
} from './db';
import { decryptMessage } from './crypto';
import { DeviceEventEmitter } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getSecure } from './storage';

const LAST_SYNC_TS_KEY = 'connect_last_sync_ts_v1';
const TOMBSTONE_MARKER = "__TOMBSTONE__"; 

interface InboxChat {
  conversation_id: string;
  sender: string;
  last_message?: string;
  unread_count?: number;
}

let isSyncingMessages = false;

// 1. GLOBAL SYNC (Background "Postman" fetch)
export const syncPendingMessages = async () => {
  if (isSyncingMessages) return;

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

    if (!messages || count === 0) return;

    console.log(`📥 Downloading ${count} new messages...`);

    let newestTimestamp = lastSyncTime; 

    for (const msg of messages) {
      const sender = msg.sender_username || msg.sender || "";
      const receiver = msg.receiver_username || msg.recipient_id || msg.receiver || currentUser;
      const validConversationId = getConversationId(sender, receiver);

      // Attempt Decryption
      let plainText = "";
      try {
        const content = msg.encrypted_content || msg.ciphertext || msg.content;
        plainText = decryptMessage(content);
      } catch (e) {
        plainText = "Encrypted message";
      }

      // HANDLE MESSAGE DATA
      if (msg.status === 'deleted' || msg.deleted_globally || plainText === TOMBSTONE_MARKER) {
          saveMessage({
              id: msg.id.toString(),
              client_id: msg.client_id || msg.id.toString(),
              conversation_id: validConversationId,
              sender: sender, 
              recipient_id: currentUser, 
              content: "__DELETED__", 
              media: null, 
              media_type: "none",
              status: 'deleted',
              timestamp: msg.timestamp,
              locally_deleted: true 
          });
      } else {
          saveMessage({
            id: msg.id.toString(),
            client_id: msg.client_id || msg.id.toString(),
            conversation_id: validConversationId,
            sender: sender,
            recipient_id: receiver,
            content: plainText,
            status: msg.status || 'delivered',
            timestamp: msg.timestamp,
            media: msg.media,
            media_type: msg.media_type
          });
      }

      // FIX: Update cursor even for tombstones so we don't refetch them
      if (!newestTimestamp || new Date(msg.timestamp) > new Date(newestTimestamp)) {
        newestTimestamp = msg.timestamp;
      }
    }

    if (newestTimestamp) {
        await AsyncStorage.setItem(LAST_SYNC_TS_KEY, newestTimestamp);
    }

    DeviceEventEmitter.emit('new_message', { count });
    console.log(" Sync complete.");

  } catch (error) {
    console.error("❌ Sync Failed (Network):", error);
  } finally {
      isSyncingMessages = false; 
  }
};

export const syncChatMessages = async (username: string) => {
  try {
    const currentUser = await getSecure('username'); 
    if (!currentUser) return false;

    let targetUser = username;
    if (username.includes('__')) {
        const parts = username.split('__');
        targetUser = parts.find(p => p !== currentUser) || username;
    }

    console.log(`📥 Syncing history for ${targetUser}...`);

    const response = await api.get(`/chat/history/${targetUser}/`);
    const messages = response.data;
    if (!Array.isArray(messages)) return;

    for (const msg of messages) {
      const sender = msg.sender_username || msg.sender || "unknown";
      const receiver = msg.receiver_username || msg.recipient_id || msg.receiver || currentUser;
      const conversationId = getConversationId(sender, receiver);

      let plainText = "";
      try {
        const content = msg.encrypted_content || msg.ciphertext || msg.content;
        plainText = decryptMessage(content);
      } catch (e) {
        plainText = "Encrypted message";
      }

      if (msg.status === 'deleted' || msg.deleted_globally || plainText === TOMBSTONE_MARKER) {
          saveMessage({
              id: msg.id.toString(),
              client_id: msg.client_id || msg.id.toString(),
              conversation_id: conversationId,
              sender: sender, 
              recipient_id: currentUser,
              content: "__DELETED__",
              media: null,
              media_type: "none",
              status: 'deleted',
              timestamp: msg.timestamp,
              locally_deleted: true 
          });
      } else {
          saveMessage({
            id: msg.id.toString(),
            client_id: msg.client_id || msg.id.toString(),
            conversation_id: conversationId, 
            sender: sender,
            recipient_id: receiver,
            content: plainText,
            status: msg.status || 'read', 
            timestamp: msg.timestamp,
            media: msg.media,
            media_type: msg.media_type
          });
      }
    }
    console.log(`History synced for ${targetUser}`);
    return true;
  } catch (error) {
    console.error(`❌ Failed to sync history for ${username}:`, error);
    return false;
  }
};

export const syncServerInbox = async () => {
  try {
    const response = await api.get('/chat/inbox/');
    const serverInbox = Array.isArray(response.data) ? response.data : response.data.results; 
    if (!serverInbox) return [];

    return serverInbox.map((entry: any) => {
      let plainText = "";
      if (entry.last_message) {
        try { 
          plainText = decryptMessage(entry.last_message);
          if (plainText === TOMBSTONE_MARKER) plainText = "Message deleted";
        } 
        catch (e) { plainText = "Encrypted message"; }
      }
      return { ...entry, content: plainText, timestamp: entry.last_message_time };
    });
  } catch (error) {
    console.error("Inbox Sync Failed:", error);
    return [];
  }
};

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
            const stuckMessages = messages.filter((m) => m.status === 'sending' && m.sender === currentUser && m.timestamp < twoMinutesAgo);

            for (const msg of stuckMessages) {
                if (msg.media || (msg.content && msg.content.startsWith('file://'))) continue;
                const payload = {
                    conversation_id: chat.conversation_id,
                    recipient_id: msg.recipient_id, 
                    ciphertext: msg.content, 
                    client_id: msg.client_id
                };
                addToQueue('SEND_MESSAGE', payload);
            }
        }
    } finally { isCheckingStuck = false; }
};