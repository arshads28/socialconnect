import { getQueue, removeFromQueue } from './db';
import api, { BASE_URL } from './api';
import { getSecure } from './storage';
import { Platform } from 'react-native';

// ✅ CONFIG: Only process 5 items at a time to prevent freezing
const BATCH_SIZE = 5; 

export const processOfflineQueue = async () => {
  const queue = getQueue();
  
  if (queue.length === 0) return;

  // 1. Slice the Queue (Take only the first 5)
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
            try { await api.delete(`/api/updates/${payload.postId}/`); success = true; } catch(e){ success = false; }
            break;
        case 'LIKE_POST': 
            try { await api.post(`/api/updates/${payload.postId}/like/`); success = true; } catch(e){ success = false; }
            break;
        case 'SEND_MESSAGE': 
            success = await processSendMessage(payload); 
            break;
      }

      if (success) {
        removeFromQueue(task.id);
        console.log(`✅ Task ${task.id} (${task.action_type}) completed.`);
      } else {
        // If it fails (e.g. 500 error), leave it in queue but log it.
        // It will be retried in the next run.
        console.warn(`⚠️ Task ${task.id} failed, skipping for now.`);
      }

    } catch (error) {
      console.error(`❌ Crashing error on task ${task.id}:`, error);
    }
  }

  // 2. RECURSIVE CHECK
  // If we still have items left in the DB, run again after 2 seconds
  // This prevents UI lag.
  const remaining = getQueue();
  if (remaining.length > 0) {
      console.log(`⏳ Resting for 2s before next batch...`);
      setTimeout(() => processOfflineQueue(), 2000);
  } else {
      console.log("🎉 Offline Queue Cleared!");
  }
};

// --- HELPERS (Keep these the same) ---

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

    const response = await fetch(`${BASE_URL}/api/updates/`, {
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
            recipient: data.conversation_id,
            ciphertext: data.ciphertext, 
            client_id: data.client_id
        });
        return true;
    } catch (e) { return false; }
};