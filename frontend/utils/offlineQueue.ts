import { getQueue, removeFromQueue, incrementRetryCount, clearQueue, updateMessageStatus } from './db'; 
import api from './api';
import { getSecure } from './storage';
import { Platform, DeviceEventEmitter } from 'react-native'; 
import NetInfo from '@react-native-community/netinfo';
import UploadManager from './UploadManager';

interface QueueTask {
  id: number;
  action_type: string;
  payload: string; 
  timestamp?: string;
  retries: number;
}

const BATCH_SIZE = 5; 
const MAX_RETRIES = 3; 
let isProcessingQueue = false;

export const processOfflineQueue = async () => {
  if (isProcessingQueue) return;

  try {
      isProcessingQueue = true; 

      const netState = await NetInfo.fetch();
      if (!netState.isConnected || !netState.isInternetReachable) {
          console.log("Queue paused: Waiting for Internet...");
          isProcessingQueue = false;
          return;
      }

      UploadManager.resume();

      const token = await getSecure('accessToken');
      if (!token) {
          isProcessingQueue = false;
          return;
      }

      const queue = getQueue() as QueueTask[];
      if (queue.length === 0) {
          isProcessingQueue = false;
          return;
      }

      const batch = queue.slice(0, BATCH_SIZE);
      console.log(`🔄 Processing batch of ${batch.length}...`);

      for (const task of batch) {
        if (task.retries >= MAX_RETRIES) {
            console.warn(`☠️ Task ${task.id} failed too many times. Dropping.`);
            removeFromQueue(task.id);
            continue; 
        }

        try {
          const payload = JSON.parse(task.payload);
          let success = false;

          switch (task.action_type) {
            case 'CREATE_POST': 
                success = await processCreatePost(payload); 
                break;
            case 'DELETE_POST': 
                await api.delete(`/api/updates/${payload.postId}/`); 
                success = true; 
                break;
            case 'LIKE_POST': 
                await api.post(`/api/updates/${payload.postId}/like/`); 
                success = true; 
                break;
            case 'SEND_MESSAGE': 
                success = await processSendMessage(payload); 
                break;
            
            // ✅ ADDED: Offline Delete Support
            case 'DELETE_MESSAGE':
                try {
                    const endpoint = payload.scope === 'global' ? '/chat/delete/global/' : '/chat/delete/self/';
                    await api.post(endpoint, { client_ids: payload.client_ids });
                    success = true;
                } catch(e) {
                    console.error("Delete sync failed", e);
                }
                break;
          }

          if (success) {
            removeFromQueue(task.id);
            console.log(`✅ Task ${task.id} synced.`);
          } else {
            incrementRetryCount(task.id);
          }

        } catch (error: any) {
          if (error.response?.status === 401) {
              isProcessingQueue = false;
              return; 
          }
          incrementRetryCount(task.id);
        }
      }

      const remaining = getQueue() as QueueTask[];
      if (remaining.length > 0) {
          setTimeout(() => { isProcessingQueue = false; processOfflineQueue(); }, 1000);
      } else {
          isProcessingQueue = false; 
      }

  } catch (err) {
      console.error("Critical Queue Crash:", err);
      isProcessingQueue = false;
  }
};

// --- HELPERS ---

const processCreatePost = async (data: any) => {
  try {
    const formData = new FormData();
    formData.append('content', data.content);

    if (data.imageUri) {
        const filename = data.imageUri.split('/').pop() || 'upload.jpg';
        const match = /\.(\w+)$/.exec(filename);
        const type = match ? `image/${match[1]}` : `image/jpeg`;

        // @ts-ignore
        formData.append('media', {
            uri: Platform.OS === 'android' ? data.imageUri : data.imageUri.replace('file://', ''),
            name: filename,
            type,
        });
    }

    const response = await api.post('/api/updates/', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.status === 201 || response.status === 200;
  } catch(e: any) { 
      if (e.response?.status === 401) throw e;
      if (!e.response) throw e; 
      return false; 
  }
};

const processSendMessage = async (data: any) => {
    try {
        const response = await api.post(`/chat/send/`, {
            recipient_id: data.recipient_id, 
            ciphertext: data.ciphertext, 
            client_id: data.client_id
        });

        if (response.status === 200 || response.status === 201) {
            if (data.client_id) {
                updateMessageStatus(data.client_id, 'sent');
                DeviceEventEmitter.emit('message_status_changed', { 
                    client_id: data.client_id, 
                    status: 'sent' 
                });
            }
            return true;
        }
        return false;

    } catch (e: any) { 
        if (e.response?.status === 401) throw e;
        if (!e.response) throw e; 
        return false; 
    }
};

export const clearOfflineQueue = () => {
    console.log("🧨 Nuking Offline Queue...");
    clearQueue();
    isProcessingQueue = false;
};