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
        id SERIAL PRIMARY KEY,
        name VARCHAR(200) UNIQUE NOT NULL,
        participant_user_ids TEXT[] NOT NULL DEFAULT '{}',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);
    await query(`
      CREATE TABLE IF NOT EXISTS chat_messages (
        id SERIAL PRIMARY KEY,
        conversation_id INTEGER NOT NULL,
        sender_id TEXT NOT NULL,
        content TEXT,
        type VARCHAR(20) NOT NULL DEFAULT 'text',
        attachment_path TEXT,
        mime_type VARCHAR(200),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        delivered_at TIMESTAMP WITH TIME ZONE,
        seen_at TIMESTAMP WITH TIME ZONE
      )
    `);
    await query(`CREATE INDEX IF NOT EXISTS idx_chat_messages_conv ON chat_messages(conversation_id)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_chat_conversations_name ON chat_conversations(name)`);
  } catch (e) {
    logger.warn('chatService ensureChatTables warning', { error: e.message });
  }
}

// Run once on module load
ensureChatTables();

function normalizeUserId(userId) {
  return String(userId || '').trim();
}

function normalizeConversationName(userA, userB) {
  const ids = [normalizeUserId(userA), normalizeUserId(userB)].sort();
  return `dm:${ids[0]}:${ids[1]}`;
}

async function getUserById(userId) {
  const res = await query(
    `SELECT id::text AS id, full_name, username, role, tenant_owner_id::text AS tenant_owner_id, is_active
     FROM users
     WHERE id::text = $1`,
    [normalizeUserId(userId)]
  );
  return res.rows[0] || null;
}

async function canUsersChat(userAId, userBId) {
  const aId = normalizeUserId(userAId);
  const bId = normalizeUserId(userBId);
  if (!aId || !bId || aId === bId) return false;

  const [userA, userB] = await Promise.all([getUserById(aId), getUserById(bId)]);
  if (!userA || !userB || !userA.is_active || !userB.is_active) return false;

  if (userA.role === 'super_admin') {
    return userB.role === 'admin' || userB.role === 'super_admin' || userB.tenant_owner_id;
  }

  if (userB.role === 'super_admin') {
    return userA.role === 'admin' || userA.tenant_owner_id;
  }

  if (userA.role === 'admin') {
    if (userB.role === 'admin') return true;
    return normalizeUserId(userB.tenant_owner_id) === aId;
  }

  if (userB.role === 'admin') {
    return normalizeUserId(userA.tenant_owner_id) === bId;
  }

  // Team members can only chat with admins and super admins.
  return false;
}

async function getAllowedChatUsers(userId) {
  const me = await getUserById(userId);
  if (!me || !me.is_active) return [];

  if (me.role === 'super_admin') {
    const res = await query(
      `SELECT id::text AS id, full_name, username, role
       FROM users
       WHERE is_active = true
         AND id::text <> $1
         AND (role = 'admin' OR tenant_owner_id IS NOT NULL)
       ORDER BY role DESC, full_name ASC`,
      [normalizeUserId(userId)]
    );
    return res.rows;
  }

  if (me.role === 'admin') {
    const res = await query(
      `SELECT id::text AS id, full_name, username, role
       FROM users
       WHERE is_active = true
         AND id::text <> $1
         AND (
            role = 'admin'
            OR tenant_owner_id::text = $1
            OR role = 'super_admin'
         )
       ORDER BY role DESC, full_name ASC`,
      [normalizeUserId(userId)]
    );
    return res.rows;
  }

  if (me.tenant_owner_id) {
    const res = await query(
      `SELECT id::text AS id, full_name, username, role
       FROM users
       WHERE is_active = true
         AND id::text <> $1
         AND (id::text = $2 OR role = 'super_admin')
       ORDER BY role DESC, full_name ASC`,
      [normalizeUserId(userId), normalizeUserId(me.tenant_owner_id)]
    );
    return res.rows;
  }

  return [];
}

async function getOrCreateConversationForUsers(userA, userB) {
  const room = normalizeConversationName(userA, userB);
  const participantIds = [normalizeUserId(userA), normalizeUserId(userB)].sort();
  const findRes = await query('SELECT id FROM chat_conversations WHERE name = $1', [room]);
  if (findRes.rowCount > 0) return { conversationId: findRes.rows[0].id, room };
  const insertRes = await query(
    'INSERT INTO chat_conversations (name, participant_user_ids) VALUES ($1, $2) RETURNING id',
    [room, participantIds]
  );
  return { conversationId: insertRes.rows[0].id, room };
}

async function resolveConversationForUsers(viewerUserId, otherUserId) {
  const allowed = await canUsersChat(viewerUserId, otherUserId);
  if (!allowed) {
    const err = new Error('Not allowed to access this chat');
    err.statusCode = 403;
    throw err;
  }
  return getOrCreateConversationForUsers(viewerUserId, otherUserId);
}

