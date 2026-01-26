import * as SQLite from 'expo-sqlite';

/**
 * Generates a canonical conversation ID (sorted alphabetically)
 * ensures 'alice' and 'bob' always map to 'alice__bob' regardless of sender.
 */
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
  timestamp: number; 
  media?: string | null;
  media_type?: string | null;
  system_message?: boolean;
  locally_deleted?: boolean;
  album_id?: string | null;
}

const MAX_QUEUE_SIZE = 100;
const DB_NAME = 'connect.db';

class NativeDatabaseAdapter {
  private db: SQLite.SQLiteDatabase | null = null;

  constructor() { 
    try {
      // Open synchronously
      this.db = SQLite.openDatabaseSync(DB_NAME);
      this.init(); 
    } catch (e) {
      console.error("Failed to open SQLite DB", e);
    }
  }

  init() {
    if (!this.db) return;
    try {
        // WAL Check & Enforcement
        this.ensureWAL();

        // Core Schema - using INTEGER for timestamp
        this.db.execSync(`
        CREATE TABLE IF NOT EXISTS messages (
            client_id TEXT PRIMARY KEY, 
            id TEXT UNIQUE, 
            conversation_id TEXT NOT NULL,
            recipient_id TEXT, 
            sender TEXT NOT NULL,
            content TEXT,
            status TEXT DEFAULT 'sent', 
            timestamp INTEGER DEFAULT (strftime('%s', 'now') * 1000), 
            media TEXT,
            media_type TEXT,
            system_message BOOLEAN DEFAULT 0,
            locally_deleted BOOLEAN DEFAULT 0,
            album_id TEXT
        );
        `);

        // Index for high-speed chat rendering
        this.db.execSync(`CREATE INDEX IF NOT EXISTS idx_messages_conversation_ts ON messages (conversation_id, timestamp DESC);`);
        this.db.execSync(`CREATE INDEX IF NOT EXISTS idx_messages_status ON messages (status);`); 

        this.db.execSync(`
          CREATE TABLE IF NOT EXISTS offline_queue (
            id INTEGER PRIMARY KEY AUTOINCREMENT, 
            action_type TEXT, 
            payload TEXT, 
            timestamp INTEGER DEFAULT (strftime('%s', 'now') * 1000),
            retries INTEGER DEFAULT 0
          );
        `);

        this.db.execSync(`
            CREATE TABLE IF NOT EXISTS users (
                username TEXT PRIMARY KEY, id TEXT, avatar TEXT, display_name TEXT
            );
        `);
        
        // --- SAFE MIGRATIONS ---
        this._runMigrations();

        console.log('📦 SQLite Initialized (WAL Mode + Integer TS)');
    } catch (e) { console.error("SQLite Init Failed:", e); }
  }

  //  WAL Enforcement Logic
  private ensureWAL() {
      if (!this.db) return;
      try {
          const res: any = this.db.getFirstSync('PRAGMA journal_mode;');
          if (res?.journal_mode !== 'wal') {
              this.db.execSync('PRAGMA journal_mode = WAL;');
              this.db.execSync('PRAGMA synchronous = NORMAL;');
          }
      } catch (e) { console.warn("WAL check failed", e); }
  }

  private _runMigrations() {
      if (!this.db) return;
      try {
          const tableInfo = this.db.getAllSync("PRAGMA table_info(messages)");
          const hasCol = (name: string) => tableInfo.some((col: any) => col.name === name);

          if (!hasCol('locally_deleted')) {
              this.db.execSync("ALTER TABLE messages ADD COLUMN locally_deleted BOOLEAN DEFAULT 0;");
          }
          if (!hasCol('album_id')) {
              this.db.execSync("ALTER TABLE messages ADD COLUMN album_id TEXT;");
          }

          // Migrate String Timestamps to Integer
          // If we have legacy ISO strings, convert them to Epoch MS
          const sample: any = this.db.getFirstSync("SELECT timestamp FROM messages LIMIT 1");
          if (sample && typeof sample.timestamp === 'string' && isNaN(Number(sample.timestamp))) {
              console.log("⚠️ Migrating timestamps to INTEGER...");
              this.db.execSync(`
                UPDATE messages 
                SET timestamp = CAST(strftime('%s', timestamp) AS INTEGER) * 1000 
                WHERE typeof(timestamp) = 'text';
              `);
          }
      } catch(e) { console.log("Migration check skipped/failed: ", e); }
  }

