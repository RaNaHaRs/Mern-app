// backend/src/routes/chat.js
const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { authenticate, verifySocketToken } = require('../middleware/auth');
const chatService = require('../services/chatService');

// Multer config for file uploads (max 5MB)
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = path.join(__dirname, '..', '..', 'uploads', 'chat');
    fs.mkdirSync(uploadPath, { recursive: true });
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const unique = Date.now() + '_' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, `${unique}${ext}`);
  }
});
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } });

router.get('/contacts', authenticate, async (req, res) => {
  try {
    const users = await chatService.getAllowedChatUsers(req.user.id);
    const conversations = await chatService.getRecentConversationsForUser(req.user.id);
    res.json({ users, conversations });
  } catch (e) {
    console.error('Error fetching chat contacts', e);
    res.status(500).json({ error: 'Failed to fetch chat contacts' });
  }
});

// GET messages for a room (legacy paginated)
router.get('/messages', authenticate, async (req, res) => {
  const { room, page = 1, limit = 50 } = req.query;
  try {
    const msgs = await chatService.getMessages(room, req.user.id, parseInt(page, 10), parseInt(limit, 10));
    res.json({ messages: msgs });
  } catch (e) {
    if (e.statusCode) return res.status(e.statusCode).json({ error: e.message });
    console.error('Error fetching chat messages', e);
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

// GET messages with a specific user
router.get('/conversations/:otherUserId/messages', authenticate, async (req, res) => {
  const { page = 1, limit = 50 } = req.query;
  try {
    const messages = await chatService.getMessagesBetweenUsers(
      req.user.id,
      req.params.otherUserId,
      parseInt(page, 10),
      parseInt(limit, 10)
    );
    res.json({ messages });
  } catch (e) {
    if (e.statusCode) return res.status(e.statusCode).json({ error: e.message });
    console.error('Error fetching conversation messages', e);
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

// POST new message (text or attachment)
router.post('/messages', authenticate, upload.single('file'), async (req, res) => {
  const { recipientId, room, text, type } = req.body;
  const file = req.file;
  try {
    const newMsg = await chatService.createMessage({
      senderId: req.user.id,
      recipientId,
      room,
      text: text || null,
      type: type || (file ? 'file' : 'text'),
      filePath: file ? `/uploads/chat/${file.filename}` : null,
      mimeType: file ? file.mimetype : null,
    });
    // Broadcast created message via Socket.IO if available
    try {
      const io = req.app.get('io');
      if (io) io.to(newMsg.room).emit('newMessage', newMsg);
    } catch (e) {
      console.warn('Unable to broadcast chat message via io', e.message);
    }
    res.status(201).json(newMsg);
  } catch (e) {
    if (file?.path) {
      try { fs.unlinkSync(file.path); } catch {}
    }
    console.error('Error creating chat message', e);
    res.status(e.statusCode || 500).json({ error: e.message || 'Failed to create message' });
  }
});

router.get('/messages/:id/attachment', async (req, res) => {
  try {
    const bearer = req.headers.authorization?.startsWith('Bearer ')
      ? req.headers.authorization.substring(7)
      : null;
    const token = req.query.token || bearer;
    if (!token) return res.status(401).json({ error: 'Authentication required' });
    const user = await verifySocketToken(token);
    const attachment = await chatService.getAttachmentForMessage(req.params.id, user.id);
    if (!attachment) return res.status(404).json({ error: 'Attachment not found' });
    if (!fs.existsSync(attachment.path)) {
      return res.status(404).json({ error: 'Attachment not available on disk' });
    }
    res.setHeader('Content-Type', attachment.mimeType);
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(attachment.fileName)}"`);
    fs.createReadStream(attachment.path).pipe(res);
  } catch (e) {
    if (e.statusCode) return res.status(e.statusCode).json({ error: e.message });
    console.error('Error fetching chat attachment', e);
    res.status(500).json({ error: 'Failed to fetch attachment' });
  }
});

router.post('/conversations/:otherUserId/seen', authenticate, async (req, res) => {
  try {
    const { room } = await chatService.resolveConversationForUsers(req.user.id, req.params.otherUserId);
    await chatService.markMessagesSeen(room, req.user.id);
    res.json({ ok: true });
  } catch (e) {
    if (e.statusCode) return res.status(e.statusCode).json({ error: e.message });
    console.error('Error marking messages seen', e);
    res.status(500).json({ error: 'Failed to update seen status' });
  }
});

module.exports = router;
