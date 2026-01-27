import api from './api';
import { 
  getQueue, 
  addToQueue, 
  getMessagesForChat, 
  getLocalInbox, 
  saveMessage, 
  saveMessagesBatch, 
  Message, 
  getConversationId, 
} from './db';
import { DeviceEventEmitter } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getSecure } from './storage';
import EncryptionService from './EncryptionService';

const LAST_SYNC_TS_KEY = 'connect_last_sync_ts_v1';
const TOMBSTONE_MARKER = '__TOMBSTONE__';

interface InboxChat {
  conversation_id: string;
  sender: string;
  unread_count?: number;
}

let isSyncingMessages = false;

// Helper to ensure we always work with Epoch Integers
const toEpoch = (ts: string | number | null | undefined): number => {
  if (!ts) return 0;
  if (typeof ts === 'number') return ts;
  const parsed = Date.parse(ts);
  return isNaN(parsed) ? 0 : parsed;
};

//  2. ASYNC DECRYPTION HELPER
const safeDecrypt = async (cipher: string, sender: string): Promise<string> => {
  if (!cipher) return '';
  try {
    // Attempt Signal Decryption
    const text = await EncryptionService.decrypt(cipher, sender);
    return text === TOMBSTONE_MARKER ? '__DELETED__' : text;
  } catch {
    // If it fails (e.g., pre-E2EE message), return raw or placeholder
    return '🔒 Encrypted Message';
  }
};

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

    // Process sequentially to maintain Ratchet order stability
    for (const msg of messages) {
      const sender = msg.sender_username || msg.sender || '';
      const receiver = msg.receiver_username || msg.recipient_id || msg.receiver || currentUser;
      
      const conversationId = getConversationId(sender, receiver);
      const timestamp = toEpoch(msg.timestamp);

      //  DECRYPT CONTENT
      const rawContent = msg.encrypted_content || msg.ciphertext || msg.content;
      // We only try to decrypt if WE are the receiver. 
      // If we sent it, we already have the plaintext locally (usually).
      // But for sync, we might be restoring a backup, so logic depends on use case.
      // For now: Always decrypt incoming.
      const plainText = (sender !== currentUser) 
         ? await safeDecrypt(rawContent, sender)
         : rawContent; // If we sent it, assume it's synced back as ciphertext or ignored

      const isDeleted = 
        msg.status === 'deleted' || 
        msg.deleted_globally || 
        plainText === '__DELETED__';

      // Push to array
      batch.push({
        id: String(msg.id),
        client_id: msg.client_id || String(msg.id),
        conversation_id: conversationId,
        sender,
        recipient_id: receiver,
        content: isDeleted ? '' : plainText,
        status: isDeleted ? 'deleted' : (msg.status || 'delivered'),
        timestamp, 
        media: isDeleted ? null : msg.media,
        media_type: msg.media_type,
        locally_deleted: isDeleted,
        album_id: msg.album_id || null 
      });

      // Track newest timestamp
      if (timestamp > newestTimestamp) {
        newestTimestamp = timestamp;
      }
    }

    // 3. ONE DB TRANSACTION
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

    // Prepare Batch
    const batch: Message[] = [];

    for (const msg of messages) {
      const sender = msg.sender_username || msg.sender || 'unknown';
      const receiver = msg.receiver_username || msg.recipient_id || msg.receiver || currentUser;
      
      const conversationId = getConversationId(sender, receiver);
      const timestamp = toEpoch(msg.timestamp);

      //  DECRYPT
      const rawContent = msg.encrypted_content || msg.ciphertext || msg.content;
      // Note: If we are the sender, the server sends back ciphertext we cannot decrypt 
      // (unless we store the plaintext session, which we don't for self).
      // Standard Signal: You can't decrypt your own sent messages from another device 
      // unless you implement "Note to Self" style syncing. 
      // For now, we assume incoming messages are what we care about.
      const plainText = (sender !== currentUser) 
          ? await safeDecrypt(rawContent, sender) 
          : "Message sent"; // Placeholder or original text if local

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

    // Execute Batch
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

    const processedInbox = [];

    for (const entry of serverInbox) {
      let plainText = "";
      if (entry.last_message) {
          // Assuming entry.partner_username is available or can be derived
          const partner = entry.partner_username || "unknown"; 
          plainText = await safeDecrypt(entry.last_message, partner);
      }
      processedInbox.push({ ...entry, content: plainText, timestamp: entry.last_message_time });
    }
    
    return processedInbox;
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
        const cutoff = Date.now() - (2 * 60 * 1000); // 2 mins ago

        for (const chat of inbox) {
            const messages = getMessagesForChat(chat.conversation_id) as Message[];
            
            const stuckMessages = messages.filter((m) => 
                m.status === 'sending' && 
                m.sender === currentUser && 
                m.timestamp < cutoff
            );

            for (const msg of stuckMessages) {
                if (msg.media || (msg.content && msg.content.startsWith('file://'))) continue;
                
                // E2EE: We must ENCRYPT the plaintext content again
                // The 'msg.content' in DB is plaintext (saved by ChatScreen)
                let ciphertext = "";
                try {
                    // Extract recipient username from conversation ID or msg
                    const parts = chat.conversation_id.split('__');
                    const recipientUsername = parts.find(u => u !== currentUser) || "unknown";
                    
                    ciphertext = await EncryptionService.encrypt(msg.content, recipientUsername);
                } catch (e) {
                    console.log("Resend encryption failed, skipping", e);
                    continue; 
                }

                addToQueue('SEND_MESSAGE', {
                    conversation_id: chat.conversation_id,
                    recipient_id: msg.recipient_id, 
                    ciphertext: ciphertext, 
                    client_id: msg.client_id
                });
            }
        }
    } finally { isCheckingStuck = false; }
};