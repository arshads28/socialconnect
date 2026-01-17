import api from './api';
import { saveMessage } from './db';
import { decryptMessage } from './crypto';
import { DeviceEventEmitter } from 'react-native';

// Sync (Downloads Pending Messages & Deletes from Server)
export const syncPendingMessages = async () => {
  try {
    console.log("📥 Checking for pending messages...");
    
    // Hit the new endpoint: /chat/sync/
    const response = await api.get('/chat/sync/');
    const { messages, count } = response.data;

    if (count === 0) {
      console.log("✅ No pending messages.");
      return;
    }

    console.log(`📥 Downloading ${count} messages...`);

    // Process all pending messages
    for (const msg of messages) {
      // A. Decrypt
      const plainText = decryptMessage(msg.ciphertext);

      // B. Save to SQLite
      saveMessage({
        id: msg.id.toString(),         // Server ID
        client_id: msg.client_id,      // Original Client ID
        conversation_id: msg.sender,   // Group by Sender
        sender: msg.sender,
        content: plainText,
        status: 'delivered',
        timestamp: msg.timestamp,
        is_own: false
      });
    }

    // C. Refresh UI (Tell ChatScreen and MessagesScreen to reload)
    DeviceEventEmitter.emit('new_message', { count });
    console.log("✅ Sync complete.");

  } catch (error) {
    console.error("❌ Sync Failed:", error);
  }
};

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