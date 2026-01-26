import * as SQLite from 'expo-sqlite';

export const getConversationId = (userA: string, userB: string) => {
    if (!userA || !userB) return "unknown";
    return [userA, userB].sort().join('__');
};

export interface Message {
  client_id: string;
  id?: string | null;
  conversation_id: string;
  recipient_id: string;
  sender: string;
  content: string;
  status: string;
  timestamp: string; 
  media?: string | null;
  media_type?: string | null;
  system_message?: boolean;
  locally_deleted?: boolean;
  album_id?: string | null;
}

const MAX_QUEUE_SIZE = 50;

class NativeDatabaseAdapter {
  private db: SQLite.SQLiteDatabase | null = null;

  constructor() { 
    try {
      this.db = SQLite.openDatabaseSync('connect.db');
      this.init(); 
    } catch (e) {
      console.error("Failed to open SQLite DB", e);
    }
  }

  init() {
    if (!this.db) return;
    try {
        // Core Schema
        this.db.execSync(`
        CREATE TABLE IF NOT EXISTS messages (
            client_id TEXT PRIMARY KEY, 
            id TEXT UNIQUE, 
            conversation_id TEXT NOT NULL,
            recipient_id TEXT, 
            sender TEXT NOT NULL,
            content TEXT,
            status TEXT DEFAULT 'sent', 
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            media TEXT,
            media_type TEXT,
            system_message BOOLEAN DEFAULT 0,
            locally_deleted BOOLEAN DEFAULT 0 
        );
        `);

        this.db.execSync(`CREATE INDEX IF NOT EXISTS idx_messages_conversation_ts ON messages (conversation_id, timestamp DESC);`);

        this.db.execSync(`
          CREATE TABLE IF NOT EXISTS offline_queue (
            id INTEGER PRIMARY KEY AUTOINCREMENT, 
            action_type TEXT, 
            payload TEXT, 
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            retries INTEGER DEFAULT 0
          );
        `);
        this.db.execSync(`
            CREATE TABLE IF NOT EXISTS users (
                username TEXT PRIMARY KEY, id TEXT, avatar TEXT, display_name TEXT
            );
        `);
        
        // Safe Migration for locally_deleted
        try {
            const tableInfo = this.db.getAllSync("PRAGMA table_info(messages)");
            if (!tableInfo.some((col: any) => col.name === 'locally_deleted')) {
                this.db.execSync("ALTER TABLE messages ADD COLUMN locally_deleted BOOLEAN DEFAULT 0;");
            }
        } catch(e) { /* ignore */ }

        console.log('📦 SQLite Initialized');
    } catch (e) { console.error("SQLite Init Failed:", e); }
  }

