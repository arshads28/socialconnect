import NetInfo from '@react-native-community/netinfo';
import AsyncStorage from '@react-native-async-storage/async-storage'; 

const PERSISTENCE_KEY = 'upload_manager_queue_v1';

export type UploadTask = {
  id: string;
  files: { uri: string, type: 'image' | 'video' }[]; // Array format
  endpoint: string;
  headers?: Record<string, string>;
  additionalData?: Record<string, any>; 
  retryCount: number; 
  callbacks?: TaskCallbacks; // Transient callbacks
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
      // Don't save functions (callbacks) to storage
      const safeQueue = this.queue.map(({ callbacks, ...rest }) => rest);
      await AsyncStorage.setItem(PERSISTENCE_KEY, JSON.stringify(safeQueue));
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
  add(task: Omit<UploadTask, 'retryCount'>, callbacks?: TaskCallbacks) {
    const fullTask: UploadTask = { ...task, retryCount: 0 };
    
    // Store callbacks in memory map, NOT in the task object (for persistence safety)
    if (callbacks) {
        this.callbacks.set(task.id, callbacks);
        // Also attach locally for immediate use
        fullTask.callbacks = callbacks;
    }
    
    this.queue.push(fullTask);
    this.saveQueue(); 
    this.process();
  }

  //  3. Retry Logic
  retry(taskId: string) {
    const taskIndex = this.queue.findIndex(t => t.id === taskId);
    if (taskIndex > -1) {
        const [task] = this.queue.splice(taskIndex, 1);
        task.retryCount = 0; 
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
    const task = this.queue[0]; // Peek
    this.upload(task);
  }

  private upload(task: UploadTask) {
    const file = task.files[0]; // Take first file
    
    // If no files left, task is complete
    if (!file) {
        const cbs = this.callbacks.get(task.id) || task.callbacks;
        if (cbs) cbs.onSuccess({ status: 'done' });
        
        this.queue.shift();
        this.callbacks.delete(task.id);
        this.saveQueue();
        this.uploading = false; // Reset flag
        this.process();
        return;
    }

    const xhr = new XMLHttpRequest();
    const formData = new FormData();

    const filename = file.uri.split('/').pop() || 'image.jpg';
    const mimeType = 'image/jpeg'; // Force image since we disabled video

    // @ts-ignore
    formData.append('media', {
      uri: file.uri,
      name: filename,
      type: mimeType,
    });

    if (task.additionalData) {
      Object.entries(task.additionalData).forEach(([key, value]) => {
        formData.append(key, value);
      });
    }

    xhr.timeout = 60000; 

    const cbs = this.callbacks.get(task.id) || task.callbacks;

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && cbs) {
        const percent = Math.round((e.loaded / e.total) * 100);
        cbs.onProgress(percent);
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
          // Success! Remove this file from list
          task.files.shift(); 
          
          let response = {};
          try { response = JSON.parse(xhr.responseText); } catch(e){}

          // If it was the last file, success callback happens next cycle
          if (task.files.length === 0 && cbs) {
              cbs.onSuccess(response);
          }
          
          this.saveQueue();
          this.upload(task); // Recursive for next file (or finish)
      } else {
          this.uploading = false;
          this.handleFailure(task, xhr.statusText);
      }
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

  private handleFailure(task: UploadTask, reason: string) {
      const cbs = this.callbacks.get(task.id) || task.callbacks;
      
      if (task.retryCount < 3) {
          console.log(`Auto-retrying upload ${task.id} (${task.retryCount + 1}/3)`);
          task.retryCount++;
          this.saveQueue(); 
      } else {
          this.queue.shift(); 
          this.callbacks.delete(task.id);
          this.saveQueue();
          if (cbs) cbs.onError(reason);
      }
  }
}

export default UploadManager.getInstance();