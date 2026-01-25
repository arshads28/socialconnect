import NetInfo from '@react-native-community/netinfo';

export type UploadTask = {
  id: string;
  uri: string;
  type: 'image' | 'video';
  endpoint: string;
  headers?: Record<string, string>;
  additionalData?: Record<string, any>; 
  onProgress: (percent: number) => void;
  onSuccess: (response: any) => void;
  onError: (error: any) => void;
};

class UploadManager {
  private static instance: UploadManager;
  private queue: UploadTask[] = [];
  private uploading = false;

  static getInstance() {
    if (!UploadManager.instance) {
      UploadManager.instance = new UploadManager();
    }
    return UploadManager.instance;
  }

  add(task: UploadTask) {
    this.queue.push(task);
    this.process();
  }

  retry(task: UploadTask) {
    this.queue.unshift(task);
    this.process();
  }

  private async process() {
    if (this.uploading || this.queue.length === 0) return;

    const net = await NetInfo.fetch();
    if (!net.isConnected) return; 

    this.uploading = true;
    const task = this.queue.shift()!;
    this.upload(task);
  }

  private upload(task: UploadTask) {
    const xhr = new XMLHttpRequest();
    const formData = new FormData();

    const filename = task.uri.split('/').pop() || (task.type === 'video' ? 'video.mp4' : 'image.jpg');
    const mimeType = task.type === 'video' ? 'video/mp4' : 'image/jpeg';

    // @ts-ignore
    formData.append('media', {
      uri: task.uri,
      name: filename,
      type: mimeType,
    });

    if (task.additionalData) {
      Object.entries(task.additionalData).forEach(([key, value]) => {
        formData.append(key, value);
      });
    }

    // ✅ HARDENING: Timeout Logic (45 seconds)
    xhr.timeout = 45000; 

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        const percent = Math.round((e.loaded / e.total) * 100);
        task.onProgress(percent);
      }
    };

    xhr.onload = () => {
      this.uploading = false;
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
            const res = JSON.parse(xhr.responseText);
            task.onSuccess(res);
        } catch (e) {
            task.onSuccess(xhr.responseText);
        }
      } else {
        task.onError(xhr.statusText);
      }
      this.process(); 
    };

    xhr.onerror = (e) => {
      this.uploading = false;
      task.onError(e);
      this.process(); 
    };

    // ✅ HARDENING: Handle Timeout
    xhr.ontimeout = () => {
      this.uploading = false;
      task.onError(new Error("Upload timed out"));
      this.process();
    };

    xhr.open('POST', task.endpoint);
    if (task.headers) {
      Object.entries(task.headers).forEach(([k, v]) =>
        xhr.setRequestHeader(k, v)
      );
    }
    xhr.send(formData);
  }
}

export default UploadManager.getInstance();