// backend/src/services/chatService.js
const { query } = require('../config/database');
const logger = require('../config/logger');

/**
 * Ensure chat tables exist (no FK constraints to avoid type-mismatch issues).
 */
async function ensureChatTables() {
  try {
    await query(`
      CREATE TABLE IF NOT EXISTS chat_conversations (
        id         SERIAL PRIMARY KEY,
        name       VARCHAR(100) UNIQUE NOT NULL,
        participant_user_ids INTEGER[] NOT NULL DEFAULT '{}',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);
    await query(`
      CREATE TABLE IF NOT EXISTS chat_messages (
        id              SERIAL PRIMARY KEY,
        conversation_id INTEGER NOT NULL,
        sender_id       INTEGER NOT NULL,
        content         TEXT,
        type            VARCHAR(20) NOT NULL DEFAULT 'text',
        attachment_path TEXT,
        mime_type       VARCHAR(200),
        created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        delivered_at    TIMESTAMP WITH TIME ZONE,
        seen_at         TIMESTAMP WITH TIME ZONE
      )
    `);
    await query(`CREATE INDEX IF NOT EXISTS idx_chat_messages_conv ON chat_messages(conversation_id)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_chat_conversations_name ON chat_conversations(name)`);
    // Seed default rooms
    await query(`
      INSERT INTO chat_conversations (name) VALUES
        ('general'),('engineers'),('billing'),('cases')
      ON CONFLICT (name) DO NOTHING
    `);
  } catch (e) {
    logger.warn('chatService ensureChatTables warning', { error: e.message });
  }
}

// Run once on module load
ensureChatTables();

/**
 * Get or create a conversation row keyed by room name string.
 */
async function getOrCreateConversation(room) {
  const findRes = await query('SELECT id FROM chat_conversations WHERE name = $1', [room]);
  if (findRes.rowCount > 0) return findRes.rows[0].id;
  const insertRes = await query(
    'INSERT INTO chat_conversations (name) VALUES ($1) RETURNING id',
    [room]
  );
  return insertRes.rows[0].id;
}

/** Create a new chat message */
async function createMessage({ room, senderId, text = null, type = 'text', filePath = null, mimeType = null }) {
  const conversationId = await getOrCreateConversation(room);
  const result = await query(
    `INSERT INTO chat_messages
       (conversation_id, sender_id, content, type, attachment_path, mime_type)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING
       id,
       sender_id,
       content         AS text,
       type,
       attachment_path AS "filePath",
       mime_type       AS "mimeType",
       created_at`,
    [conversationId, senderId, text, type, filePath, mimeType]
  );
  const row = result.rows[0];
  // Enrich with sender info
  try {
    const userRes = await query('SELECT full_name, role FROM users WHERE id = $1', [senderId]);
    if (userRes.rowCount > 0) {
      row.sender_name = userRes.rows[0].full_name;
      row.sender_role = userRes.rows[0].role;
    }
  } catch (_) {}
  row.room = room;
  return row;
}

/** Retrieve paginated messages for a room */
async function getMessages(room, page = 1, limit = 50) {
  const offset = (page - 1) * limit;
  const convRes = await query('SELECT id FROM chat_conversations WHERE name = $1', [room]);
  if (convRes.rowCount === 0) return [];
  const convId = convRes.rows[0].id;
  const msgs = await query(
    `SELECT
       cm.id,
       cm.sender_id,
       u.full_name        AS sender_name,
       u.role             AS sender_role,
       cm.content         AS text,
       cm.type,
       cm.attachment_path AS "filePath",
       cm.mime_type       AS "mimeType",
       cm.created_at,
       cm.seen_at,
       cm.delivered_at
     FROM chat_messages cm
     LEFT JOIN users u ON u.id = cm.sender_id
     WHERE cm.conversation_id = $1
     ORDER BY cm.created_at ASC
     LIMIT $2 OFFSET $3`,
    [convId, limit, offset]
  );
  return msgs.rows;
}

module.exports = { createMessage, getMessages };
