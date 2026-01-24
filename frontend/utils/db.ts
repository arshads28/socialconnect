import * as SQLite from 'expo-sqlite';

export interface Message {
  client_id: string;
  id?: string | null;
  conversation_id: string;
  recipient_id: string;
  sender: string;
  content: string;
  status: string;
  timestamp: string;
  is_own: number | boolean;
}

const MAX_QUEUE_SIZE = 50;

interface IDatabaseAdapter {
  init(): void;
  saveMessage(msg: any): void;
  updateMessageStatus(clientId: string, status: string): void;
  getMessagesForChat(username: string): any[];
  markChatAsRead(username: string): void;
  deleteLocalChat(username: string): void;
  getLocalInbox(): any[];
  
  // Queue Methods
  addToQueue(actionType: string, payload: any): boolean;
  getQueue(): any[];
  incrementRetryCount(id: number): void;
  removeFromQueue(id: number): void;
  clearQueue(): void;

  // User Cache Methods (New)
  saveUser(user: any): void;
  getUser(username: string): any;
}

class NativeDatabaseAdapter implements IDatabaseAdapter {
  private db: SQLite.SQLiteDatabase | null = null;

  constructor() { 
    try {
      this.db = SQLite.openDatabaseSync('connect.db');
    } catch (e) {
      console.error("Failed to open SQLite DB", e);
    }
  }

  init() {
    if (!this.db) return;
    try {
        // 1. Messages Table
        this.db.execSync(`
        CREATE TABLE IF NOT EXISTS messages (
            client_id TEXT PRIMARY KEY, 
            id TEXT, 
            conversation_id TEXT,
            recipient_id TEXT, 
            sender TEXT,
            content TEXT,
            status TEXT, 
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            is_own INTEGER DEFAULT 0
        );
        `);

        // 2. Queue Table
        this.db.execSync(`
          CREATE TABLE IF NOT EXISTS offline_queue (
            id INTEGER PRIMARY KEY AUTOINCREMENT, 
            action_type TEXT, 
            payload TEXT, 
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            retries INTEGER DEFAULT 0
          );
        `);

        // 3. User Cache Table (New)
        this.db.execSync(`
            CREATE TABLE IF NOT EXISTS users (
                username TEXT PRIMARY KEY,
                id TEXT,
                avatar TEXT,
                display_name TEXT
            );
        `);

        // Migration: Add 'retries' column for existing users
        try {
          this.db.execSync('ALTER TABLE offline_queue ADD COLUMN retries INTEGER DEFAULT 0;');
        } catch (e) {
          // Ignore if exists
        }

        console.log('📦 SQLite Initialized (Messages + Queue + Users)');
    } catch (e) {
        console.error("SQLite Init Failed:", e);
    }
  }

