require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const path = require('path');

const logger = require('./config/logger');
const { testConnection } = require('./config/database');
const { migrate } = require('./db/migrate');

// Routes
const authRoutes       = require('./routes/auth');
const clientRoutes     = require('./routes/clients');
const caseRoutes       = require('./routes/cases');
const caseUploadsRoutes = require('./routes/caseUploads');
const storageModelRoutes = require('./routes/storageModels');
const donorRoutes      = require('./routes/donors');
const inventoryRoutes  = require('./routes/inventory');
const fieldConfigRoutes = require('./routes/fieldConfig');
const transferredItemsRoutes = require('./routes/transferredItems');
const inventoryConfigRoutes = require('./routes/inventoryConfig');
const fileRoutes       = require('./routes/files');
const paymentRoutes    = require('./routes/payments');
const analyticsRoutes  = require('./routes/analytics');
const userRoutes       = require('./routes/users');
const accountingRoutes = require('./routes/accounting');
const superAdminRoutes = require('./routes/super-admin');
const automationCenterRoutes = require('./routes/automation-center');
const marketingRoutes  = require('./routes/marketing');
const suggestionsRoutes = require('./routes/suggestions');
const solutionsRoutes  = require('./routes/solutions');
const mediaRecycleRoutes = require('./routes/mediaRecycle');
const recycleBinRoutes = require('./routes/recycleBin');
const backupRoutes = require('./routes/backup');
const settingsRoutes = require('./routes/settings');
const chatRoutes = require('./routes/chat');
const clientPortalRoutes = require('./routes/clientPortal');
const activityLogsRoutes = require('./routes/activityLogs');
const encryptionRoutes = require('./routes/encryption');
const securityRoutes = require('./routes/security');
const twoFactorRoutes = require('./routes/twoFactor');
const paymentLinkRoutes = require('./routes/payments-link');
const exportRoutes = require('./routes/export');

const app = express();
const PORT = process.env.PORT || 5000;

// ─── Security Middleware ────────────────────────────────────────
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      imgSrc: ["'self'", 'data:', 'blob:', `${process.env.FRONTEND_URL || 'http://localhost:5174'}`],
      mediaSrc: ["'self'", 'data:', 'blob:'],
    }
  },
  hsts: {
    maxAge: 365 * 24 * 60 * 60, // 365 days in seconds
    includeSubDomains: true,
    preload: true
  },
  frameguard: {
    action: 'deny' // X-Frame-Options: DENY
  },
  noSniff: true, // X-Content-Type-Options: nosniff
  referrerPolicy: {
    policy: 'strict-origin-when-cross-origin'
  },
  permissionsPolicy: {
    accelerometer: [],
    camera: [],
    geolocation: [],
    gyroscope: [],
    magnetometer: [],
    microphone: [],
    payment: [],
    usb: [],
    xrSpatialTracking: []
  }
}));

app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5174',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID']
}));

// ─── Hardened Rate Limiting ─────────────────────────────────────
let store = undefined;

// Try to use Redis-based store for distributed rate limiting (optional)
try {
  const RedisStore = require('rate-limit-redis');
  const redis = require('redis');
  const redisClient = redis.createClient({
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379,
    legacyMode: true,
  });
  redisClient.connect().catch(err => {
    logger.warn('Redis connection failed, falling back to in-memory rate limit store', { error: err.message });
  });
  store = new RedisStore({
    client: redisClient,
    prefix: 'rl:',
  });
} catch (err) {
  logger.debug('Redis store not available, using in-memory store', { error: err.message });
}

// Global rate limiter: 500 requests per 15 minutes
const globalLimiter = rateLimit({
  store,
  windowMs: 15 * 60 * 1000,
  max: 500,
  message: { error: 'Too many requests, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.ip || req.connection.remoteAddress,
});

// Auth rate limiter: 10 attempts per 15 minutes (strict - was 200 in dev)
const authLimiter = rateLimit({
  store,
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Too many login attempts. Please wait 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    // Rate limit by username/email to prevent user enumeration attacks
    const username = req.body?.username || req.body?.email || req.ip;
    return `auth:${username}`;
  },
  skip: (req) => req.method !== 'POST', // Only count POST attempts
});