  // ✅ UPDATED: Guaranteed Redaction on Update
  saveMessage(msg: Message) {
    if (!this.db) return;

    let finalConversationId = msg.conversation_id;
    if (!finalConversationId || finalConversationId === 'unknown' || !finalConversationId.includes('__')) {
        if (msg.sender && msg.recipient_id) {
            finalConversationId = getConversationId(msg.sender, msg.recipient_id);
        }
    }

    const isDeleted = (msg.status === 'deleted' || msg.locally_deleted) ? 1 : 0;
    
    try {
      // ✅ LOGIC: If isDeleted=1, force content/media to NULL/Empty during UPDATE
      // This prevents "Zombie" data where the flag is set but content remains.
      const result = this.db.runSync(
        `UPDATE messages 
         SET status = COALESCE(?, status),
             media = CASE WHEN ? = 1 THEN NULL ELSE COALESCE(?, media) END,
             content = CASE WHEN ? = 1 THEN '' ELSE content END,
             id = COALESCE(?, id),
             conversation_id = COALESCE(?, conversation_id),
             locally_deleted = CASE WHEN ? = 1 THEN 1 ELSE locally_deleted END 
         WHERE client_id = ?`,
        [
            msg.status || 'delivered', 
            isDeleted, // Check for Media redaction
            msg.media ?? null, 
            isDeleted, // Check for Content redaction
            msg.id ?? null, 
            finalConversationId, 
            isDeleted, // Update deleted flag
            msg.client_id
        ]
      );

      if (result.changes === 0) {
          this.db.runSync(
            `INSERT INTO messages (client_id, id, conversation_id, recipient_id, sender, content, status, timestamp, media, media_type, system_message, locally_deleted) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                msg.client_id, msg.id ?? null, finalConversationId, msg.recipient_id, msg.sender, 
                msg.content, msg.status || 'delivered', msg.timestamp, msg.media ?? null, 
                msg.media_type ?? null, msg.system_message ? 1 : 0, 
                isDeleted 
            ]
          );
      }
    } catch (e) { console.error('DB Save Error:', e); }
  }

  // ✅ Soft Delete Helper (Clears content immediately)
  deleteMessagesByClientIds(ids: string[]) {
    if (!this.db || ids.length === 0) return;
    const placeholders = ids.map(() => '?').join(',');
    this.db.runSync(
        `UPDATE messages 
         SET locally_deleted = 1, content = '', media = NULL, status = 'deleted'
         WHERE client_id IN (${placeholders})`, 
        ids
    );
  }

  // ✅ Filter out hidden messages
  getMessagesForChat(conversationId: string) { 
    if (!this.db) return [];
    return this.db.getAllSync(
        `SELECT * FROM messages 
         WHERE conversation_id = ? 
         AND (locally_deleted IS NULL OR locally_deleted = 0) 
         ORDER BY timestamp ASC`, 
        [conversationId]
    ); 
  }

  updateMessageStatus(clientId: string, status: string) { 
    if (!this.db) return;
    if (status === 'deleted') {
        this.db.runSync(`UPDATE messages SET status = 'deleted', locally_deleted = 1, content = '', media = NULL WHERE client_id = ?`, [clientId]);
    } else {
        this.db.runSync(`UPDATE messages SET status = ? WHERE client_id = ?`, [status, clientId]); 
    }
  }
  
  markChatAsRead(conversationId: string, currentUser: string) { 
    if (!this.db || !currentUser) return;
    this.db.runSync(`UPDATE messages SET status = 'read' WHERE conversation_id = ? AND sender != ? AND status != 'read'`, [conversationId, currentUser]); 
  }
  
  deleteLocalChat(conversationId: string) { 
    if (!this.db) return;
    this.db.runSync(`DELETE FROM messages WHERE conversation_id = ?`, [conversationId]); 
  }
  
  getLocalInbox(currentUser: string) {
    if (!this.db) return [];
    return this.db.getAllSync(`
      SELECT m.*, 
      (SELECT COUNT(*) FROM messages WHERE conversation_id = m.conversation_id AND status != 'read' AND sender != ? AND (locally_deleted IS NULL OR locally_deleted = 0)) as unread_count
      FROM messages m
      INNER JOIN (
          SELECT conversation_id, MAX(timestamp) as max_ts 
          FROM messages 
          WHERE (locally_deleted IS NULL OR locally_deleted = 0)
          GROUP BY conversation_id
      ) latest 
      ON m.conversation_id = latest.conversation_id AND m.timestamp = latest.max_ts
      ORDER BY m.timestamp DESC;
    `, [currentUser]);
  }

  addToQueue(actionType: string, payload: any): boolean {
    if (!this.db) return false;
    try {
      const result: any[] = this.db.getAllSync('SELECT COUNT(*) as count FROM offline_queue');
      if (result[0]?.count >= MAX_QUEUE_SIZE) return false;
      this.db.runSync(`INSERT INTO offline_queue (action_type, payload, retries) VALUES (?, ?, 0)`, [actionType, JSON.stringify(payload)]);
      return true;
    } catch (e) { return false; }
  }
  getQueue() { if (!this.db) return []; return this.db.getAllSync('SELECT * FROM offline_queue ORDER BY id ASC'); }
  incrementRetryCount(id: number) { if (!this.db) return; this.db.runSync('UPDATE offline_queue SET retries = retries + 1 WHERE id = ?', [id]); }
  removeFromQueue(id: number) { if (!this.db) return; this.db.runSync('DELETE FROM offline_queue WHERE id = ?', [id]); }
  clearQueue() { if (!this.db) return; this.db.runSync('DELETE FROM offline_queue'); }

  saveUser(user: any) { if (!this.db) return; this.db.runSync(`INSERT OR REPLACE INTO users (username, id, avatar, display_name) VALUES (?, ?, ?, ?)`, [user.username, user.id, user.avatar || '', user.display_name || user.username]); }
  getUser(username: string) { if (!this.db) return null; try { const result = this.db.getAllSync(`SELECT * FROM users WHERE username = ?`, [username]); return result.length > 0 ? result[0] : null; } catch (e) { return null; } }
}

const adapter = new NativeDatabaseAdapter();
export const initDB = () => adapter.init();
export const saveMessage = (msg: Message) => adapter.saveMessage(msg);
export const updateMessageStatus = (cid: string, status: string) => adapter.updateMessageStatus(cid, status);
export const getMessagesForChat = (cid: string) => adapter.getMessagesForChat(cid);
export const markChatAsRead = (cid: string, currentUser: string) => adapter.markChatAsRead(cid, currentUser);
export const deleteLocalChat = (cid: string) => adapter.deleteLocalChat(cid);
export const getLocalInbox = (user: string = "") => adapter.getLocalInbox(user);
export const addToQueue = (actionType: string, payload: any) => adapter.addToQueue(actionType, payload);
export const getQueue = () => adapter.getQueue();
export const incrementRetryCount = (id: number) => adapter.incrementRetryCount(id);
export const removeFromQueue = (id: number) => adapter.removeFromQueue(id);
export const clearQueue = () => adapter.clearQueue();
export const saveUser = (user: any) => adapter.saveUser(user);
export const getUser = (username: string) => adapter.getUser(username);
export const deleteMessagesByClientIds = (ids: string[]) => adapter.deleteMessagesByClientIds(ids);
export const generateUUID = () => { return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16); }); };