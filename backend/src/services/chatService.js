const path = require('path');
const { query } = require('../config/database');
const logger = require('../config/logger');

async function ensureChatTables() {
  try {
    await query(`
      CREATE TABLE IF NOT EXISTS chat_conversations (
        id SERIAL PRIMARY KEY,
        tenant_id UUID,
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
        tenant_id UUID,
        sender_id TEXT NOT NULL,
        recipient_id TEXT,
        content TEXT,
        type VARCHAR(20) NOT NULL DEFAULT 'text',
        attachment_path TEXT,
        mime_type VARCHAR(200),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        delivered_at TIMESTAMP WITH TIME ZONE,
        seen_at TIMESTAMP WITH TIME ZONE
      )
    `);
    await query(`ALTER TABLE chat_conversations ADD COLUMN IF NOT EXISTS tenant_id UUID`);
    await query(`ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS tenant_id UUID`);
    await query(`ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS recipient_id TEXT`);
    await query(`CREATE INDEX IF NOT EXISTS idx_chat_messages_conv ON chat_messages(conversation_id)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_chat_messages_tenant ON chat_messages(tenant_id)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_chat_conversations_name ON chat_conversations(name)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_chat_conversations_tenant ON chat_conversations(tenant_id)`);
  } catch (e) {
    logger.warn('chatService ensureChatTables warning', { error: e.message });
  }
}

ensureChatTables();

function normalizeUserId(userId) {
  return String(userId || '').trim();
}

function normalizeConversationName(userA, userB) {
  const ids = [normalizeUserId(userA), normalizeUserId(userB)].sort();
  return `dm:${ids[0]}:${ids[1]}`;
}

function effectiveTenantId(user) {
  if (!user || user.role === 'super_admin') return null;
  return user.tenant_id || user.tenant_owner_id || user.id || null;
}

function participantIdsFromRoom(room) {
  if (!room || typeof room !== 'string' || !room.startsWith('dm:')) return [];
  return room.replace('dm:', '').split(':').filter(Boolean).map(normalizeUserId);
}

function toAttachmentUrl(messageId) {
  return `/api/chat/messages/${messageId}/attachment`;
}

function mapMessageRow(row) {
  return {
    id: row.id,
    sender_id: row.sender_id,
    recipientId: row.recipient_id,
    sender_name: row.sender_name,
    sender_role: row.sender_role,
    text: row.text,
    type: row.type,
    filePath: row.attachment_path ? toAttachmentUrl(row.id) : null,
    fileName: row.attachment_path ? path.basename(row.attachment_path) : null,
    mimeType: row.mimeType || row.mime_type || null,
    created_at: row.created_at,
    seen_at: row.seen_at || null,
    delivered_at: row.delivered_at || null,
    room: row.room || null,
  };
}

