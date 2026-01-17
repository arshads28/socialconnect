import { Platform } from 'react-native';
import * as SQLite from 'expo-sqlite';

// =======================================================
// 1. THE INTERFACE (The Contract)
// =======================================================
interface IDatabaseAdapter {
  init(): void;
  saveMessage(msg: any): void;
  updateMessageStatus(clientId: string, status: string): void;
  getMessagesForChat(username: string): any[];
  markChatAsRead(username: string): void;
  deleteLocalChat(username: string): void;
  getLocalInbox(): any[];
}

// =======================================================
// 2. WEB ADAPTER (LocalStorage Implementation)
// =======================================================
class WebDatabaseAdapter implements IDatabaseAdapter {
  private STORAGE_KEY = 'connect_messages_v1';

  private getData(): any[] {
    const raw = localStorage.getItem(this.STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  }

  private saveData(data: any[]) {
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(data));
  }

  init() {
    console.log('🌐 Web Adapter Initialized (LocalStorage)');
  }

  saveMessage(msg: any) {
    const data = this.getData();
    // Logic: Update if exists, Insert if new
    const index = data.findIndex((m: any) => m.client_id === msg.client_id);
    
    // Sanitize for JSON (ensure booleans/nulls are safe)
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
    console.log(`🗑️ Deleted web chat with ${username}`);
  }

  getLocalInbox() {
    const data = this.getData();
    const inboxMap = new Map();

    // Group By Logic for Web
    data.forEach((msg: any) => {
      const existing = inboxMap.get(msg.conversation_id);
      if (!existing || new Date(msg.timestamp) > new Date(existing.timestamp)) {
        inboxMap.set(msg.conversation_id, msg);
      }
    });

    return Array.from(inboxMap.values())
      .map((chat: any) => {
        const unreadCount = data.filter(
          (m: any) => m.conversation_id === chat.conversation_id && m.status !== 'read' && !m.is_own
        ).length;
        return { ...chat, unread_count: unreadCount };
      })
      .sort((a: any, b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }
}




// =======================================================
// 3. NATIVE ADAPTER (SQLite Implementation)
// =======================================================
class NativeDatabaseAdapter implements IDatabaseAdapter {
  private db: any;

  constructor() {
    // Only open DB if we are NOT on web to prevent crashes
    if (Platform.OS !== 'web') {
        this.db = SQLite.openDatabaseSync('connect.db');
    }
  }

  init() {
    if (Platform.OS === 'web') return;
    this.db.execSync(`
      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        client_id TEXT UNIQUE,
        conversation_id TEXT,
        sender TEXT,
        content TEXT,
        status TEXT, 
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        is_own INTEGER DEFAULT 0
      );
    `);
    console.log('📦 SQLite Initialized');
  }

  saveMessage(msg: any) {
    try {
      this.db.runSync(
        `INSERT OR REPLACE INTO messages (id, client_id, conversation_id, sender, content, status, timestamp, is_own)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          msg.id, msg.client_id, msg.conversation_id, msg.sender, msg.content, 
          msg.status || 'delivered', msg.timestamp, msg.is_own ? 1 : 0
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
    try {
      this.db.runSync(`DELETE FROM messages WHERE conversation_id = ?`, [username]);
      console.log(`🗑️ Deleted local chat with ${username}`);
    } catch (e) {
      console.error("Error deleting chat:", e);
    }
  }

  getLocalInbox() {
    return this.db.getAllSync(`
      SELECT 
        m.conversation_id, 
        m.content, 
        m.timestamp, 
        m.status,
        m.is_own,
        (
          SELECT COUNT(*) 
          FROM messages 
          WHERE conversation_id = m.conversation_id 
          AND status != 'read' 
          AND is_own = 0
        ) as unread_count
      FROM messages m
      INNER JOIN (
        SELECT conversation_id, MAX(timestamp) as max_ts
        FROM messages
        GROUP BY conversation_id
      ) latest 
      ON m.conversation_id = latest.conversation_id 
      AND m.timestamp = latest.max_ts
      WHERE m.conversation_id IS NOT NULL 
      ORDER BY m.timestamp DESC;
    `);
  }
}

// =======================================================
// 4. FACTORY & EXPORTS
// =======================================================

// Instantiate the correct class based on the platform
const adapter: IDatabaseAdapter = Platform.OS === 'web' 
  ? new WebDatabaseAdapter() 
  : new NativeDatabaseAdapter();

// Export the methods directly so the rest of the app doesn't need to change
export const initDB = () => adapter.init();
export const saveMessage = (msg: any) => adapter.saveMessage(msg);
export const updateMessageStatus = (cid: string, status: string) => adapter.updateMessageStatus(cid, status);
export const getMessagesForChat = (user: string) => adapter.getMessagesForChat(user);
export const markChatAsRead = (user: string) => adapter.markChatAsRead(user);
export const deleteLocalChat = (user: string) => adapter.deleteLocalChat(user);
export const getLocalInbox = () => adapter.getLocalInbox();

// Helper: Generate UUID (Works on both)
export const generateUUID = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    if (Platform.OS === 'web') {
        return (Math.random() * 16 | 0).toString(16);
    }
    // @ts-ignore
    const r = crypto.getRandomValues(new Uint8Array(1))[0] & 0x0f; 
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
};