// Password reset rate limiter: 5 attempts per 24 hours per email
const passwordResetLimiter = rateLimit({
  store,
  windowMs: 24 * 60 * 60 * 1000, // 24 hours
  max: 5,
  message: { error: 'Too many password reset requests. Please try again tomorrow.' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const email = req.body?.email || req.ip;
    return `reset:${email.toLowerCase()}`;
  },
  skip: (req) => req.method !== 'POST',
});

// Login rate limiter by username: 5 attempts per 30 minutes
const loginLimiter = rateLimit({
  store,
  windowMs: 30 * 60 * 1000, // 30 minutes
  max: 5,
  message: { error: 'Too many login attempts for this username. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const username = req.body?.username || req.ip;
    return `login:${username.toLowerCase()}`;
  },
  skip: (req) => req.method !== 'POST',
});

app.use(globalLimiter);

// ─── Raw body for Razorpay webhook (must be BEFORE express.json) ─
app.post('/api/super-admin/razorpay/webhook',
  express.raw({ type: 'application/json' }),
  (req, res) => superAdminRoutes.webhookHandler(req, res)
);

// ─── General Middleware ─────────────────────────────────────────
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// HTTP request logging
app.use(morgan('combined', {
  stream: { write: (msg) => logger.http(msg.trim()) }
}));

// Request ID middleware
app.use((req, res, next) => {
  req.requestId = require('uuid').v4();
  res.setHeader('X-Request-ID', req.requestId);
  next();
});

// ─── Routes ────────────────────────────────────────────────────
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/clients', clientRoutes);
app.use('/api/cases', caseRoutes);
app.use('/api/cases', caseUploadsRoutes);
app.use('/api/storage-models', storageModelRoutes);
app.use('/api/donors', donorRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/field-config', fieldConfigRoutes);
app.use('/api/transferred-items', transferredItemsRoutes);
app.use('/api/inventory-config', inventoryConfigRoutes);
app.use('/api/files', fileRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/accounting', accountingRoutes);
app.use('/api/super-admin', superAdminRoutes);
app.use('/api/super-admin/automation-center', automationCenterRoutes);
app.use('/api/marketing',   marketingRoutes);
app.use('/api/suggestions', suggestionsRoutes);
app.use('/api/solutions',   solutionsRoutes);
app.use('/api/media-recycle-bin', mediaRecycleRoutes);
app.use('/api/recycle-bin', recycleBinRoutes);
app.use('/api/2fa', twoFactorRoutes);
app.use('/api/encryption', encryptionRoutes);
app.use('/api/security', securityRoutes);
app.use('/api/backup',      backupRoutes);
app.use('/api/settings',    settingsRoutes);
app.use('/api/chat',        chatRoutes);
app.use('/api/client-portal', clientPortalRoutes);
app.use('/api/activity-logs', activityLogsRoutes);
app.use('/api/payment-link', paymentLinkRoutes);
app.use('/api/export', exportRoutes);

// Serve uploaded branding files
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '1.0.0',
    environment: process.env.NODE_ENV || 'development'
  });
});

// ─── Error Handling ─────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found', path: req.originalUrl });
});

app.use((err, req, res, next) => {
  logger.error('Unhandled error', {
    error: err.message,
    stack: err.stack,
    requestId: req.requestId,
    path: req.path,
    method: req.method
  });

  if (err.name === 'MulterError') {
    return res.status(400).json({ error: 'File upload error: ' + err.message });
  }

  if (err.name === 'ValidationError') {
    return res.status(422).json({ error: err.message });
  }

  res.status(err.status || 500).json({
    error: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message,
    requestId: req.requestId
  });
});

// ─── Auto-migration for new inventory columns (MOVED TO MIGRATION FILE) ──────────────────────────────
// This function was causing 5-10 minute startup delays by running on every server start.
// It has been moved to the migration system and will only run once.
// See: src/db/migrations/inventory_extended_schema.sql

