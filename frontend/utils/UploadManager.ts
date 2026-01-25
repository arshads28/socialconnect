import NetInfo from '@react-native-community/netinfo';
import AsyncStorage from '@react-native-async-storage/async-storage'; 

const PERSISTENCE_KEY = 'upload_manager_queue_v1';

export type UploadTask = {
  id: string;
  uri: string;
  type: 'image' | 'video';
  endpoint: string;
  headers?: Record<string, string>;
  additionalData?: Record<string, any>; 
  retryCount: number; 
};

type TaskCallbacks = {
  onProgress: (percent: number) => void;
  onSuccess: (response: any) => void;
  onError: (error: any) => void;
};

class UploadManager {
  private static instance: UploadManager;
  private queue: UploadTask[] = [];
  private callbacks: Map<string, TaskCallbacks> = new Map();
  private uploading = false;

  static getInstance() {
    if (!UploadManager.instance) {
      UploadManager.instance = new UploadManager();
      UploadManager.instance.loadQueue(); 
    }
    return UploadManager.instance;
  }

  //  1. Persistence Logic
  private async saveQueue() {
    try {
      await AsyncStorage.setItem(PERSISTENCE_KEY, JSON.stringify(this.queue));
    } catch (e) { console.error("Failed to save upload queue", e); }
  }

  private async loadQueue() {
    try {
      const stored = await AsyncStorage.getItem(PERSISTENCE_KEY);
      if (stored) {
        this.queue = JSON.parse(stored);
        // Automatically resume processing if internet is available
        this.process(); 
      }
    } catch (e) { console.error("Failed to load upload queue", e); }
  }

  // 2. Add Task
  add(task: Omit<UploadTask, 'retryCount'>, callbacks: TaskCallbacks) {
    const fullTask: UploadTask = { ...task, retryCount: 0 };
    
    // Store callbacks in memory map
    this.callbacks.set(task.id, callbacks);
    
    this.queue.push(fullTask);
    this.saveQueue(); // Persist
    this.process();
  }

  //  3. Retry Logic (Manual)
  retry(taskId: string) {
    const taskIndex = this.queue.findIndex(t => t.id === taskId);
    if (taskIndex > -1) {
        // Move to front
        const [task] = this.queue.splice(taskIndex, 1);
        task.retryCount = 0; // Reset retries
        this.queue.unshift(task);
        this.saveQueue();
        this.process();
    }
  }
  
  public resume() {
    this.process();
  }

  private async process() {
    if (this.uploading || this.queue.length === 0) return;

    const net = await NetInfo.fetch();
    if (!net.isConnected || !net.isInternetReachable) return; 

    this.uploading = true;
    const task = this.queue[0]; // Peek, don't shift yet
    this.upload(task);
  }

  private upload(task: UploadTask) {
    const xhr = new XMLHttpRequest();
    const formData = new FormData();
    const callbacks = this.callbacks.get(task.id);

    const filename = task.uri.split('/').pop() || (task.type === 'video' ? 'video.mp4' : 'image.jpg');
    const mimeType = task.type === 'video' ? 'video/mp4' : 'image/jpeg';

    // @ts-ignore
    formData.append('media', {
      uri: task.uri, // Ensure file:// is handled for Android if needed
      name: filename,
      type: mimeType,
    });

    if (task.additionalData) {
      Object.entries(task.additionalData).forEach(([key, value]) => {
        formData.append(key, value);
      });
    }

    xhr.timeout = 60000; 

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && callbacks) {
        const percent = Math.round((e.loaded / e.total) * 100);
        callbacks.onProgress(percent);
      }
    };

    xhr.onload = () => {
      this.uploading = false;
      if (xhr.status >= 200 && xhr.status < 300) {
        this.queue.shift();
        this.saveQueue();
        this.callbacks.delete(task.id);
        
        try {
            const res = JSON.parse(xhr.responseText);
            if (callbacks) callbacks.onSuccess(res);
        } catch (e) {
            if (callbacks) callbacks.onSuccess(xhr.responseText);
        }
      } else {
        this.handleFailure(task, xhr.statusText);
      }
      this.process(); 
    };

    xhr.onerror = (e) => {
      this.uploading = false;
      this.handleFailure(task, "Network Error");
      this.process(); 
    };

    xhr.ontimeout = () => {
      this.uploading = false;
      this.handleFailure(task, "Timeout");
      this.process();
    };

    xhr.open('POST', task.endpoint);
    if (task.headers) {
      Object.entries(task.headers).forEach(([k, v]) => xhr.setRequestHeader(k, v));
    }
    xhr.send(formData);
  }

  // 4. Robust Failure Handling
  private handleFailure(task: UploadTask, reason: string) {
      const callbacks = this.callbacks.get(task.id);
      
      if (task.retryCount < 3) {
          // Auto-retry internally without bothering the user
          console.log(`Auto-retrying upload ${task.id} (${task.retryCount + 1}/3)`);
          task.retryCount++;
          this.saveQueue(); // Update retry count in DB
      } else {
          // Hard fail after 3 tries
          this.queue.shift(); // Remove from active queue
          this.saveQueue();
          if (callbacks) callbacks.onError(reason);
      }
  }
}

export default UploadManager.getInstance();