/** Create a new chat message */
function extractRecipientIdFromRoom(room, senderId) {
  if (!room || typeof room !== 'string' || !room.startsWith('dm:')) return null;
  const ids = room.replace('dm:', '').split(':').filter(Boolean);
  return ids.find((id) => normalizeUserId(id) !== normalizeUserId(senderId)) || null;
}

async function createMessage({ senderId, recipientId, room, text = null, type = 'text', filePath = null, mimeType = null }) {
  const resolvedRecipientId = recipientId || extractRecipientIdFromRoom(room, senderId);
  if (!resolvedRecipientId) {
    const err = new Error('recipientId is required');
    err.statusCode = 422;
    throw err;
  }
  const { conversationId, room: resolvedRoom } = await resolveConversationForUsers(senderId, resolvedRecipientId);
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
    [conversationId, normalizeUserId(senderId), text, type, filePath, mimeType]
  );
  const row = result.rows[0];
  // Enrich with sender info
  try {
    const userRes = await query('SELECT full_name, role FROM users WHERE id::text = $1', [normalizeUserId(senderId)]);
    if (userRes.rowCount > 0) {
      row.sender_name = userRes.rows[0].full_name;
      row.sender_role = userRes.rows[0].role;
    }
  } catch (_) {}
  row.room = resolvedRoom;
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
     LEFT JOIN users u ON u.id::text = cm.sender_id
     WHERE cm.conversation_id = $1
     ORDER BY cm.created_at ASC
     LIMIT $2 OFFSET $3`,
    [convId, limit, offset]
  );
  return msgs.rows;
}

async function getMessagesBetweenUsers(viewerUserId, otherUserId, page = 1, limit = 50) {
  const { room } = await resolveConversationForUsers(viewerUserId, otherUserId);
  return getMessages(room, page, limit);
}



// Mark messages in a room as seen (set seen_at) for messages not sent by the acting user
async function markMessagesSeen(room, viewerUserId) {
  const convRes = await query('SELECT id FROM chat_conversations WHERE name = $1', [room]);
  if (convRes.rowCount === 0) return 0;
  const convId = convRes.rows[0].id;
  const res = await query(
    `UPDATE chat_messages SET seen_at = NOW() WHERE conversation_id = $1 AND sender_id <> $2 AND seen_at IS NULL RETURNING id`,
    [convId, String(viewerUserId)]
  );
  return res.rowCount;
}

async function markMessagesDelivered(room, viewerUserId) {
  const convRes = await query('SELECT id FROM chat_conversations WHERE name = $1', [room]);
  if (convRes.rowCount === 0) return 0;
  const convId = convRes.rows[0].id;
  const res = await query(
    `UPDATE chat_messages
     SET delivered_at = NOW()
     WHERE conversation_id = $1
       AND sender_id <> $2
       AND delivered_at IS NULL
     RETURNING id`,
    [convId, normalizeUserId(viewerUserId)]
  );
  return res.rowCount;
}

async function getRecentConversationsForUser(userId) {
  const allowedUsers = await getAllowedChatUsers(userId);
  const allowedById = new Map(allowedUsers.map((u) => [normalizeUserId(u.id), u]));
  const me = normalizeUserId(userId);
  const rows = await query(
    `SELECT
       cc.id AS conversation_id,
       cc.name,
       cc.participant_user_ids,
       lm.id AS last_message_id,
       lm.content AS last_message_text,
       lm.type AS last_message_type,
       lm.attachment_path AS last_message_file_path,
       lm.created_at AS last_message_created_at
     FROM chat_conversations cc
     LEFT JOIN LATERAL (
       SELECT id, content, type, attachment_path, created_at
       FROM chat_messages
       WHERE conversation_id = cc.id
       ORDER BY created_at DESC
       LIMIT 1
     ) lm ON true
     WHERE $1 = ANY(cc.participant_user_ids)
     ORDER BY lm.created_at DESC NULLS LAST, cc.updated_at DESC`,
    [me]
  );

  return rows.rows
    .map((row) => {
      const otherId = (row.participant_user_ids || []).find((id) => normalizeUserId(id) !== me);
      const contact = allowedById.get(normalizeUserId(otherId));
      if (!contact) return null;
      return {
        room: row.name,
        participant: contact,
        lastMessage: {
          id: row.last_message_id,
          text: row.last_message_text,
          type: row.last_message_type,
          filePath: row.last_message_file_path,
          created_at: row.last_message_created_at,
        },
      };
    })
    .filter(Boolean);
}

module.exports = {
  canUsersChat,
  getAllowedChatUsers,
  getRecentConversationsForUser,
  resolveConversationForUsers,
  createMessage,
  getMessages,
  getMessagesBetweenUsers,
  markMessagesSeen,
  markMessagesDelivered,
  normalizeConversationName,
};