  saveMessage(msg: any) {
    if (!this.db) return;
    try {
      this.db.runSync(
        `INSERT OR REPLACE INTO messages (client_id, id, conversation_id, recipient_id, sender, content, status, timestamp, is_own) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [msg.client_id, msg.id, msg.conversation_id, msg.recipient_id, msg.sender, msg.content, msg.status || 'delivered', msg.timestamp, msg.is_own ? 1 : 0]
      );
    } catch (e) { console.error('DB Save Error:', e); }
  }

  updateMessageStatus(clientId: string, status: string) { 
    if (!this.db) return;
    this.db.runSync(`UPDATE messages SET status = ? WHERE client_id = ?`, [status, clientId]); 
  }
  
  getMessagesForChat(username: string) { 
    if (!this.db) return [];
    return this.db.getAllSync(`SELECT * FROM messages WHERE conversation_id = ? ORDER BY timestamp ASC`, [username]); 
  }
  
  markChatAsRead(username: string) { 
    if (!this.db) return;
    this.db.runSync(`UPDATE messages SET status = 'read' WHERE conversation_id = ? AND is_own = 0`, [username]); 
  }
  
  deleteLocalChat(username: string) { 
    if (!this.db) return;
    this.db.runSync(`DELETE FROM messages WHERE conversation_id = ?`, [username]); 
  }
  
  getLocalInbox() {
    if (!this.db) return [];
    return this.db.getAllSync(`
      SELECT m.*, (SELECT COUNT(*) FROM messages WHERE conversation_id = m.conversation_id AND status != 'read' AND is_own = 0) as unread_count
      FROM messages m
      INNER JOIN (SELECT conversation_id, MAX(timestamp) as max_ts FROM messages GROUP BY conversation_id) latest 
      ON m.conversation_id = latest.conversation_id AND m.timestamp = latest.max_ts
      ORDER BY m.timestamp DESC;
    `);
  }

  // --- QUEUE METHODS ---

  addToQueue(actionType: string, payload: any): boolean {
    if (!this.db) return false;
    try {
      const result: any[] = this.db.getAllSync('SELECT COUNT(*) as count FROM offline_queue');
      if (result[0]?.count >= MAX_QUEUE_SIZE) return false;
      
      this.db.runSync(
        `INSERT INTO offline_queue (action_type, payload, retries) VALUES (?, ?, 0)`, 
        [actionType, JSON.stringify(payload)]
      );
      return true;
    } catch (e) { return false; }
  }
  
  getQueue() { 
    if (!this.db) return [];
    return this.db.getAllSync('SELECT * FROM offline_queue ORDER BY id ASC'); 
  }

  incrementRetryCount(id: number) {
    if (!this.db) return;
    try {
      this.db.runSync('UPDATE offline_queue SET retries = retries + 1 WHERE id = ?', [id]);
    } catch(e) { console.error("DB Retry Inc Failed:", e); }
  }
  
  removeFromQueue(id: number) { 
    if (!this.db) return;
    this.db.runSync('DELETE FROM offline_queue WHERE id = ?', [id]); 
  }
  
  clearQueue() { 
    if (!this.db) return;
    this.db.runSync('DELETE FROM offline_queue'); 
  }

  // --- USER CACHE METHODS ---
  saveUser(user: any) {
    if (!this.db) return;
    try {
        this.db.runSync(
            `INSERT OR REPLACE INTO users (username, id, avatar, display_name) VALUES (?, ?, ?, ?)`,
            [user.username, user.id, user.avatar || '', user.display_name || user.username]
        );
    } catch (e) { console.error('DB Save User Error:', e); }
  }

  getUser(username: string) {
    if (!this.db) return null;
    try {
        const result = this.db.getAllSync(`SELECT * FROM users WHERE username = ?`, [username]);
        return result.length > 0 ? result[0] : null;
    } catch (e) { return null; }
  }
}

// Strictly Native Adapter
const adapter = new NativeDatabaseAdapter();

// Exports
export const initDB = () => adapter.init();
export const saveMessage = (msg: any) => adapter.saveMessage(msg);
export const updateMessageStatus = (cid: string, status: string) => adapter.updateMessageStatus(cid, status);
export const getMessagesForChat = (user: string) => adapter.getMessagesForChat(user);
export const markChatAsRead = (user: string) => adapter.markChatAsRead(user);
export const deleteLocalChat = (user: string) => adapter.deleteLocalChat(user);
export const getLocalInbox = () => adapter.getLocalInbox();

// Queue Exports
export const addToQueue = (actionType: string, payload: any) => adapter.addToQueue(actionType, payload);
export const getQueue = () => adapter.getQueue();
export const incrementRetryCount = (id: number) => adapter.incrementRetryCount(id);
export const removeFromQueue = (id: number) => adapter.removeFromQueue(id);
export const clearQueue = () => adapter.clearQueue();

// User Exports
export const saveUser = (user: any) => adapter.saveUser(user);
export const getUser = (username: string) => adapter.getUser(username);

export const generateUUID = () => {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = Math.random() * 16 | 0;
        return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
};