async function getUserById(userId) {
  const res = await query(
    `SELECT id::text AS id, full_name, username, role, tenant_id::text AS tenant_id,
            tenant_owner_id::text AS tenant_owner_id, is_active
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

  if (userA.role === 'super_admin' || userB.role === 'super_admin') {
    return true;
  }

  return effectiveTenantId(userA) && effectiveTenantId(userA) === effectiveTenantId(userB);
}

async function getAllowedChatUsers(userId) {
  const me = await getUserById(userId);
  if (!me || !me.is_active) return [];

  const meId = normalizeUserId(userId);
  if (me.role === 'super_admin') {
    const res = await query(
      `SELECT id::text AS id, full_name, username, role, tenant_id::text AS tenant_id,
              tenant_owner_id::text AS tenant_owner_id
       FROM users
       WHERE is_active = true
         AND id::text <> $1
       ORDER BY role = 'admin' DESC, full_name ASC`,
      [meId]
    );
    return res.rows;
  }

  const tenantId = effectiveTenantId(me);
  const res = await query(
    `SELECT id::text AS id, full_name, username, role, tenant_id::text AS tenant_id,
            tenant_owner_id::text AS tenant_owner_id
     FROM users
     WHERE is_active = true
       AND id::text <> $1
       AND (
         role = 'super_admin'
         OR COALESCE(tenant_id::text, tenant_owner_id::text, id::text) = $2
       )
     ORDER BY role = 'super_admin' DESC, role = 'admin' DESC, full_name ASC`,
    [meId, tenantId]
  );
  return res.rows;
}

async function resolveConversationTenantId(userAId, userBId) {
  const [userA, userB] = await Promise.all([getUserById(userAId), getUserById(userBId)]);
  if (!userA || !userB) return null;
  return effectiveTenantId(userA) || effectiveTenantId(userB) || null;
}

async function getOrCreateConversationForUsers(userA, userB) {
  const room = normalizeConversationName(userA, userB);
  const participantIds = [normalizeUserId(userA), normalizeUserId(userB)].sort();
  const tenantId = await resolveConversationTenantId(userA, userB);
  const findRes = await query('SELECT id, tenant_id FROM chat_conversations WHERE name = $1', [room]);
  if (findRes.rowCount > 0) {
    if (!findRes.rows[0].tenant_id && tenantId) {
      await query('UPDATE chat_conversations SET tenant_id = $1, updated_at = NOW() WHERE id = $2', [tenantId, findRes.rows[0].id]);
    }
    return { conversationId: findRes.rows[0].id, room, tenantId };
  }
  const insertRes = await query(
    'INSERT INTO chat_conversations (tenant_id, name, participant_user_ids) VALUES ($1, $2, $3) RETURNING id',
    [tenantId, room, participantIds]
  );
  return { conversationId: insertRes.rows[0].id, room, tenantId };
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

async function assertConversationAccess(room, viewerUserId) {
  const viewer = await getUserById(viewerUserId);
  if (!viewer || !viewer.is_active) {
    const err = new Error('Invalid viewer');
    err.statusCode = 401;
    throw err;
  }

  const participants = participantIdsFromRoom(room);
  if (!participants.includes(normalizeUserId(viewerUserId))) {
    const err = new Error('Not allowed to access this chat');
    err.statusCode = 403;
    throw err;
  }

  const convRes = await query(
    'SELECT id, tenant_id::text AS tenant_id, participant_user_ids FROM chat_conversations WHERE name = $1',
    [room]
  );
  if (convRes.rowCount === 0) return null;

  if (viewer.role !== 'super_admin') {
    const viewerTenantId = effectiveTenantId(viewer);
    const conversationTenantId = convRes.rows[0].tenant_id || viewerTenantId;
    if (!conversationTenantId || conversationTenantId !== viewerTenantId) {
      const err = new Error('Not allowed to access this chat');
      err.statusCode = 403;
      throw err;
    }
  }

  return convRes.rows[0];
}

function extractRecipientIdFromRoom(room, senderId) {
  const ids = participantIdsFromRoom(room);
  return ids.find((id) => normalizeUserId(id) !== normalizeUserId(senderId)) || null;
}

async function createMessage({ senderId, recipientId, room, text = null, type = 'text', filePath = null, mimeType = null }) {
  const resolvedRecipientId = recipientId || extractRecipientIdFromRoom(room, senderId);
  if (!resolvedRecipientId) {
    const err = new Error('recipientId is required');
    err.statusCode = 422;
    throw err;
  }

  const { conversationId, room: resolvedRoom, tenantId } = await resolveConversationForUsers(senderId, resolvedRecipientId);
  const result = await query(
    `INSERT INTO chat_messages
       (conversation_id, tenant_id, sender_id, recipient_id, content, type, attachment_path, mime_type)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id, sender_id, recipient_id, content AS text, type, attachment_path, mime_type, created_at`,
    [conversationId, tenantId, normalizeUserId(senderId), normalizeUserId(resolvedRecipientId), text, type, filePath, mimeType]
  );

  await query('UPDATE chat_conversations SET updated_at = NOW(), tenant_id = COALESCE(tenant_id, $1) WHERE id = $2', [tenantId, conversationId]);

  const row = result.rows[0];
  try {
    const userRes = await query('SELECT full_name, role FROM users WHERE id::text = $1', [normalizeUserId(senderId)]);
    if (userRes.rowCount > 0) {
      row.sender_name = userRes.rows[0].full_name;
      row.sender_role = userRes.rows[0].role;
    }
  } catch (_) {}
  row.room = resolvedRoom;
  return mapMessageRow(row);
}

async function getMessages(room, viewerUserId, page = 1, limit = 50) {
  const offset = (page - 1) * limit;
  const conversation = await assertConversationAccess(room, viewerUserId);
  if (!conversation) return [];

  const msgs = await query(
    `SELECT
       cm.id,
       cm.sender_id,
       cm.recipient_id,
       u.full_name AS sender_name,
       u.role AS sender_role,
       cm.content AS text,
       cm.type,
       cm.attachment_path,
       cm.mime_type,
       cm.created_at,
       cm.seen_at,
       cm.delivered_at
     FROM chat_messages cm
     LEFT JOIN users u ON u.id::text = cm.sender_id
     WHERE cm.conversation_id = $1
     ORDER BY cm.created_at ASC
     LIMIT $2 OFFSET $3`,
    [conversation.id, limit, offset]
  );
  return msgs.rows.map((row) => mapMessageRow({ ...row, room }));
}

async function getMessagesBetweenUsers(viewerUserId, otherUserId, page = 1, limit = 50) {
  const { room } = await resolveConversationForUsers(viewerUserId, otherUserId);
  return getMessages(room, viewerUserId, page, limit);
}

async function markMessagesSeen(room, viewerUserId) {
  const conversation = await assertConversationAccess(room, viewerUserId);
  if (!conversation) return 0;
  const res = await query(
    `UPDATE chat_messages
     SET seen_at = NOW()
     WHERE conversation_id = $1
       AND sender_id <> $2
       AND seen_at IS NULL
     RETURNING id`,
    [conversation.id, normalizeUserId(viewerUserId)]
  );
  return res.rowCount;
}

async function markMessagesDelivered(room, viewerUserId) {
  const conversation = await assertConversationAccess(room, viewerUserId);
  if (!conversation) return 0;
  const res = await query(
    `UPDATE chat_messages
     SET delivered_at = NOW()
     WHERE conversation_id = $1
       AND sender_id <> $2
       AND delivered_at IS NULL
     RETURNING id`,
    [conversation.id, normalizeUserId(viewerUserId)]
  );
  return res.rowCount;
}

async function getRecentConversationsForUser(userId) {
  const allowedUsers = await getAllowedChatUsers(userId);
  const allowedById = new Map(allowedUsers.map((u) => [normalizeUserId(u.id), u]));
  const me = normalizeUserId(userId);
  const meUser = await getUserById(me);
  const meTenantId = effectiveTenantId(meUser);
  const rows = await query(
    `SELECT
       cc.id AS conversation_id,
       cc.name,
       cc.participant_user_ids,
       cc.tenant_id::text AS tenant_id,
       lm.id AS last_message_id,
       lm.content AS last_message_text,
       lm.type AS last_message_type,
       lm.attachment_path AS last_message_attachment_path,
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
       AND ($2::text IS NULL OR cc.tenant_id::text IS NULL OR cc.tenant_id::text = $2::text OR $3 = true)
     ORDER BY lm.created_at DESC NULLS LAST, cc.updated_at DESC`,
    [me, meTenantId, meUser?.role === 'super_admin']
  );

  return rows.rows
    .map((row) => {
      const otherId = (row.participant_user_ids || []).find((id) => normalizeUserId(id) !== me);
      const contact = allowedById.get(normalizeUserId(otherId));
      if (!contact) return null;
      return {
        room: row.name,
        participant: contact,
        lastMessage: row.last_message_id
          ? {
              id: row.last_message_id,
              text: row.last_message_text,
              type: row.last_message_type,
              filePath: row.last_message_attachment_path ? toAttachmentUrl(row.last_message_id) : null,
              created_at: row.last_message_created_at,
            }
          : null,
      };
    })
    .filter(Boolean);
}

async function getAttachmentForMessage(messageId, viewerUserId) {
  const msgRes = await query(
    `SELECT cm.id, cm.attachment_path, cm.mime_type, cc.name AS room
     FROM chat_messages cm
     JOIN chat_conversations cc ON cc.id = cm.conversation_id
     WHERE cm.id = $1`,
    [messageId]
  );
  if (!msgRes.rowCount) return null;
  const row = msgRes.rows[0];
  if (!row.attachment_path) return null;
  await assertConversationAccess(row.room, viewerUserId);
  return {
    path: row.attachment_path,
    mimeType: row.mime_type || 'application/octet-stream',
    fileName: path.basename(row.attachment_path),
    room: row.room,
  };
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
  getAttachmentForMessage,
};
