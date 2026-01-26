import api from './api';
import { 
  getQueue, 
  addToQueue, 
  getMessagesForChat, 
  getLocalInbox, 
  saveMessage, // Still needed for single updates
  saveMessagesBatch, // ✅ NEW: Import this
  Message, 
  getConversationId, 
} from './db';
import { decryptMessage } from './crypto';
import { DeviceEventEmitter } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getSecure } from './storage';

const LAST_SYNC_TS_KEY = 'connect_last_sync_ts_v1';
const TOMBSTONE_MARKER = '__TOMBSTONE__';

interface InboxChat {
  conversation_id: string;
  sender: string;
  unread_count?: number;
}

let isSyncingMessages = false;

/* ------------------------------------------------------------------ */
/* 🧠 UTILITIES                                                       */
/* ------------------------------------------------------------------ */

// Helper to ensure we always work with Epoch Integers
const toEpoch = (ts: string | number | null | undefined): number => {
  if (!ts) return 0;
  if (typeof ts === 'number') return ts;
  const parsed = Date.parse(ts);
  return isNaN(parsed) ? 0 : parsed;
};

// Helper to safely decrypt and check for tombstones
const safeDecrypt = (cipher?: string): string => {
  if (!cipher) return '';
  try {
    const text = decryptMessage(cipher);
    return text === TOMBSTONE_MARKER ? '__DELETED__' : text;
  } catch {
    return 'Encrypted message';
  }
};

/* ------------------------------------------------------------------ */
/* 🌍 GLOBAL SYNC (BACKGROUND)                                        */
/* ------------------------------------------------------------------ */

export const syncPendingMessages = async () => {
  if (isSyncingMessages) return;

  try {
    isSyncingMessages = true;

    const token = await getSecure('accessToken');
    const currentUser = await getSecure('username');
    if (!token || !currentUser) return;

    // 1. Get Last Sync Time
    const lastSyncRaw = await AsyncStorage.getItem(LAST_SYNC_TS_KEY);
    const lastSyncTs = toEpoch(lastSyncRaw);

    const url = lastSyncTs 
      ? `/chat/sync/?last_sync=${lastSyncTs}` 
      : `/chat/sync/`;

    const response = await api.get(url);
    const messages = response.data?.messages ?? response.data;
    if (!Array.isArray(messages) || messages.length === 0) return;

    // 2. Prepare Batch
    const batch: Message[] = [];
    let newestTimestamp = lastSyncTs;

    for (const msg of messages) {
      const sender = msg.sender_username || msg.sender || '';
      const receiver = msg.receiver_username || msg.recipient_id || msg.receiver || currentUser;
      
      const conversationId = getConversationId(sender, receiver);
      const timestamp = toEpoch(msg.timestamp);

      const plainText = safeDecrypt(msg.encrypted_content || msg.ciphertext || msg.content);

      const isDeleted = 
        msg.status === 'deleted' || 
        msg.deleted_globally || 
        plainText === '__DELETED__';

      // Push to array instead of saving immediately
      batch.push({
        id: String(msg.id),
        client_id: msg.client_id || String(msg.id),
        conversation_id: conversationId,
        sender,
        recipient_id: receiver,
        content: isDeleted ? '' : plainText,
        status: isDeleted ? 'deleted' : (msg.status || 'delivered'),
        timestamp, // Integers now
        media: isDeleted ? null : msg.media,
        media_type: msg.media_type,
        locally_deleted: isDeleted,
        album_id: msg.album_id || null // Ensure album ID is preserved
      });

      // Track newest timestamp
      if (timestamp > newestTimestamp) {
        newestTimestamp = timestamp;
      }
    }

    // 3. 🚀 ONE DB TRANSACTION (50x Faster)
    if (batch.length > 0) {
        saveMessagesBatch(batch);
    }

    // 4. Update Cursor
    if (newestTimestamp > lastSyncTs) {
      await AsyncStorage.setItem(LAST_SYNC_TS_KEY, String(newestTimestamp));
    }

    DeviceEventEmitter.emit('new_message', { count: messages.length });

  } catch (e) {
    console.error('❌ Sync Failed:', e);
  } finally {
    isSyncingMessages = false;
  }
};

/* ------------------------------------------------------------------ */
/* 💬 PER-CHAT HISTORY SYNC                                           */
/* ------------------------------------------------------------------ */

export const syncChatMessages = async (targetUsername: string, currentUsername?: string) => {
  try {
    const currentUser = currentUsername || await getSecure('username'); 
    if (!currentUser) return false;

    let finalTarget = targetUsername;
    if (targetUsername.includes('__')) {
        finalTarget = targetUsername.split('__').find(p => p !== currentUser) ?? targetUsername;
    }

    const response = await api.get(`/chat/history/${finalTarget}/`);
    const messages = response.data;
    if (!Array.isArray(messages)) return false;

    // 🚀 Prepare Batch
    const batch: Message[] = [];

    for (const msg of messages) {
      const sender = msg.sender_username || msg.sender || 'unknown';
      const receiver = msg.receiver_username || msg.recipient_id || msg.receiver || currentUser;
      
      const conversationId = getConversationId(sender, receiver);
      const timestamp = toEpoch(msg.timestamp);

      const plainText = safeDecrypt(msg.encrypted_content || msg.ciphertext || msg.content);

      const isDeleted = 
        msg.status === 'deleted' || 
        msg.deleted_globally || 
        plainText === '__DELETED__';

      batch.push({
        id: String(msg.id),
        client_id: msg.client_id || String(msg.id),
        conversation_id: conversationId,
        sender,
        recipient_id: receiver,
        content: isDeleted ? '' : plainText,
        status: isDeleted ? 'deleted' : (msg.status || 'read'),
        timestamp,
        media: isDeleted ? null : msg.media,
        media_type: msg.media_type,
        locally_deleted: isDeleted,
        album_id: msg.album_id || null
      });
    }

    // 🚀 Execute Batch
    if (batch.length > 0) {
        saveMessagesBatch(batch);
    }

    return true;
  } catch (e) {
    console.error('❌ History sync failed:', e);
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
        const cutoff = Date.now() - (2 * 60 * 1000); // 2 mins ago (integer math)

        for (const chat of inbox) {
            const messages = getMessagesForChat(chat.conversation_id) as Message[];
            
            // Fix: Ensure comparison logic matches Integer timestamps
            const stuckMessages = messages.filter((m) => 
                m.status === 'sending' && 
                m.sender === currentUser && 
                m.timestamp < cutoff
            );

            for (const msg of stuckMessages) {
                if (msg.media || (msg.content && msg.content.startsWith('file://'))) continue;
                
                addToQueue('SEND_MESSAGE', {
                    conversation_id: chat.conversation_id,
                    recipient_id: msg.recipient_id, 
                    ciphertext: msg.content, 
                    client_id: msg.client_id
                });
            }
        }
    } finally { isCheckingStuck = false; }
};