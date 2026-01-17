import * as SQLite from 'expo-sqlite';

const db = SQLite.openDatabaseSync('socialconnect.db');

export const initDB = () => {
  db.execSync(`
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
};

export const saveMessage = (msg: any) => {
  try {
    db.runSync(
      `INSERT OR REPLACE INTO messages (id, client_id, conversation_id, sender, content, status, timestamp, is_own)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        msg.id, 
        msg.client_id, 
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
};

export const updateMessageStatus = (clientId: string, status: string) => {
  db.runSync(`UPDATE messages SET status = ? WHERE client_id = ?`, [status, clientId]);
};

export const getMessagesForChat = (username: string) => {
  return db.getAllSync(
    `SELECT * FROM messages WHERE conversation_id = ? ORDER BY timestamp ASC`,
    [username]
  );
};

export const markChatAsRead = (username: string) => {
  db.runSync(`UPDATE messages SET status = 'read' WHERE conversation_id = ? AND is_own = 0`, [username]);
};

export const deleteLocalChat = (username: string) => {
  try {
    db.runSync(`DELETE FROM messages WHERE conversation_id = ?`, [username]);
    console.log(`🗑️ Deleted local chat with ${username}`);
  } catch (e) {
    console.error("Error deleting chat:", e);
  }
};

//  USE THIS ONE (Optimized Inbox Query)
export const getLocalInbox = () => {
  return db.getAllSync(`
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
};



export const generateUUID = () => {
  // If crypto.randomUUID exists (Standard), use it.
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  
  // Fallback: Use getRandomValues 
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    // @ts-ignore
    const r = crypto.getRandomValues(new Uint8Array(1))[0] & 0x0f; 
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
};