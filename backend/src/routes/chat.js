// backend/src/routes/chat.js
const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const { authenticate } = require('../middleware/auth');
const chatService = require('../services/chatService');

// Multer config for file uploads (max 5MB)
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = path.join(__dirname, '..', '..', 'uploads', 'chat');
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const unique = Date.now() + '_' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, `${unique}${ext}`);
  }
});
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } });

// GET messages for a room (paginated)
router.get('/messages', authenticate, async (req, res) => {
  const { room, page = 1, limit = 50 } = req.query;
  try {
    const msgs = await chatService.getMessages(room, parseInt(page), parseInt(limit));
    res.json({ messages: msgs });
  } catch (e) {
    console.error('Error fetching chat messages', e);
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

// POST new message (text or attachment)
router.post('/messages', authenticate, upload.single('file'), async (req, res) => {
  const { room, text, type } = req.body;
  const file = req.file;
  try {
    const newMsg = await chatService.createMessage({
      room,
      senderId: req.user.id,
      text: text || null,
      type: type || (file ? 'file' : 'text'),
      filePath: file ? `/uploads/chat/${file.filename}` : null,
      mimeType: file ? file.mimetype : null,
    });
    res.status(201).json(newMsg);
  } catch (e) {
    console.error('Error creating chat message', e);
    res.status(500).json({ error: 'Failed to create message' });
  }
});

// GET online users (placeholder – socket.io emits this)
router.get('/online', authenticate, async (req, res) => {
  // This endpoint can be used as a fallback; actual online list is sent via socket.io events.
  res.json({ users: [] });
});

module.exports = router;
