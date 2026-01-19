import { getQueue, removeFromQueue, clearQueue } from './db';
import api from './api';
import { getSecure } from './storage';
import { Platform } from 'react-native';

//Define Type for Queue Task
interface QueueTask {
  id: number;
  action_type: string;
  payload: string; // JSON string
  timestamp?: string;
}

const BATCH_SIZE = 5; 
let isProcessingQueue = false;

export const processOfflineQueue = async () => {
  // 1. LOCK CHECK: If already running, stop.
  if (isProcessingQueue) {
      console.log("⚠️ Queue already processing. Skipping duplicate trigger.");
      return;
  }

  try {
      isProcessingQueue = true; // 🔒 LOCK

      // 2. AUTH GUARD
      const token = await getSecure('accessToken');
      if (!token) {
          console.log("🛑 Queue paused: No active session.");
          return;
      }

      const queue = getQueue() as QueueTask[];

      if (queue.length === 0) return;

      const batch = queue.slice(0, BATCH_SIZE);
      console.log(`🔄 Processing batch of ${batch.length} (Total Pending: ${queue.length})...`);

      for (const task of batch) {
        try {
          const payload = JSON.parse(task.payload);
          let success = false;

          switch (task.action_type) {
            case 'CREATE_POST': 
                success = await processCreatePost(payload); 
                break;
            case 'DELETE_POST': 
                try { await api.delete(`/api/updates/${payload.postId}/`); success = true; } 
                catch(e: any){ if (e.response?.status === 401) throw e; success = false; }
                break;
            case 'LIKE_POST': 
                try { await api.post(`/api/updates/${payload.postId}/like/`); success = true; } 
                catch(e: any){ if (e.response?.status === 401) throw e; success = false; }
                break;
            case 'SEND_MESSAGE': 
                success = await processSendMessage(payload); 
                break;
          }

          if (success) {
            removeFromQueue(task.id);
            console.log(`✅ Task ${task.id} (${task.action_type}) completed.`);
          } else {
            console.warn(`⚠️ Task ${task.id} failed, skipping for now.`);
          }

        } catch (error: any) {
          console.error(`❌ Error on task ${task.id}:`, error);
          if (error.response?.status === 401 || error.message === "No refresh token") {
              console.log("🛑 Auth failed. Pausing.");
              return; 
          }
        }
      }

      // Recursive check (only if we processed successfully)
      const remaining = getQueue() as QueueTask[];
      if (remaining.length > 0) {
          isProcessingQueue = false; 
          setTimeout(() => processOfflineQueue(), 1000);
      } else {
          console.log("🎉 Offline Queue Cleared!");
      }

  } finally {
      // Check queue length again safely
      const finalQueue = getQueue() as QueueTask[];
      if (finalQueue.length === 0) {
          isProcessingQueue = false; 
      }
  }
};

// --- HELPERS ---

const processCreatePost = async (data: any) => {
  try {
    const token = await getSecure('accessToken');
    const formData = new FormData();
    formData.append('content', data.content);

    if (data.imageUri) {
        const filename = data.imageUri.split('/').pop() || 'upload.jpg';
        const match = /\.(\w+)$/.exec(filename);
        const type = match ? `image/${match[1]}` : `image/jpeg`;

        formData.append('media', {
            uri: Platform.OS === 'android' ? data.imageUri : data.imageUri.replace('file://', ''),
            name: filename,
            type,
        } as any);
    }

    const response = await fetch(`${api.defaults.baseURL}api/updates/`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData,
    });
    return response.ok;
  } catch(e) { return false; }
};

const processSendMessage = async (data: any) => {
    try {
        await api.post(`/chat/send/`, {
            recipient_id: data.recipient_id, 
            ciphertext: data.ciphertext, 
            client_id: data.client_id
        });
        return true;
    } catch (e: any) { 
        if (e.response?.status === 401) throw e;
        console.error("Msg Sync Error:", e.response?.data || e.message);
        return false; 
    }
};

export const clearOfflineQueue = () => {
    console.log("🧨 Nuking Offline Queue...");
    clearQueue();
    isProcessingQueue = false;
};