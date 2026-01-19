import { Platform } from 'react-native';
import * as SQLite from 'expo-sqlite';

// ✅ CONFIG: Maximum allowed pending actions to prevent storage bloat
const MAX_QUEUE_SIZE = 50;

// =======================================================
// 1. THE INTERFACE
// =======================================================
interface IDatabaseAdapter {
  init(): void;
  saveMessage(msg: any): void;
  updateMessageStatus(clientId: string, status: string): void;
  getMessagesForChat(username: string): any[];
  markChatAsRead(username: string): void;
  deleteLocalChat(username: string): void;
  getLocalInbox(): any[];
  
  // ✅ Offline Queue Interface (Returns boolean for success/fail)
  addToQueue(actionType: string, payload: any): boolean;
  getQueue(): any[];
  removeFromQueue(id: number): void;
}

// =======================================================
// 2. WEB ADAPTER (LocalStorage)
// =======================================================
class WebDatabaseAdapter implements IDatabaseAdapter {
  private STORAGE_KEY = 'connect_messages_v1';
  private QUEUE_KEY = 'connect_offline_queue_v1';

  private getData(): any[] {
    const raw = localStorage.getItem(this.STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  }

  private saveData(data: any[]) {
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(data));
  }

  // --- Queue Helpers (Web) ---
  private getQueueData(): any[] {
    const raw = localStorage.getItem(this.QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  }

  private saveQueueData(data: any[]) {
    localStorage.setItem(this.QUEUE_KEY, JSON.stringify(data));
  }

  init() {
    console.log('🌐 Web Adapter Initialized');
  }

  // ... (Existing Message Methods) ...
  saveMessage(msg: any) {
    const data = this.getData();
    const index = data.findIndex((m: any) => m.client_id === msg.client_id);
    
    const cleanMsg = {
        ...msg, 
        status: msg.status || 'delivered',
        is_own: msg.is_own ? 1 : 0 
    };

    if (index >= 0) {
      data[index] = { ...data[index], ...cleanMsg };
    } else {
      data.push(cleanMsg);
    }
    this.saveData(data);
  }

  updateMessageStatus(clientId: string, status: string) {
    const data = this.getData();
    const msg = data.find((m: any) => m.client_id === clientId);
    if (msg) {
      msg.status = status;
      this.saveData(data);
    }
  }

  getMessagesForChat(username: string) {
    return this.getData()
      .filter((m: any) => m.conversation_id === username)
      .sort((a: any, b: any) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  }

  markChatAsRead(username: string) {
    const data = this.getData();
    let changed = false;
    data.forEach((m: any) => {
      if (m.conversation_id === username && m.is_own === 0 && m.status !== 'read') {
        m.status = 'read';
        changed = true;
      }
    });
    if (changed) this.saveData(data);
  }

  deleteLocalChat(username: string) {
    const data = this.getData();
    const filtered = data.filter((m: any) => m.conversation_id !== username);
    this.saveData(filtered);
  }

  getLocalInbox() {
    const data = this.getData();
    const inboxMap = new Map();
    data.forEach((msg: any) => {
      const existing = inboxMap.get(msg.conversation_id);
      if (!existing || new Date(msg.timestamp) > new Date(existing.timestamp)) {
        inboxMap.set(msg.conversation_id, msg);
      }
    });
    return Array.from(inboxMap.values())
      .map((chat: any) => ({
        ...chat,
        unread_count: data.filter((m:any) => m.conversation_id === chat.conversation_id && m.status !== 'read' && !m.is_own).length
      }))
      .sort((a: any, b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }

  // ✅ Web Queue Implementation with Limit
  addToQueue(actionType: string, payload: any): boolean {
    const queue = this.getQueueData();
    
    if (queue.length >= MAX_QUEUE_SIZE) {
        console.warn(`⚠️ [Web] Queue full (${queue.length}). Action rejected.`);
        return false;
    }

    const newId = queue.length > 0 ? Math.max(...queue.map((i: any) => i.id)) + 1 : 1;
    
    queue.push({
      id: newId,
      action_type: actionType,
      payload: JSON.stringify(payload),
      timestamp: new Date().toISOString()
    });
    this.saveQueueData(queue);
    console.log(`🌐 [Web] Queued: ${actionType}`);
    return true;
  }

  getQueue() {
    return this.getQueueData();
  }

  removeFromQueue(id: number) {
    const queue = this.getQueueData();
    const filtered = queue.filter((item: any) => item.id !== id);
    this.saveQueueData(filtered);
  }
}

// =======================================================
// 3. NATIVE ADAPTER (SQLite)
// =======================================================
class NativeDatabaseAdapter implements IDatabaseAdapter {
  private db: any;

  constructor() {
    if (Platform.OS !== 'web') {
        this.db = SQLite.openDatabaseSync('connect.db');
    }
  }

  init() {
    if (Platform.OS === 'web') return;
    
    // 1. Messages Table (Correct Schema with Primary Key)
    this.db.execSync(`
      CREATE TABLE IF NOT EXISTS messages (
        client_id TEXT PRIMARY KEY, 
        id TEXT, 
        conversation_id TEXT,
        sender TEXT,
        content TEXT,
        status TEXT, 
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        is_own INTEGER DEFAULT 0
      );
    `);

    // 2. Offline Queue Table
    this.db.execSync(`
      CREATE TABLE IF NOT EXISTS offline_queue (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        action_type TEXT,
        payload TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('📦 SQLite Initialized (Messages + Queue)');
  }

  // ... (Existing Message Methods) ...
  saveMessage(msg: any) {
    try {
      this.db.runSync(
        `INSERT OR REPLACE INTO messages (
           client_id, id, conversation_id, sender, content, status, timestamp, is_own
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          msg.client_id, 
          msg.id, 
          msg.conversation_id, 
          msg.sender, 
          msg.content, 
          msg.status || 'delivered', 
          msg.timestamp, 
          msg.is_own ? 1 : 0
        ]
      );
    } catch (e) {
      console.error('DB Save Error:', e);
    }
  }

  updateMessageStatus(clientId: string, status: string) {
    this.db.runSync(`UPDATE messages SET status = ? WHERE client_id = ?`, [status, clientId]);
  }

  getMessagesForChat(username: string) {
    return this.db.getAllSync(
      `SELECT * FROM messages WHERE conversation_id = ? ORDER BY timestamp ASC`,
      [username]
    );
  }

  markChatAsRead(username: string) {
    this.db.runSync(`UPDATE messages SET status = 'read' WHERE conversation_id = ? AND is_own = 0`, [username]);
  }

  deleteLocalChat(username: string) {
    this.db.runSync(`DELETE FROM messages WHERE conversation_id = ?`, [username]);
  }

  getLocalInbox() {
    return this.db.getAllSync(`
      SELECT 
        m.conversation_id, 
        m.content, 
        m.timestamp, 
        m.status,
        m.is_own,
        (SELECT COUNT(*) FROM messages WHERE conversation_id = m.conversation_id AND status != 'read' AND is_own = 0) as unread_count
      FROM messages m
      INNER JOIN (
        SELECT conversation_id, MAX(timestamp) as max_ts FROM messages GROUP BY conversation_id
      ) latest 
      ON m.conversation_id = latest.conversation_id AND m.timestamp = latest.max_ts
      WHERE m.conversation_id IS NOT NULL 
      ORDER BY m.timestamp DESC;
    `);
  }

  // ✅ Native Queue Implementation with Limit
  addToQueue(actionType: string, payload: any): boolean {
    try {
      // 1. Check Count
      const result = this.db.getAllSync('SELECT COUNT(*) as count FROM offline_queue');
      const count = result[0]?.count || 0;

      if (count >= MAX_QUEUE_SIZE) {
        console.warn(`⚠️ [SQLite] Queue full (${count}). Rejected.`);
        return false;
      }

      // 2. Insert
      this.db.runSync(
        `INSERT INTO offline_queue (action_type, payload) VALUES (?, ?)`,
        [actionType, JSON.stringify(payload)]
      );
      console.log(`📱 [SQLite] Queued: ${actionType}`);
      return true;
    } catch (e) {
      console.error("Queue Error:", e);
      return false;
    }
  }

  getQueue() {
    return this.db.getAllSync('SELECT * FROM offline_queue ORDER BY id ASC');
  }

  removeFromQueue(id: number) {
    this.db.runSync('DELETE FROM offline_queue WHERE id = ?', [id]);
  }
}

// =======================================================
// 4. FACTORY & EXPORTS
// =======================================================
const adapter: IDatabaseAdapter = Platform.OS === 'web' ? new WebDatabaseAdapter() : new NativeDatabaseAdapter();

// Existing exports
export const initDB = () => adapter.init();
export const saveMessage = (msg: any) => adapter.saveMessage(msg);
export const updateMessageStatus = (cid: string, status: string) => adapter.updateMessageStatus(cid, status);
export const getMessagesForChat = (user: string) => adapter.getMessagesForChat(user);
export const markChatAsRead = (user: string) => adapter.markChatAsRead(user);
export const deleteLocalChat = (user: string) => adapter.deleteLocalChat(user);
export const getLocalInbox = () => adapter.getLocalInbox();
export const addToQueue = (actionType: string, payload: any) => adapter.addToQueue(actionType, payload);
export const getQueue = () => adapter.getQueue();
export const removeFromQueue = (id: number) => adapter.removeFromQueue(id);

export const generateUUID = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
};