  /**
   * Internal helper to handle the logic of upserting a single message.
   */
  private _saveMessageInternal(msg: Message) {
    if (!this.db) return;

    let finalConversationId = msg.conversation_id;
    if (!finalConversationId || finalConversationId === 'unknown' || !finalConversationId.includes('__')) {
        if (msg.sender && msg.recipient_id) {
            finalConversationId = getConversationId(msg.sender, msg.recipient_id);
        }
    }

    const isDeletedFlag = (msg.status === 'deleted' || msg.locally_deleted) ? 1 : 0;
    
    // Ensure Timestamp is Number (Epoch MS)
    let ts = msg.timestamp;
    if (typeof ts === 'string') {
        ts = new Date(ts).getTime();
    }
    if (isNaN(ts)) ts = Date.now();

    // 1. Try Update (with privacy redaction)
    const result = this.db.runSync(
        `UPDATE messages 
            SET status = COALESCE(?, status),
                media = CASE WHEN ? = 1 THEN NULL ELSE COALESCE(?, media) END,
                content = CASE WHEN ? = 1 THEN '' ELSE content END,
                id = COALESCE(?, id),
                conversation_id = COALESCE(?, conversation_id),
                album_id = COALESCE(?, album_id),
                locally_deleted = CASE WHEN ? = 1 THEN 1 ELSE locally_deleted END 
            WHERE client_id = ?`,
        [
            msg.status || 'delivered', 
            isDeletedFlag, msg.media ?? null, 
            isDeletedFlag, 
            msg.id ?? null, 
            finalConversationId,
            msg.album_id ?? null,
            isDeletedFlag, 
            msg.client_id
        ]
    );

    // 2. If no rows updated, Insert
    if (result.changes === 0) {
        this.db.runSync(
            `INSERT INTO messages (client_id, id, conversation_id, recipient_id, sender, content, status, timestamp, media, media_type, system_message, locally_deleted, album_id) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                msg.client_id, msg.id ?? null, finalConversationId, msg.recipient_id, msg.sender, 
                isDeletedFlag === 1 ? '' : msg.content, 
                msg.status || 'delivered', ts, // ✅ Save as Integer
                isDeletedFlag === 1 ? null : (msg.media ?? null), 
                msg.media_type ?? null, msg.system_message ? 1 : 0, 
                isDeletedFlag,
                msg.album_id ?? null
            ]
        );
    }
  }

  //PUBLIC API: Single Save
  saveMessage(msg: Message) {
    try {
        this._saveMessageInternal(msg);
    } catch (e) { console.error('DB Save Error:', e); }
  }

  //  PUBLIC API: Batch Save
  saveMessagesBatch(messages: Message[]) {
    if (!this.db || messages.length === 0) return;
    try {
        this.db.withTransactionSync(() => {
            for (const msg of messages) {
                this._saveMessageInternal(msg);
            }
        });
        console.log(`📦 Batched saved ${messages.length} messages`);
    } catch (e) { console.error('Batch Save Failed:', e); }
  }

  deleteMessagesByClientIds(ids: string[]) {
    if (!this.db || ids.length === 0) return;
    const placeholders = ids.map(() => '?').join(',');
    try {
        this.db.runSync(
            `UPDATE messages 
             SET locally_deleted = 1, content = '', media = NULL, status = 'deleted'
             WHERE client_id IN (${placeholders})`, 
            ids
        );
    } catch (e) { console.error("Bulk Delete Failed", e); }
  }

  getMessagesForChat(conversationId: string, limit = 100, offset = 0) { 
    if (!this.db) return [];
    return this.db.getAllSync(
        `SELECT * FROM messages 
         WHERE conversation_id = ? 
         AND (locally_deleted IS NULL OR locally_deleted = 0) 
         ORDER BY timestamp ASC
         LIMIT ? OFFSET ?`, 
        [conversationId, limit, offset]
    ); 
  }

  updateMessageStatus(clientId: string, status: string) { 
    if (!this.db) return;
    try {
        if (status === 'deleted') {
            this.db.runSync(`UPDATE messages SET status = 'deleted', locally_deleted = 1, content = '', media = NULL WHERE client_id = ?`, [clientId]);
        } else {
            this.db.runSync(`UPDATE messages SET status = ? WHERE client_id = ?`, [status, clientId]); 
        }
    } catch(e) {}
  }
  
  markChatAsRead(conversationId: string, currentUser: string) { 
    if (!this.db || !currentUser) return;
    try {
        this.db.runSync(`UPDATE messages SET status = 'read' WHERE conversation_id = ? AND sender != ? AND status != 'read'`, [conversationId, currentUser]); 
    } catch(e) {}
  }
  
  deleteLocalChat(conversationId: string) { 
    if (!this.db) return;
    this.db.runSync(`DELETE FROM messages WHERE conversation_id = ?`, [conversationId]); 
  }
  
  getLocalInbox(currentUser: string) {
    if (!this.db) return [];
    return this.db.getAllSync(`
      SELECT m.*, c.unread_count
      FROM messages m
      INNER JOIN (
          SELECT conversation_id, MAX(timestamp) as max_ts 
          FROM messages 
          WHERE (locally_deleted IS NULL OR locally_deleted = 0)
          GROUP BY conversation_id
      ) latest 
      ON m.conversation_id = latest.conversation_id AND m.timestamp = latest.max_ts
      
      LEFT JOIN (
          SELECT conversation_id, COUNT(*) as unread_count
          FROM messages
          WHERE status != 'read' 
          AND sender != ? 
          AND (locally_deleted IS NULL OR locally_deleted = 0)
          GROUP BY conversation_id
      ) c ON m.conversation_id = c.conversation_id
      
      ORDER BY m.timestamp DESC;
    `, [currentUser]);
  }

  purgeOldMessages(days = 30) {
      if (!this.db) return;
      try {
          const cutoff = Date.now() - (days * 86400000);
          const res = this.db.runSync(
              `DELETE FROM messages 
               WHERE timestamp < ? 
               AND status NOT IN ('sending', 'failed', 'uploading')`,
              [cutoff]
          );
          if (res.changes > 0) {
              console.log(`🧹 Purged ${res.changes} old messages.`);
              this.db.execSync('VACUUM;'); 
          }
      } catch (e) { console.error("Purge Failed:", e); }
  }

  addToQueue(actionType: string, payload: any): boolean {
    if (!this.db) return false;
    try {
      const result: any[] = this.db.getAllSync('SELECT COUNT(*) as count FROM offline_queue');
      if (result[0]?.count >= MAX_QUEUE_SIZE) {
          return false;
      }
      // Payload timestamp handled by DEFAULT constraint or explicit if needed
      this.db.runSync(`INSERT INTO offline_queue (action_type, payload, retries) VALUES (?, ?, 0)`, [actionType, JSON.stringify(payload)]);
      return true;
    } catch (e) { return false; }
  }
  
  getQueue() { if (!this.db) return []; return this.db.getAllSync('SELECT * FROM offline_queue ORDER BY id ASC'); }
  incrementRetryCount(id: number) { if (!this.db) return; this.db.runSync('UPDATE offline_queue SET retries = retries + 1 WHERE id = ?', [id]); }
  removeFromQueue(id: number) { if (!this.db) return; this.db.runSync('DELETE FROM offline_queue WHERE id = ?', [id]); }
  clearQueue() { if (!this.db) return; this.db.runSync('DELETE FROM offline_queue'); }

  saveUser(user: any) { 
      if (!this.db) return; 
      try {
        this.db.runSync(`INSERT OR REPLACE INTO users (username, id, avatar, display_name) VALUES (?, ?, ?, ?)`, [user.username, user.id, user.avatar || '', user.display_name || user.username]); 
      } catch(e) {}
  }
  getUser(username: string) { if (!this.db) return null; try { const result = this.db.getAllSync(`SELECT * FROM users WHERE username = ?`, [username]); return result.length > 0 ? result[0] : null; } catch (e) { return null; } }
}

// Lazy Initialization Singleton
let adapter: NativeDatabaseAdapter | null = null;

export const getAdapter = () => {
    if (!adapter) {
        adapter = new NativeDatabaseAdapter();
    }
    return adapter;
};

// Export wrapper functions that use the lazy adapter
export const initDB = () => getAdapter().init();
export const saveMessage = (msg: Message) => getAdapter().saveMessage(msg);
export const saveMessagesBatch = (msgs: Message[]) => getAdapter().saveMessagesBatch(msgs);
export const updateMessageStatus = (cid: string, status: string) => getAdapter().updateMessageStatus(cid, status);
export const getMessagesForChat = (cid: string, limit?: number, offset?: number) => getAdapter().getMessagesForChat(cid, limit, offset);
export const markChatAsRead = (cid: string, currentUser: string) => getAdapter().markChatAsRead(cid, currentUser);
export const deleteLocalChat = (cid: string) => getAdapter().deleteLocalChat(cid);
export const getLocalInbox = (user: string = "") => getAdapter().getLocalInbox(user);
export const addToQueue = (actionType: string, payload: any) => getAdapter().addToQueue(actionType, payload);
export const getQueue = () => getAdapter().getQueue();
export const incrementRetryCount = (id: number) => getAdapter().incrementRetryCount(id);
export const removeFromQueue = (id: number) => getAdapter().removeFromQueue(id);
export const clearQueue = () => getAdapter().clearQueue();
export const saveUser = (user: any) => getAdapter().saveUser(user);
export const getUser = (username: string) => getAdapter().getUser(username);
export const deleteMessagesByClientIds = (ids: string[]) => getAdapter().deleteMessagesByClientIds(ids);
export const purgeOldMessages = (days?: number) => getAdapter().purgeOldMessages(days);
export const generateUUID = () => { return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16); }); };