// ─── Boot ────────────────────────────────────────────────────────
async function start() {
  try {
    await testConnection();
    logger.info('✅ Database connection established');
    
    // Run migrations only if enabled (default: true)
    const runMigrations = process.env.RUN_MIGRATIONS !== 'false';
    if (runMigrations) {
      await migrate();
      logger.info('✅ Database schema migration completed');
    } else {
      logger.info('⏭️  Skipping migrations (RUN_MIGRATIONS=false)');
    }

    // Start campaign scheduler service
    const { startCampaignScheduler } = require('./services/campaignScheduler');
    startCampaignScheduler();

    const http = require('http');
    const server = http.createServer(app);
    const { Server } = require('socket.io');
    
    const io = new Server(server, {
      cors: {
        origin: process.env.NODE_ENV === 'production' ? (process.env.FRONTEND_URL || 'http://localhost:5174') : '*',
        methods: ['GET', 'POST'],
        credentials: true,
      },
      pingInterval: 25000,
      pingTimeout: 60000,
      transports: ['websocket', 'polling'],
    });

    // Expose io on app for route handlers to broadcast
    app.set('io', io);

    const onlineUsers = new Map(); // Maps socketId -> userId
    const userSockets = new Map(); // Maps userId -> Set of socketIds
    const chatService = require('./services/chatService');
    const { verifySocketToken } = require('./middleware/auth');

    const addUserSocket = (userId, socketId) => {
      if (!userSockets.has(userId)) {
        userSockets.set(userId, new Set());
      }
      userSockets.get(userId).add(socketId);
    };

    const removeUserSocket = (userId, socketId) => {
      if (userSockets.has(userId)) {
        userSockets.get(userId).delete(socketId);
        if (userSockets.get(userId).size === 0) {
          userSockets.delete(userId);
        }
      }
    };

    const emitAllowedOnlineUsers = async (targetSocket) => {
      try {
        const allowedUsers = await chatService.getAllowedChatUsers(targetSocket.userId);
        const allowedIds = new Set(allowedUsers.map((u) => String(u.id)));
        const onlineAllowed = Array.from(userSockets.keys()).filter((id) => allowedIds.has(String(id)));
        targetSocket.emit('onlineUsers', onlineAllowed);
      } catch (e) {
        logger.warn('Failed to emit allowed online users', { error: e.message });
      }
    };

    const refreshOnlineUsersForAll = async () => {
      try {
        const sockets = await io.fetchSockets();
        await Promise.all(sockets.map((s) => emitAllowedOnlineUsers(s)));
      } catch (e) {
        logger.warn('Failed to refresh online users', { error: e.message });
      }
    };

    // ──── Socket.IO Authentication & Connection Middleware ────
    io.use(async (socket, next) => {
      const token = socket.handshake.auth?.token || socket.handshake.query?.token;
      if (!token) {
        return next(new Error('Authentication error: No token provided'));
      }
      try {
        const user = await verifySocketToken(token);
        socket.userId = String(user.id);
        socket.user = user;
        socket.tenantId = user.tenantId || null;
        return next();
      } catch (err) {
        logger.warn('Socket authentication failed', { error: err.message });
        return next(new Error('Invalid or expired token'));
      }
    });

    // ──── Socket.IO Connection Handler ────
    io.on('connection', (socket) => {
      const userId = socket.userId;
      logger.info(`⚡ Socket connected: ${socket.id} (user: ${userId})`);
      
      onlineUsers.set(socket.id, userId);
      addUserSocket(userId, socket.id);

      // Join personal user room for direct message delivery
      socket.join(`user:${userId}`);
      
      // Join tenant room if applicable (for multi-tenant filtering)
      if (socket.tenantId) {
        socket.join(`tenant:${socket.tenantId}`);
      }
      
      // Notify all users about online status change
      refreshOnlineUsersForAll();

      // ──── Join DM Room Handler ────
      socket.on('joinRoom', async (room) => {
        try {
          if (!room || typeof room !== 'string' || !room.startsWith('dm:')) {
            logger.warn(`Invalid room format: ${room}`);
            return;
          }
          
          const participantIds = chatService.participantIdsFromRoom(room);
          if (!participantIds.includes(String(userId))) {
            logger.warn(`User ${userId} not in room participants: ${participantIds}`);
            return;
          }
          
          const otherUserId = participantIds.find((id) => id !== String(userId));
          if (!otherUserId) {
            logger.warn(`No other participant found in room: ${room}`);
            return;
          }
          
          // Verify both users can chat
          const canChat = await chatService.canUsersChat(userId, otherUserId);
          if (!canChat) {
            logger.warn(`Chat denied between ${userId} and ${otherUserId}`);
            socket.emit('error', { message: 'Not allowed to chat with this user' });
            return;
          }
          
          socket.join(room);
          logger.info(`✓ User ${userId} joined room: ${room}`);
        } catch (e) {
          logger.error('Error in joinRoom handler', { error: e.message, room });
          socket.emit('error', { message: 'Failed to join room' });
        }
      });

      // ──── Send Message Handler ────
      socket.on('sendMessage', async (msg) => {
        try {
          if (!msg || !msg.room || !msg.recipientId) {
            logger.warn('Invalid sendMessage payload', { msg });
            return;
          }

          const saved = await chatService.createMessage({
            senderId: userId,
            recipientId: msg.recipientId,
            room: msg.room,
            text: msg.text || null,
            type: msg.type || 'text',
            filePath: msg.filePath || null,
            mimeType: msg.mimeType || null,
          });

          if (saved?.room) {
            // Emit to all users in the conversation room
            io.to(saved.room).emit('newMessage', saved);
            logger.info(`Message sent in room ${saved.room} by ${userId}`);
          }

          // Ensure both sender and recipient receive the message instantly,
          // even if they are not currently in the room.
          io.to(`user:${String(saved.sender_id)}`).emit('newMessage', saved);
          if (saved.recipient_id && String(saved.recipient_id) !== String(saved.sender_id)) {
            io.to(`user:${String(saved.recipient_id)}`).emit('newMessage', saved);
          }
        } catch (e) {
          logger.error('Error saving message', { error: e.message, msg });
          socket.emit('error', { message: 'Failed to send message' });
        }
      });

      // ──── Mark Messages as Seen Handler ────
      socket.on('markSeen', async ({ room }) => {
        try {
          if (!room || typeof room !== 'string' || !room.startsWith('dm:')) {
            logger.warn(`Invalid room in markSeen: ${room}`);
            return;
          }
          
          const participantIds = chatService.participantIdsFromRoom(room);
          if (!participantIds.includes(String(userId))) {
            logger.warn(`User ${userId} not authorized for room: ${room}`);
            return;
          }
          
          const otherUserId = participantIds.find((id) => id !== String(userId));
          const canChat = await chatService.canUsersChat(userId, otherUserId);
          
          if (!canChat) {
            logger.warn(`Unauthorized markSeen attempt: ${userId} -> ${otherUserId}`);
            return;
          }
          
          const count = await chatService.markMessagesSeen(room, userId);
          io.to(room).emit('messagesSeen', { room, userId, markedCount: count });
          logger.info(`Marked ${count} messages as seen in room ${room} by user ${userId}`);
        } catch (e) {
          logger.error('Error in markSeen handler', { error: e.message, room, userId });
        }
      });

      // ──── Typing Indicator Handler ────
      socket.on('typing', (data) => {
        try {
          if (data && data.room) {
            socket.to(data.room).emit('typing', { userId, userName: data.userName || 'User' });
          }
        } catch (e) {
          logger.warn('Error in typing handler', { error: e.message });
        }
      });

      // ──── Disconnect Handler ────
      socket.on('disconnect', () => {
        logger.info(`⚡ Socket disconnected: ${socket.id} (user: ${userId})`);
        onlineUsers.delete(socket.id);
        removeUserSocket(userId, socket.id);
        refreshOnlineUsersForAll();
      });

      // ──── Error Handler ────
      socket.on('error', (err) => {
        logger.error('Socket error', { error: err, userId });
      });
    });

    server.listen(PORT, () => {
      logger.info(`🚀 Data Recovery CRM API running on port ${PORT}`);
      logger.info(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
      logger.info(`💬 Socket.IO real-time chat enabled`);
    });
    
    // Graceful shutdown
    process.on('SIGTERM', () => {
      logger.info('SIGTERM received, closing server gracefully');
      const { stopCampaignScheduler } = require('./services/campaignScheduler');
      stopCampaignScheduler();
      server.close(() => {
        logger.info('Server closed');
        process.exit(0);
      });
    });
  } catch (err) {
    logger.error('Failed to start server', { error: err.message });
    process.exit(1);
  }
}

start();

module.exports = app;

