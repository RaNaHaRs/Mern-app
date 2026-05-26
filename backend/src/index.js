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
const marketingRoutes  = require('./routes/marketing');
const suggestionsRoutes = require('./routes/suggestions');
// New Chat routes
const chatRoutes = require('./routes/chat');

const app = express();
const PORT = process.env.PORT || 5000;
app.use('/uploads/chat', express.static(path.join(__dirname, '..', 'uploads', 'chat')));

// ─── Security Middleware ────────────────────────────────────────
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      imgSrc: ["'self'", 'data:', 'blob:'],
    }
  }
}));

app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID']
}));

// Rate limiting
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 minutes
  max: 500,
  message: { error: 'Too many requests, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200, // raised for dev; restore to 10 before production
  message: { error: 'Too many login attempts. Please wait 15 minutes.' },
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
app.use('/api/marketing',   marketingRoutes);
app.use('/api/suggestions', suggestionsRoutes);
app.use('/api/chat',        chatRoutes);

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

// ─── Auto-migration for new inventory columns ──────────────────────────────
async function runInventoryMigration() {
  const { query } = require('./config/database');
  const migrations = [
    "ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS stock_number VARCHAR(100)",
    "ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS company VARCHAR(100)",
    "ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS brand VARCHAR(100)",
    "ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS model VARCHAR(200)",
    "ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS firmware VARCHAR(100)",
    "ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS site_code VARCHAR(100)",
    "ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS date_code VARCHAR(50)",
    "ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS head_map VARCHAR(200)",
    "ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS family VARCHAR(100)",
    "ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS capacity VARCHAR(50)",
    "ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS interface VARCHAR(50)",
    "ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS form_factor VARCHAR(50)",
    "ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'available'",
    "ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS ui_category VARCHAR(50)",
    "ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS dynamic_fields JSONB DEFAULT '{}'",
    "ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS custom_field_values JSONB DEFAULT '{}'",
    "ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS source_case_id UUID",
    "ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS tenant_id INTEGER",
    "UPDATE inventory_items SET tenant_id=1 WHERE tenant_id IS NULL",
    "UPDATE inventory_items SET status='available' WHERE status IS NULL",
    "CREATE INDEX IF NOT EXISTS idx_inventory_tenant ON inventory_items(tenant_id)",
    "CREATE INDEX IF NOT EXISTS idx_inventory_stock_number ON inventory_items(stock_number)",
    "CREATE INDEX IF NOT EXISTS idx_inventory_pcb ON inventory_items(pcb_number)",
    "CREATE INDEX IF NOT EXISTS idx_inventory_serial ON inventory_items(serial_number)",
    "CREATE INDEX IF NOT EXISTS idx_inventory_model ON inventory_items(model)",
    "ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL",
    "CREATE INDEX IF NOT EXISTS idx_inventory_deleted_at ON inventory_items(deleted_at)",
  ];
  for (const sql of migrations) {
    try { await query(sql); } catch (e) { /* column may already exist */ }
  }
  logger.info('✅ Inventory schema migration complete');
}

// ─── Boot ────────────────────────────────────────────────────────
async function start() {
  try {
    await testConnection();
    logger.info('✅ Database connection established');
    await migrate();
    logger.info('✅ Database schema migration completed');
    await runInventoryMigration();

    const http = require('http');
    const server = http.createServer(app);
    const { Server } = require('socket.io');
    const io = new Server(server, {
      cors: {
        origin: process.env.FRONTEND_URL || 'http://localhost:5175',
        methods: ['GET', 'POST'],
        credentials: true,
      },
    });

    const jwt = require('jsonwebtoken');
    const JWT_SECRET = process.env.JWT_SECRET || 'CHANGE_THIS_SECRET_IN_PRODUCTION';
    const onlineUsers = new Map();

    io.use((socket, next) => {
      const token = socket.handshake.auth?.token || socket.handshake.query?.token;
      if (!token) return next(new Error('Authentication error'));
      try {
        const payload = jwt.verify(token, JWT_SECRET);
        socket.userId = payload.userId;
        return next();
      } catch (err) {
        return next(new Error('Invalid token'));
      }
    });

    io.on('connection', (socket) => {
      logger.info(`⚡ Socket connected: ${socket.id} (user ${socket.userId})`);
      onlineUsers.set(socket.id, socket.userId);
      io.emit('onlineUsers', Array.from(new Set(onlineUsers.values())));

      socket.on('joinRoom', (room) => {
        socket.join(room);
        logger.info(`User ${socket.userId} joined room ${room}`);
      });

      socket.on('sendMessage', async (msg) => {
        const chatService = require('./services/chatService');
        try {
          const saved = await chatService.createMessage({
            room: msg.room,
            senderId: socket.userId,
            text: msg.text,
            filePath: msg.filePath,
            mimeType: msg.mimeType,
          });
          io.to(msg.room).emit('newMessage', saved);
        } catch (e) {
          logger.error('Error saving message', { error: e.message });
        }
      });

      socket.on('typing', (data) => {
        socket.to(data.room).emit('typing', data.userName);
      });

      socket.on('disconnect', () => {
        onlineUsers.delete(socket.id);
        io.emit('onlineUsers', Array.from(new Set(onlineUsers.values())));
        logger.info(`⚡ Socket disconnected: ${socket.id}`);
      });
    });

    const path = require('path');
    // Moved static chat uploads route after app initialization

    server.listen(PORT, () => {
      logger.info(`🚀 Data Recovery CRM API running on port ${PORT}`);
      logger.info(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
    });
  } catch (err) {
    logger.error('Failed to start server', { error: err.message });
    process.exit(1);
  }
}

start();

module.exports = app;

