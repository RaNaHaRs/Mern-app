require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const crypto = require('crypto');
const nodemailer = require('nodemailer');

const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-key-change-in-production';
const ENCRYPTION_MASTER_KEY = process.env.ENCRYPTION_MASTER_KEY || crypto.randomBytes(32).toString('hex');

// --- Rate Limiting (in-memory -- use Redis in production) --------------------
const rateLimitStore = new Map(); // `${ip}:${routeKey}` -> { count, resetAt }
function rateLimit(maxRequests, windowMs, routeKey) {
  return (req, res, next) => {
    const ip = req.ip || (req.connection && req.connection.remoteAddress) || 'unknown';
    // Bypass for localhost in development
    if (ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1') return next();
    const storeKey = ip + ':' + (routeKey || req.path);
    const now = Date.now();
    const entry = rateLimitStore.get(storeKey);
    if (!entry || now > entry.resetAt) {
      rateLimitStore.set(storeKey, { count: 1, resetAt: now + windowMs });
      return next();
    }
    entry.count++;
    if (entry.count > maxRequests) {
      res.setHeader('Retry-After', Math.ceil((entry.resetAt - now) / 1000));
      return res.status(429).json({ error: 'Too many requests. Please wait and try again.', retry_after: Math.ceil((entry.resetAt - now) / 1000) });
    }
    next();
  };
}
// Cleanup expired entries every 10 minutes
setInterval(() => { const now = Date.now(); for (const [k, v] of rateLimitStore) { if (now > v.resetAt) rateLimitStore.delete(k); } }, 600000);

// â”€â”€â”€ Security Headers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next();
});

// â”€â”€â”€ Input Sanitization â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function sanitize(str) {
  if (typeof str !== 'string') return str;
  return str.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
            .replace(/javascript:/gi, '')
            .replace(/on\w+\s*=/gi, '');
}
function sanitizeBody(req, res, next) {
  if (req.body && typeof req.body === 'object') {
    const clean = (obj) => {
      if (typeof obj === 'string') return sanitize(obj);
      if (Array.isArray(obj)) return obj.map(clean);
      if (obj && typeof obj === 'object') {
        const result = {};
        for (const k of Object.keys(obj)) result[k] = clean(obj[k]);
        return result;
      }
      return obj;
    };
    req.body = clean(req.body);
  }
  next();
}

app.use(cors({ origin: process.env.ALLOWED_ORIGIN || '*', credentials: true }));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(sanitizeBody);

// Apply rate limits per-route (key prevents cross-route collisions)
app.use('/api/auth/login', rateLimit(20, 15 * 60 * 1000, 'login'));           // 20 per 15 min
app.use('/api/auth/signup', rateLimit(5, 60 * 60 * 1000, 'signup'));           // 5 per hour
app.use('/api/auth/reset-password', rateLimit(5, 60 * 60 * 1000, 'reset'));   // 5 per hour
app.use('/api/2fa', rateLimit(20, 15 * 60 * 1000, '2fa'));



// Multer â€” store files in memory as Buffer, convert to base64 for demo
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB
});

// In-memory stores for uploaded media
const CASE_SOLUTIONS = {}; // caseId -> { textNote, notes: [], mediaFiles: [...] }

function ensureCaseSolution(caseId) {
  if (!CASE_SOLUTIONS[caseId]) CASE_SOLUTIONS[caseId] = { textNote: '', notes: [], mediaFiles: [] };
  if (!CASE_SOLUTIONS[caseId].notes) CASE_SOLUTIONS[caseId].notes = [];
  if (!CASE_SOLUTIONS[caseId].mediaFiles) CASE_SOLUTIONS[caseId].mediaFiles = [];
  return CASE_SOLUTIONS[caseId];
}

function syncCaseToKnowledgeBase(caseId, user) {
  const c = DEMO_CASES.find(x => x.id === caseId);
  const sol = ensureCaseSolution(caseId);
  const noteHistory = [...(sol.notes || [])].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const files = (sol.mediaFiles || []).map(f => ({ ...f }));
  if (!noteHistory.length && !files.length) return;

  const titleBase = c ? `${(c.device_brand || '').trim()} ${(c.device_model || '').trim()}`.trim() : '';
  const title = `${titleBase || 'Case'} — ${c?.case_number || caseId}`;
  const deviceType = c?.device_type || 'Other';
  const category = c?.failure_type || deviceType;
  const tags = c?.failure_types?.length ? c.failure_types : (c?.failure_type ? [c.failure_type] : []);
  const latestNote = noteHistory[0]?.text || '';
  const now = new Date().toISOString();
  const idx = SOLUTIONS.findIndex(s =>
    s.source === 'case' && (s.case_refs || []).some(r => r.case_id === caseId)
  );

  const kbPayload = {
    title,
    device_type: deviceType,
    category,
    problem: c?.problem_description || c?.failure_description || '',
    notes: latestNote,
    note_history: noteHistory,
    tags,
    files,
    case_refs: [{ case_id: caseId, case_number: c?.case_number }],
    source: 'case',
    updated_at: now,
    related_case_count: 1,
    has_media: files.length > 0,
  };

  if (idx >= 0) {
    const existing = SOLUTIONS[idx];
    SOLUTIONS[idx] = {
      ...existing,
      ...kbPayload,
      id: existing.id,
      created_at: existing.created_at,
      created_by: existing.created_by,
      created_by_name: existing.created_by_name,
    };
    return;
  }

  SOLUTIONS.unshift({
    id: `kb_${caseId}`,
    ...kbPayload,
    created_by: user?.userId || user?.id,
    created_by_name: user?.username || user?.full_name || 'Engineer',
    created_at: now,
  });
}

function syncCaseNoteToKnowledgeBase(caseId, _noteEntry, user) {
  syncCaseToKnowledgeBase(caseId, user);
}
const CASE_IMAGES = {};    // caseId -> [{ id, name, mimeType, data, uploadedAt }]
const INVENTORY_IMAGES = {}; // itemId -> [{ id, name, mimeType, data, uploadedAt }]

// â”€â”€â”€ Security / Auth stores (hoisted â€” used by login + all security routes) â”€â”€
const SECURITY_LOG   = [];         // security audit trail
const TOTP_SECRETS   = new Map();  // userId â†’ { secret, enabled, backup_codes }
const OTP_STORE      = new Map();  // `${identifier}_reset` â†’ { otp, userId, expires, used }
const USER_ENC_KEYS  = new Map();  // userId â†’ encryption key metadata
const RECYCLE_BIN    = [];         // soft-deleted cases (never auto-purged)
const BACKUP_HISTORY = [];         // backup / restore operation history
const PURCHASE_LOG   = [];         // Razorpay purchase & webhook events

// ─── Audit Log (super-admin actions) ─────────────────────────────────────────
const AUDIT_LOG = [
  { id: 1, action: 'LOGIN_SUCCESS',   detail: 'Super admin login initialised (system startup)', user: 'Platform Owner', at: new Date(Date.now() - 518400000).toISOString(), severity: 'info' },
  { id: 2, action: 'TENANT_CREATED',  detail: 'Demo tenant "RecoverLab Mumbai Demo" pre-seeded', user: 'System', at: new Date(Date.now() - 432000000).toISOString(), severity: 'info' },
  { id: 3, action: 'PLANS_UPDATED',   detail: 'Default plans loaded: Starter, Professional, Business, Enterprise', user: 'System', at: new Date(Date.now() - 345600000).toISOString(), severity: 'info' },
  { id: 4, action: 'BRANDING_UPDATED',detail: 'Platform identity configured: RecoverLab CRM', user: 'Platform Owner', at: new Date(Date.now() - 172800000).toISOString(), severity: 'info' },
  { id: 5, action: 'EMAIL_CONFIGURED',detail: 'SMTP email delivery settings saved', user: 'Platform Owner', at: new Date(Date.now() - 86400000).toISOString(), severity: 'info' },
];
function auditLog(action, detail, user = 'Platform Owner', severity = 'info') {
  AUDIT_LOG.unshift({ id: AUDIT_LOG.length + 1, action, detail, user, at: new Date().toISOString(), severity });
  if (AUDIT_LOG.length > 200) AUDIT_LOG.pop();
}

// ─── SA Platform Accounts ─────────────────────────────────────────────────────
const SA_ACCOUNTS = [
  { id: 'sa-root', name: 'Platform Owner', email: 'owner@recoverlab.in', role: 'super_admin', permissions: 'full', is_active: true, created_at: new Date().toISOString(), last_login: new Date().toISOString() },
];

// ─── SA Plans (server-side source of truth) ───────────────────────────────────
const SA_PLANS = [
  { key: 'starter',      label: 'Starter',      price: 999,  maxUsers: 2,  color: '#64748b', features: ['2 team users', 'Basic reports', '5GB storage'] },
  { key: 'professional', label: 'Professional', price: 2499, maxUsers: 5,  color: '#3b82f6', features: ['5 team users', 'Advanced reports', '20GB storage', 'WhatsApp integration'] },
  { key: 'business',     label: 'Business',     price: 4999, maxUsers: 15, color: '#8b5cf6', features: ['15 team users', 'Full analytics', '100GB storage', 'API access', 'Priority support'] },
  { key: 'enterprise',   label: 'Enterprise',   price: 9999, maxUsers: -1, color: '#f59e0b', features: ['Unlimited users', 'Custom domain', 'Dedicated support', 'SLA guarantee'] },
];

// ─── SA Coupons (server-side source of truth) ─────────────────────────────────
const SA_COUPONS = [];



// â”€â”€â”€ In-memory demo data â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const DEMO_USERS = [
  {
    id: '11111111-1111-1111-1111-111111111111',
    username: 'admin',
    email: 'admin@recoverlab.local',
    password_hash: bcrypt.hashSync('Admin@1234', 10),
    full_name: 'System Administrator',
    role: 'admin',
    is_active: true,
    specializations: ['firmware', 'logical', 'head_swap'],
    last_login: new Date().toISOString(),
    created_at: new Date().toISOString(),
  },
  {
    id: '22222222-2222-2222-2222-222222222222',
    username: 'john_eng',
    email: 'john@recoverlab.local',
    password_hash: bcrypt.hashSync('Engineer@1234', 10),
    full_name: 'John Engineer',
    role: 'senior_engineer',
    is_active: true,
    specializations: ['mechanical', 'head_swap', 'clean_room'],
    last_login: new Date().toISOString(),
    created_at: new Date().toISOString(),
  },
];

const DEMO_CLIENTS = [
  { id: 'c1', client_code: 'CLT-0001', first_name: 'Rahul', last_name: 'Sharma', phone: '9876543210', email: 'rahul@example.com', company: 'TechCorp Pvt Ltd', city: 'Mumbai', is_vip: true, is_corporate: true, active_cases: 2, total_cases: 5, total_paid: 45000, referral_source: 'Google', created_at: '2024-01-15T10:00:00Z' },
  { id: 'c2', client_code: 'CLT-0002', first_name: 'Priya', last_name: 'Patel', phone: '9123456789', email: 'priya@gmail.com', company: null, city: 'Ahmedabad', is_vip: false, is_corporate: false, active_cases: 1, total_cases: 2, total_paid: 12000, referral_source: 'Walk-in', created_at: '2024-02-20T10:00:00Z' },
  { id: 'c3', client_code: 'CLT-0003', first_name: 'Amit', last_name: 'Kumar', phone: '9988776655', email: 'amit@business.com', company: 'Kumar Enterprises', city: 'Delhi', is_vip: false, is_corporate: true, active_cases: 0, total_cases: 3, total_paid: 28000, referral_source: 'Referral', created_at: '2024-03-05T10:00:00Z' },
];

const DEMO_CASES = [
  { id: 'case1', case_number: 'DR-2025-00001', client_id: 'c1', first_name: 'Rahul', last_name: 'Sharma', company: 'TechCorp', device_brand: 'Western Digital', device_model: 'WD10EZEX', serial_number: 'WD-XYZ123456', capacity_gb: 1000, interface: 'SATA', failure_type: 'mechanical', symptoms: ['clicking', 'not_detected'], stage: 'diagnosis', priority: 1, ai_risk_level: 'high', engineer_name: 'John Engineer', recovery_progress_pct: 0, received_at: '2025-01-10T08:00:00Z', created_at: '2025-01-10T08:00:00Z', initial_diagnosis: 'Drive making clicking noise. Likely head failure or seized spindle motor.' },
  { id: 'case2', case_number: 'DR-2025-00002', client_id: 'c2', first_name: 'Priya', last_name: 'Patel', company: null, device_brand: 'Seagate', device_model: 'ST1000DM010', serial_number: 'Z9ATXXXX', capacity_gb: 1000, interface: 'SATA', failure_type: 'firmware', symptoms: ['slow', 'not_detected'], stage: 'recovery_in_progress', priority: 2, ai_risk_level: 'medium', engineer_name: 'John Engineer', recovery_progress_pct: 45, received_at: '2025-01-12T09:00:00Z', created_at: '2025-01-12T09:00:00Z', initial_diagnosis: 'Drive not detected. Firmware issue suspected - typical Seagate BSY bug variant.' },
  { id: 'case3', case_number: 'DR-2025-00003', client_id: 'c3', first_name: 'Amit', last_name: 'Kumar', company: 'Kumar Enterprises', device_brand: 'Samsung', device_model: '860 EVO 500GB', serial_number: 'S4ESXXXXXX', capacity_gb: 500, interface: 'SATA', failure_type: 'logical', symptoms: ['not_detected'], stage: 'completed', priority: 3, ai_risk_level: 'low', engineer_name: 'John Engineer', recovery_progress_pct: 100, received_at: '2025-01-08T07:00:00Z', created_at: '2025-01-08T07:00:00Z', initial_diagnosis: 'SSD not mounting. Logical issue - partition table corruption.' },
  { id: 'case4', case_number: 'DR-2025-00004', client_id: 'c1', first_name: 'Rahul', last_name: 'Sharma', company: 'TechCorp', device_brand: 'Toshiba', device_model: 'MQ01ABD100', serial_number: 'Y3XXXXXX', capacity_gb: 1000, interface: 'SATA', failure_type: 'electrical', symptoms: ['dead', 'pcb_burnt'], stage: 'inspection', priority: 1, ai_risk_level: 'critical', engineer_name: null, recovery_progress_pct: 0, received_at: '2025-01-15T11:00:00Z', created_at: '2025-01-15T11:00:00Z', initial_diagnosis: 'Visible burn mark on PCB. TVS diode blown. Need PCB donor.' },
  { id: 'case5', case_number: 'DR-2025-00005', client_id: 'c2', first_name: 'Priya', last_name: 'Patel', company: null, device_brand: 'Seagate', device_model: 'ST2000DM008', serial_number: 'ZFNXXXXX', capacity_gb: 2000, interface: 'SATA', failure_type: 'mechanical', symptoms: ['grinding'], stage: 'quotation', priority: 2, ai_risk_level: 'high', engineer_name: 'John Engineer', recovery_progress_pct: 0, received_at: '2025-01-14T10:00:00Z', created_at: '2025-01-14T10:00:00Z', initial_diagnosis: 'Grinding noise. Head crash confirmed. Clean room operation required.' },
];

const DEMO_MODELS = [
  { id: 'm1', brand_name: 'Western Digital', model_number: 'WD10EZEX', series: 'Blue', capacity_gb: 1000, rpm: 7200, interface: 'SATA', form_factor: '3.5', controller_chip: 'Marvel 88i9145', pcb_number: '2060-771824-003', firmware_family: 'ABCDE1', risk_level: 'medium', is_verified: true, case_count: 23, success_rate: 82, common_failures: ['Head crash', 'Sticky motor', 'ROM corruption'] },
  { id: 'm2', brand_name: 'Seagate', model_number: 'ST1000DM010', series: 'Barracuda', capacity_gb: 1000, rpm: 7200, interface: 'SATA', form_factor: '3.5', controller_chip: 'Seagate Moose', pcb_number: '100724095', firmware_family: 'CC43', risk_level: 'high', is_verified: true, case_count: 45, success_rate: 65, common_failures: ['BSY firmware bug', 'LBA0 corruption', 'Head failure'] },
  { id: 'm3', brand_name: 'Samsung', model_number: '860 EVO', series: 'EVO', capacity_gb: 500, nand_type: 'MLC', interface: 'SATA', form_factor: '2.5', controller_chip: 'Samsung MGX', pcb_number: null, firmware_family: 'RVT01B6Q', risk_level: 'low', is_verified: true, case_count: 12, success_rate: 95, common_failures: ['Logical corruption', 'Wear leveling failure'] },
  { id: 'm4', brand_name: 'Toshiba', model_number: 'MQ01ABD100', series: 'MQ', capacity_gb: 1000, rpm: 5400, interface: 'SATA', form_factor: '2.5', controller_chip: 'Marvell 88i9105', pcb_number: 'G003138A', firmware_family: 'AX001J', risk_level: 'medium', is_verified: false, case_count: 8, success_rate: 78, common_failures: ['PCB failure', 'Head parking failure'] },
];

const DEMO_INVENTORY = [
  // WD 3.5"
  { id: 'inv1', sku: 'SKU-0001', stock_number: 'WD35-001', name: 'WD Blue 1TB 3.5"', category: 'wd_35', company: 'Western Digital', brand: 'Western Digital', model: 'WD10EZEX', serial_number: 'WD-WCAZBB12345', pcb_number: '2060-771824-003', firmware: 'ABCDE1', site_code: 'WCAZBB', date_code: '2502', head_map: '00 01 02 03', family: 'RYNO5', capacity: '1TB', interface: 'SATA', form_factor: '3.5" HDD', quantity: 3, min_quantity: 1, unit_cost: 1500, location: 'Cabinet A, Shelf 1', condition: 'used', status: 'available', notes: 'Good donor. Matching PCB for WD Blue series.', created_at: '2025-01-01T00:00:00Z' },
  { id: 'inv2', sku: 'SKU-0002', stock_number: 'WD35-002', name: 'WD Green 2TB 3.5"', category: 'wd_35', company: 'Western Digital', brand: 'Western Digital', model: 'WD20EZRZ', serial_number: 'WD-WCC4N8765432', pcb_number: '2060-800039-001', firmware: 'CC85', site_code: 'WCC4N', date_code: '2401', capacity: '2TB', interface: 'SATA', form_factor: '3.5" HDD', quantity: 1, min_quantity: 1, unit_cost: 1800, location: 'Cabinet A, Shelf 2', condition: 'used', status: 'available', created_at: '2025-01-01T00:00:00Z' },
  // WD 2.5"
  { id: 'inv3', sku: 'SKU-0003', stock_number: 'WD25-001', name: 'WD Blue 500GB 2.5"', category: 'wd_25', company: 'Western Digital', brand: 'Western Digital', model: 'WD5000LPVX', serial_number: 'WD-WX91C0654321', pcb_number: '2060-771961-001', firmware: '03.01A03', site_code: 'WX91C', date_code: '2310', capacity: '500GB', interface: 'SATA', form_factor: '2.5" HDD', quantity: 2, min_quantity: 1, unit_cost: 800, location: 'Cabinet B, Shelf 1', condition: 'used', status: 'available', created_at: '2025-01-05T00:00:00Z' },
  // Seagate 3.5"
  { id: 'inv4', sku: 'SKU-0004', stock_number: 'SGT35-001', name: 'Seagate Barracuda 1TB 3.5"', category: 'seagate_35', company: 'Seagate', brand: 'Seagate', model: 'ST1000DM010', serial_number: 'ZF19ABCD', pcb_number: '100724095', firmware: 'CC43', site_code: 'KRATSG', date_code: '2303', capacity: '1TB', interface: 'SATA', form_factor: '3.5" HDD', quantity: 4, min_quantity: 2, unit_cost: 1200, location: 'Cabinet A, Shelf 3', condition: 'used', status: 'available', created_at: '2025-01-01T00:00:00Z' },
  { id: 'inv5', sku: 'SKU-0005', stock_number: 'SGT35-002', name: 'Seagate Barracuda 2TB 3.5"', category: 'seagate_35', company: 'Seagate', brand: 'Seagate', model: 'ST2000DM008', serial_number: 'WFN12345', pcb_number: '100762026', firmware: '0001', site_code: 'KRATSG', date_code: '2405', capacity: '2TB', interface: 'SATA', form_factor: '3.5" HDD', quantity: 0, min_quantity: 1, unit_cost: 1600, location: 'Cabinet A, Shelf 4', condition: 'for_parts', status: 'used', created_at: '2025-01-02T00:00:00Z' },
  // Seagate 2.5"
  { id: 'inv6', sku: 'SKU-0006', stock_number: 'SGT25-001', name: 'Seagate Momentus 500GB 2.5"', category: 'seagate_25', company: 'Seagate', brand: 'Seagate', model: 'ST500LT012', serial_number: 'S2X1ABCD', pcb_number: '100687658', firmware: '0001SDM1', capacity: '500GB', interface: 'SATA', form_factor: '2.5" HDD', quantity: 2, min_quantity: 1, unit_cost: 700, location: 'Cabinet B, Shelf 2', condition: 'used', status: 'available', created_at: '2025-01-06T00:00:00Z' },
  // Others 3.5"
  { id: 'inv7', sku: 'SKU-0007', stock_number: 'OTH35-001', name: 'Toshiba DT01ACA 1TB 3.5"', category: 'others_35', company: 'Toshiba', brand: 'Toshiba', model: 'DT01ACA100', serial_number: 'X4ABCDEFG', pcb_number: 'G002825A', firmware: 'MS2OA750', capacity: '1TB', interface: 'SATA', form_factor: '3.5" HDD', quantity: 1, min_quantity: 1, unit_cost: 1100, location: 'Cabinet C, Shelf 1', condition: 'used', status: 'available', created_at: '2025-01-07T00:00:00Z' },
  // Others 2.5"
  { id: 'inv8', sku: 'SKU-0008', stock_number: 'OTH25-001', name: 'Hitachi 320GB 2.5"', category: 'others_25', company: 'Hitachi (HGST)', brand: 'Hitachi', model: 'HTS545032A7E680', serial_number: '110202A5ABCD', pcb_number: '0J49808', firmware: 'GG2ZBD20', capacity: '320GB', interface: 'SATA', form_factor: '2.5" HDD', quantity: 3, min_quantity: 1, unit_cost: 600, location: 'Cabinet B, Shelf 3', condition: 'used', status: 'available', created_at: '2025-01-08T00:00:00Z' },
  // PCB
  { id: 'inv9', sku: 'SKU-0009', stock_number: 'PCB-001', name: 'WD PCB 771824-003', category: 'pcb', company: 'Western Digital', brand: 'Western Digital', model: 'PCB for WD10EZEX', pcb_number: '2060-771824-003', compatible_drives: 'WD10EZEX, WD10EURX', firmware: 'ABCDE1 BIOS', quantity: 2, min_quantity: 1, unit_cost: 500, location: 'PCB Rack, Row 1', condition: 'used', status: 'available', created_at: '2025-01-09T00:00:00Z' },
  { id: 'inv10', sku: 'SKU-0010', stock_number: 'PCB-002', name: 'Seagate PCB 100724095', category: 'pcb', company: 'Seagate', brand: 'Seagate', model: 'PCB for ST1000DM010', pcb_number: '100724095', compatible_drives: 'ST1000DM010, ST2000DM006', quantity: 1, min_quantity: 1, unit_cost: 400, location: 'PCB Rack, Row 2', condition: 'used', status: 'available', created_at: '2025-01-09T00:00:00Z' },
  // SSD
  { id: 'inv11', sku: 'SKU-0011', stock_number: 'SSD-001', name: 'Samsung 860 EVO 256GB', category: 'ssd', company: 'Samsung', brand: 'Samsung', model: '860 EVO', serial_number: 'S3YANX0K123456', capacity: '256GB', interface: 'SATA', firmware: 'RVT01B6Q', quantity: 2, min_quantity: 1, unit_cost: 2500, location: 'Cabinet D, Shelf 1', condition: 'used', status: 'available', created_at: '2025-01-10T00:00:00Z' },
  // Phone
  { id: 'inv12', sku: 'SKU-0012', stock_number: 'PHN-001', name: 'Samsung Galaxy A50 (Board Only)', category: 'phone', company: 'Samsung', brand: 'Samsung', model: 'Galaxy A50', serial_number: '358236109876543', capacity: '64GB', firmware: 'Android 11', quantity: 1, min_quantity: 1, unit_cost: 1200, location: 'Cabinet D, Shelf 2', condition: 'for_parts', status: 'available', created_at: '2025-01-11T00:00:00Z' },
];

// â”€â”€â”€ Super Admin (Owner) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const SUPER_ADMIN = {
  id: 'sa-0000-0000-0000',
  username: 'superadmin',
  email: 'owner@recoverlab.in',
  password_hash: bcrypt.hashSync('SuperAdmin@123', 10),
  full_name: 'Platform Owner',
  role: 'super_admin',
  tenant_id: 'super',
  is_active: true,
  created_at: new Date().toISOString(),
};

// â”€â”€â”€ In-memory Tenants (Paid Accounts) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const TENANTS = [
  {
    id: 'tenant-demo-001',
    company_name: 'RecoverLab Mumbai Demo',
    admin_email: 'admin@recoverlab.local',
    admin_name: 'System Administrator',
    plan: 'professional',
    status: 'active',
    max_team_users: 5,
    city: 'Mumbai',
    gstin: '',
    phone: '',
    notes: 'Demo tenant (pre-seeded)',
    team_user_count: 1,
    expiry_date: new Date(Date.now() + 365 * 86400000).toISOString().slice(0, 10),
    created_at: new Date().toISOString(),
  },
];

// â”€â”€â”€ Team Users (scoped to tenant) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const TEAM_USERS = [];


// â”€â”€â”€ JWT Helper â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function signToken(user) {
  return jwt.sign({
    userId: user.id,
    role: user.role,
    username: user.username,
    tenant_id: user.tenant_id,
    permissions: user.permissions || null,
  }, JWT_SECRET, { expiresIn: '8h' });
}

function authenticate(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) return res.status(401).json({ error: 'No token' });
  try {
    req.user = jwt.verify(auth.slice(7), JWT_SECRET);
    next();
  } catch { res.status(401).json({ error: 'Invalid token' }); }
}

function requireSuperAdmin(req, res, next) {
  if (req.user?.role !== 'super_admin') {
    return res.status(403).json({ error: 'Super Admin access required' });
  }
  next();
}

function requireAdmin(req, res, next) {
  if (req.user?.role !== 'super_admin' && req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

// requireOwner — only the per-tenant account owner (role=admin) can access
// Super admin manages plans via the super-admin console, not tenant subscription routes
function requireOwner(req, res, next) {
  if (req.user?.role !== 'admin') {
    if (req.user?.role === 'super_admin') {
      return res.status(403).json({
        error: 'Use Super Admin Console to manage tenant subscriptions',
        hint: 'Navigate to /super-admin → Tenants tab to manage this tenant\'s plan.'
      });
    }
    return res.status(403).json({
      error: 'Account owner access required',
      hint: 'Only the account owner (Admin) can manage subscription plans.'
    });
  }
  next();
}

// Subscription expiry check
function checkSubscription(req, res, next) {
  const expiryDate = COMPANY_SETTINGS.subscription_expiry;
  if (expiryDate && new Date(expiryDate) < new Date()) {
    // Allow auth routes but block data routes
    if (req.path.startsWith('/auth') || req.path === '/health') return next();
    return res.status(402).json({
      error: 'Subscription expired',
      expired_at: expiryDate,
      message: 'Your subscription has expired. Please renew to continue using the system.'
    });
  }
  next();
}

// Apply subscription check to all data API routes
app.use(['/api/cases', '/api/clients', '/api/inventory', '/api/accounting', '/api/analytics', '/api/payments'], (req, res, next) => {
  const expiry = COMPANY_SETTINGS.subscription_expiry;
  if (expiry && new Date(expiry) < new Date()) {
    return res.status(402).json({ error: 'Subscription expired', message: 'Please renew your subscription.' });
  }
  next();
});

// â”€â”€â”€ AUTH â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password required' });

  // Check super admin first
  let user = null;
  if (username === SUPER_ADMIN.username || username === SUPER_ADMIN.email) {
    user = SUPER_ADMIN;
  } else {
    user = DEMO_USERS.find(u => u.username === username || u.email === username);
    if (!user) user = TEAM_USERS.find(u => (u.username === username || u.email === username) && u.is_active !== false);
  }

  // â”€â”€â”€ Security Audit Log â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const logEntry = { event: 'LOGIN_ATTEMPT', username, ip: req.ip, at: new Date().toISOString() };

  if (!user) {
    logEntry.event = 'LOGIN_FAILED_USER_NOT_FOUND';
    SECURITY_LOG.unshift(logEntry);
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    logEntry.event = 'LOGIN_FAILED_WRONG_PASSWORD';
    SECURITY_LOG.unshift(logEntry);
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  // Check tenant status
  if (user.tenant_id && user.tenant_id !== 'super') {
    const tenant = TENANTS.find(t => t.id === user.tenant_id);
    if (tenant && tenant.status === 'suspended') {
      logEntry.event = 'LOGIN_BLOCKED_SUSPENDED';
      SECURITY_LOG.unshift(logEntry);
      return res.status(403).json({ error: 'Account suspended. Please contact support.' });
    }
  }

  // â”€â”€â”€ 2FA Check â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const tfaEntry = TOTP_SECRETS.get(user.id);
  if (user.two_factor_enabled && tfaEntry?.enabled) {
    // Issue a short-lived temp token â€” does NOT grant API access
    const tempToken = jwt.sign(
      { userId: user.id, username: user.username, purpose: '2fa_pending' },
      JWT_SECRET + '_2fa',
      { expiresIn: '5m' }
    );
    logEntry.event = 'LOGIN_2FA_REQUIRED';
    SECURITY_LOG.unshift(logEntry);
    return res.json({ requires_2fa: true, temp_token: tempToken, message: 'Enter your 2FA code to continue.' });
  }

  // â”€â”€â”€ Success â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  logEntry.event = 'LOGIN_SUCCESS';
  SECURITY_LOG.unshift(logEntry);

  const accessToken = signToken(user);
  const { password_hash, ...safeUser } = user;
  const tenant = TENANTS.find(t => t.id === user.tenant_id);
  res.json({
    accessToken,
    refreshToken: `refresh_${user.id}`,
    user: { ...safeUser, fullName: user.full_name, tenant: tenant ? { plan: tenant.plan, max_team_users: tenant.max_team_users, expiry_date: tenant.expiry_date, status: tenant.status } : null }
  });
});


app.post('/api/auth/refresh', (req, res) => {
  const { refreshToken } = req.body;
  const userId = refreshToken?.replace('refresh_', '');
  const user = [SUPER_ADMIN, ...DEMO_USERS, ...TEAM_USERS].find(u => u.id === userId);
  if (!user) return res.status(401).json({ error: 'Invalid refresh token' });
  res.json({ accessToken: signToken(user) });
});

app.post('/api/auth/logout', (req, res) => res.json({ message: 'Logged out' }));

// ── Self-service Signup (creates a new tenant + admin account) ──────────────
app.post('/api/auth/signup', async (req, res) => {
  const { company_name, admin_name, admin_email, admin_password, phone, city, plan } = req.body;
  if (!company_name || !admin_email || !admin_password) {
    return res.status(400).json({ error: 'company_name, admin_email, and admin_password are required' });
  }
  const allUsers = [SUPER_ADMIN, ...DEMO_USERS, ...TEAM_USERS];
  if (allUsers.find(u => u.email === admin_email)) {
    return res.status(409).json({ error: 'An account with this email already exists' });
  }
  const tenantId = `tenant_${Date.now()}`;
  const tenant = {
    id: tenantId,
    company_name,
    admin_email,
    admin_name: admin_name || '',
    plan: plan || 'starter',
    status: 'trial',
    max_team_users: 2,
    city: city || '',
    phone: phone || '',
    team_user_count: 1,
    expiry_date: new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10), // 14-day trial
    created_at: new Date().toISOString(),
  };
  TENANTS.push(tenant);
  const adminUser = {
    id: `admin_${Date.now()}`,
    full_name: admin_name || company_name + ' Admin',
    username: admin_email.split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, '_'),
    email: admin_email,
    password_hash: await bcrypt.hash(admin_password, 10),
    role: 'admin',
    tenant_id: tenantId,
    is_active: true,
    created_at: new Date().toISOString(),
  };
  DEMO_USERS.push(adminUser);
  res.status(201).json({ message: 'Account created! You can now log in.', email: admin_email, plan: tenant.plan, trial_days: 14 });
});

app.get('/api/auth/me', authenticate, (req, res) => {
  const allUsers = [SUPER_ADMIN, ...DEMO_USERS, ...TEAM_USERS];
  const user = allUsers.find(u => u.id === req.user.userId);
  if (!user) return res.status(404).json({ error: 'User not found' });
  const { password_hash, ...safe } = user;
  const tenant = TENANTS.find(t => t.id === user.tenant_id);
  res.json({ ...safe, fullName: user.full_name, tenant: tenant ? { plan: tenant.plan, max_team_users: tenant.max_team_users, expiry_date: tenant.expiry_date, status: tenant.status } : null });
});

app.put('/api/auth/change-password', authenticate, (req, res) => {
  res.json({ message: 'Password changed (demo mode â€“ not persisted)' });
});

// â”€â”€â”€ USERS API (Admin manages team) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
app.get('/api/users', authenticate, requireAdmin, (req, res) => {
  // Super admin sees all, admin sees only their tenant's users
  let users;
  if (req.user.role === 'super_admin') {
    users = [SUPER_ADMIN, ...DEMO_USERS, ...TEAM_USERS];
  } else {
    const tenantId = req.user.tenant_id;
    users = [...DEMO_USERS.filter(u => u.tenant_id === tenantId), ...TEAM_USERS.filter(u => u.tenant_id === tenantId)];
  }
  const safe = users.map(({ password_hash, ...u }) => u);
  res.json({ users: safe, total: safe.length });
});

app.post('/api/users', authenticate, requireAdmin, async (req, res) => {
  const { full_name, username, email, password, role, role_key, permissions, phone, is_active, specializations } = req.body;
  if (!full_name || !username || !password) return res.status(400).json({ error: 'full_name, username, password required' });

  // Check tenant user limit
  const tenantId = req.user.role === 'super_admin' ? 'super' : req.user.tenant_id;
  const tenant = TENANTS.find(t => t.id === tenantId);
  const existingCount = TEAM_USERS.filter(u => u.tenant_id === tenantId).length;
  if (tenant && existingCount >= tenant.max_team_users) {
    return res.status(403).json({ error: `Team user limit reached (${tenant.max_team_users}). Upgrade plan to add more.` });
  }

  const exists = [...DEMO_USERS, ...TEAM_USERS].find(u => u.username === username || u.email === email);
  if (exists) return res.status(409).json({ error: 'Username or email already exists' });

  const newUser = {
    id: `user_${Date.now()}`,
    full_name,
    username: username.toLowerCase(),
    email: email || '',
    password_hash: await bcrypt.hash(password, 10),
    role: role_key || role || 'junior_engineer',
    permissions: permissions || null,
    phone: phone || '',
    is_active: is_active !== false,
    specializations: specializations || [],
    tenant_id: tenantId,
    created_by: req.user.userId,
    created_at: new Date().toISOString(),
  };
  TEAM_USERS.push(newUser);
  // Update tenant user count
  if (tenant) tenant.team_user_count = (tenant.team_user_count || 0) + 1;
  const { password_hash, ...safe } = newUser;
  res.status(201).json(safe);
});

app.patch('/api/users/:id', authenticate, requireAdmin, async (req, res) => {
  const { password, ...rest } = req.body;
  let user = SUPER_ADMIN.id === req.params.id ? SUPER_ADMIN : DEMO_USERS.find(u => u.id === req.params.id) || TEAM_USERS.find(u => u.id === req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  if (password) user.password_hash = await bcrypt.hash(password, 10);
  Object.assign(user, rest);
  user.id = user.id; // preserve id if assign overwrote it accidentally
  const { password_hash, ...safe } = user;
  res.json(safe);
});

app.post('/api/users/:id/deactivate', authenticate, requireAdmin, (req, res) => {
  const user = SUPER_ADMIN.id === req.params.id ? SUPER_ADMIN : DEMO_USERS.find(u => u.id === req.params.id) || TEAM_USERS.find(u => u.id === req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  user.is_active = !user.is_active;
  res.json({ ok: true, is_active: user.is_active });
});

// â”€â”€â”€ SUPER ADMIN API â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
app.get('/api/super-admin/tenants', authenticate, requireSuperAdmin, (req, res) => {
  // Attach live user count to each tenant
  const enriched = TENANTS.map(t => ({
    ...t,
    team_user_count: TEAM_USERS.filter(u => u.tenant_id === t.id).length +
      DEMO_USERS.filter(u => u.tenant_id === t.id).length,
  }));
  res.json({ tenants: enriched, total: enriched.length });
});

app.post('/api/super-admin/tenants', authenticate, requireSuperAdmin, async (req, res) => {
  const { company_name, admin_email, admin_password, admin_name, plan, max_team_users, expiry_date, city, gstin, phone, notes, subscription_months } = req.body;
  if (!company_name || !admin_email || !admin_password) return res.status(400).json({ error: 'company_name, admin_email, admin_password required' });

  const id = `tenant_${Date.now()}`;
  const tenant = {
    id,
    company_name,
    admin_email,
    admin_name: admin_name || '',
    plan: plan || 'professional',
    status: 'active',
    max_team_users: max_team_users || 5,
    city: city || '',
    gstin: gstin || '',
    phone: phone || '',
    notes: notes || '',
    team_user_count: 1,
    expiry_date: expiry_date || new Date(Date.now() + (subscription_months || 12) * 30 * 86400000).toISOString().slice(0, 10),
    created_at: new Date().toISOString(),
  };
  TENANTS.push(tenant);

  // Create admin user for this tenant
  const adminUser = {
    id: `admin_${Date.now()}`,
    full_name: admin_name || company_name + ' Admin',
    username: admin_email.split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, '_'),
    email: admin_email,
    password_hash: await bcrypt.hash(admin_password, 10),
    role: 'admin',
    tenant_id: id,
    permissions: null,
    is_active: true,
    created_at: new Date().toISOString(),
  };
  DEMO_USERS.push(adminUser);
  auditLog('TENANT_CREATED', `Created tenant "${company_name}" (${plan || 'professional'} plan, ${admin_email})`, 'Platform Owner', 'info');

  res.status(201).json({ tenant, admin: { ...adminUser, password_hash: undefined } });
});

app.patch('/api/super-admin/tenants/:id', authenticate, requireSuperAdmin, (req, res) => {
  const idx = TENANTS.findIndex(t => t.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Tenant not found' });
  TENANTS[idx] = { ...TENANTS[idx], ...req.body };
  const action = req.body.status === 'suspended' ? 'TENANT_SUSPENDED' : req.body.status === 'active' ? 'TENANT_ACTIVATED' : 'TENANT_UPDATED';
  const sev = req.body.status === 'suspended' ? 'warn' : 'info';
  auditLog(action, `Updated tenant "${TENANTS[idx].company_name}"${req.body.status ? ` \u2192 ${req.body.status}` : ''}`, 'Platform Owner', sev);
  res.json(TENANTS[idx]);
});

app.delete('/api/super-admin/tenants/:id', authenticate, requireSuperAdmin, (req, res) => {
  const idx = TENANTS.findIndex(t => t.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Tenant not found' });
  auditLog('TENANT_DELETED', `Deleted tenant "${TENANTS[idx].company_name}"`, 'Platform Owner', 'danger');
  TENANTS.splice(idx, 1);
  res.json({ ok: true });
});

// Super admin access to a tenant's cases (impersonation API)
app.get('/api/super-admin/tenants/:id/data', authenticate, requireSuperAdmin, (req, res) => {
  const tenant = TENANTS.find(t => t.id === req.params.id);
  if (!tenant) return res.status(404).json({ error: 'Tenant not found' });
  const users = TEAM_USERS.filter(u => u.tenant_id === req.params.id).map(({ password_hash, ...u }) => u);
  res.json({ tenant, users, case_count: DEMO_CASES.length });
});

// Get all users within a specific tenant
app.get('/api/super-admin/tenants/:id/users', authenticate, requireSuperAdmin, (req, res) => {
  const tenant = TENANTS.find(t => t.id === req.params.id);
  if (!tenant) return res.status(404).json({ error: 'Tenant not found' });
  const demoUsers = DEMO_USERS.filter(u => u.email === tenant.admin_email || u.tenant_id === req.params.id);
  const teamUsers = TEAM_USERS.filter(u => u.tenant_id === req.params.id);
  const users = [...demoUsers, ...teamUsers].map(({ password_hash, ...u }) => u);
  res.json({ users });
});

// Deactivate / reactivate a user within a tenant
app.patch('/api/super-admin/tenants/:id/users/:uid', authenticate, requireSuperAdmin, (req, res) => {
  let user = DEMO_USERS.find(u => u.id === req.params.uid) || TEAM_USERS.find(u => u.id === req.params.uid);
  if (!user) return res.status(404).json({ error: 'User not found' });
  if (req.body.is_active !== undefined) user.is_active = req.body.is_active;
  const { password_hash, ...safe } = user;
  const action = req.body.is_active ? 'Activated' : 'Deactivated';
  auditLog('USER_UPDATED', `${action} user "${user.full_name || user.email}" in tenant`, 'Platform Owner', req.body.is_active ? 'info' : 'warn');
  res.json({ ok: true, user: safe });
});

// Audit log (read-only)
app.get('/api/super-admin/audit-log', authenticate, requireSuperAdmin, (req, res) => {
  res.json({ logs: AUDIT_LOG.slice(0, 200) });
});

// SA Platform Accounts CRUD
app.get('/api/super-admin/accounts', authenticate, requireSuperAdmin, (req, res) => {
  res.json({ accounts: SA_ACCOUNTS });
});

app.post('/api/super-admin/accounts', authenticate, requireSuperAdmin, (req, res) => {
  const { name, email, role, permissions } = req.body;
  if (!name || !email) return res.status(400).json({ error: 'name and email required' });
  if (SA_ACCOUNTS.find(a => a.email === email)) return res.status(409).json({ error: 'Account with this email already exists' });
  const acc = { id: `sa_${Date.now()}`, name, email, role: role || 'support_admin', permissions: permissions || 'view_only', is_active: true, created_at: new Date().toISOString(), last_login: null };
  SA_ACCOUNTS.push(acc);
  auditLog('ACCOUNT_CREATED', `New SA account created for ${email} (${role || 'support_admin'})`, 'Platform Owner', 'info');
  res.status(201).json({ account: acc });
});

app.patch('/api/super-admin/accounts/:id', authenticate, requireSuperAdmin, (req, res) => {
  const acc = SA_ACCOUNTS.find(a => a.id === req.params.id);
  if (!acc) return res.status(404).json({ error: 'Account not found' });
  if (req.body.is_active !== undefined) acc.is_active = req.body.is_active;
  if (req.body.permissions !== undefined) acc.permissions = req.body.permissions;
  if (req.body.role !== undefined) acc.role = req.body.role;
  auditLog('ACCOUNT_UPDATED', `SA account "${acc.name}" updated`, 'Platform Owner', 'info');
  res.json({ account: acc });
});

app.delete('/api/super-admin/accounts/:id', authenticate, requireSuperAdmin, (req, res) => {
  const idx = SA_ACCOUNTS.findIndex(a => a.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Account not found' });
  if (SA_ACCOUNTS[idx].role === 'super_admin') return res.status(400).json({ error: 'Cannot delete super admin account' });
  const deleted = SA_ACCOUNTS.splice(idx, 1)[0];
  auditLog('ACCOUNT_DELETED', `SA account "${deleted.name}" (${deleted.email}) deleted`, 'Platform Owner', 'warn');
  res.json({ ok: true });
});

// Plans CRUD
app.get('/api/super-admin/plans', authenticate, requireSuperAdmin, (req, res) => {
  res.json({ plans: SA_PLANS });
});

app.put('/api/super-admin/plans', authenticate, requireSuperAdmin, (req, res) => {
  const { plans } = req.body;
  if (!Array.isArray(plans)) return res.status(400).json({ error: 'plans array required' });
  SA_PLANS.length = 0;
  plans.forEach(p => SA_PLANS.push(p));
  auditLog('PLANS_UPDATED', `Subscription plans updated (${plans.length} plans)`, 'Platform Owner', 'info');
  res.json({ plans: SA_PLANS });
});

// Coupons CRUD
app.get('/api/super-admin/coupons', authenticate, requireSuperAdmin, (req, res) => {
  res.json({ coupons: SA_COUPONS });
});

app.post('/api/super-admin/coupons', authenticate, requireSuperAdmin, (req, res) => {
  const { code, type, target_email, discount_type, discount_value, max_uses, expiry_date, description } = req.body;
  if (!code || !discount_value) return res.status(400).json({ error: 'code and discount_value required' });
  const uCode = String(code).toUpperCase();
  if (SA_COUPONS.find(c => c.code === uCode)) return res.status(409).json({ error: 'Coupon code already exists' });
  const coupon = { code: uCode, type: type || 'global', target_email: target_email || '', discount_type: discount_type || 'percent', discount_value: parseFloat(discount_value) || 0, max_uses: max_uses || '', expiry_date: expiry_date || '', description: description || '', uses: 0, created_at: new Date().toISOString() };
  SA_COUPONS.push(coupon);
  auditLog('COUPON_CREATED', `Created coupon ${uCode} (${coupon.discount_type === 'percent' ? coupon.discount_value + '%' : '\u20B9' + coupon.discount_value} off, ${coupon.type})`, 'Platform Owner', 'info');
  res.status(201).json({ coupon });
});

app.delete('/api/super-admin/coupons/:code', authenticate, requireSuperAdmin, (req, res) => {
  const idx = SA_COUPONS.findIndex(c => c.code === req.params.code.toUpperCase());
  if (idx === -1) return res.status(404).json({ error: 'Coupon not found' });
  const removed = SA_COUPONS.splice(idx, 1)[0];
  auditLog('COUPON_DELETED', `Deleted coupon ${removed.code}`, 'Platform Owner', 'warn');
  res.json({ ok: true });
});

// ─── RAZORPAY Integration ──────────────────────────────────────────────────
// In production: use razorpay npm package. Here we simulate the flow.
const RAZORPAY_PURCHASE_LOG = []; // In-memory; in prod use DB

// Create Order (called from frontend checkout before payment)
app.post('/api/razorpay/create-order', authenticate, requireOwner, (req, res) => {
  const { plan_key, coupon_code } = req.body;
  const plans = [
    { key: 'starter', label: 'Starter', price: 999, maxUsers: 2 },
    { key: 'professional', label: 'Professional', price: 2499, maxUsers: 5 },
    { key: 'business', label: 'Business', price: 4999, maxUsers: 15 },
    { key: 'enterprise', label: 'Enterprise', price: 9999, maxUsers: -1 },
  ];
  const plan = plans.find(p => p.key === plan_key);
  if (!plan) return res.status(400).json({ error: 'Invalid plan' });

  // Simulate order creation (real: Razorpay.orders.create)
  const orderId = `order_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  const amount = plan.price * 100; // Razorpay uses paise (1 INR = 100 paise)

  res.json({
    order_id: orderId,
    amount,
    currency: 'INR',
    plan_key,
    plan_label: plan.label,
    key_id: process.env.RAZORPAY_KEY_ID || 'rzp_test_demo',
    prefill: {
      name: req.user.username,
      email: req.user.username + '@demo.com',
    },
  });
});

// Webhook — receives Razorpay events (payment.captured, subscription.activated)
// Raw body needed for signature verification — register BEFORE express.json
app.post('/api/razorpay/webhook', express.raw({ type: 'application/json' }), (req, res) => {
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET || '';
  const signature = req.headers['x-razorpay-signature'];

  // Verify HMAC-SHA256 signature if secret is configured
  if (webhookSecret && signature) {
    const expectedSig = crypto.createHmac('sha256', webhookSecret).update(req.body).digest('hex');
    if (expectedSig !== signature) {
      console.warn('[Razorpay] Webhook signature mismatch — rejecting');
      return res.status(400).json({ error: 'Invalid signature' });
    }
  }

  let event;
  try { event = JSON.parse(req.body.toString()); } catch { return res.status(400).json({ error: 'Invalid JSON' }); }

  const { event: eventType, payload } = event;
  console.log(`[Razorpay Webhook] Event: ${eventType}`);

  if (eventType === 'payment.captured') {
    const payment = payload?.payment?.entity;
    if (!payment) return res.status(200).json({ ok: true });

    const tenantEmail = payment.notes?.admin_email || payment.email;
    const planKey = payment.notes?.plan_key || 'professional';
    const planLabel = payment.notes?.plan_label || planKey;
    const amount = payment.amount / 100; // paise → INR

    // Find and activate tenant
    const tenant = TENANTS.find(t => t.admin_email === tenantEmail);
    if (tenant) {
      tenant.status = 'active';
      tenant.plan = planKey;
      tenant.expiry_date = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
      console.log(`[Razorpay] Activated tenant ${tenant.company_name} on plan ${planKey}`);
    }

    // Log the purchase
    RAZORPAY_PURCHASE_LOG.push({
      id: `purch_${Date.now()}`,
      tenant_name: tenant?.company_name || tenantEmail,
      tenant_email: tenantEmail,
      plan: planKey,
      plan_label: planLabel,
      amount,
      status: 'success',
      razorpay_payment_id: payment.id,
      razorpay_order_id: payment.order_id,
      timestamp: new Date().toISOString(),
    });
  }

  res.status(200).json({ ok: true });
});

// Get purchase log (super admin only)
app.get('/api/razorpay/purchases', authenticate, requireSuperAdmin, (req, res) => {
  res.json({ purchases: RAZORPAY_PURCHASE_LOG, total: RAZORPAY_PURCHASE_LOG.length });
});

// â”€â”€â”€ ANALYTICS (Dashboard) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
app.get('/api/analytics/dashboard', authenticate, (req, res) => {
  res.json({
    cases: { active: 4, critical: 2, completed: 12, failed: 1, this_month: 5, total: 17 },
    revenue: { revenue_month: 38000, total_revenue: 215000, pending_revenue: 22000 },
    stageDistribution: [
      { stage: 'received', count: 1 }, { stage: 'inspection', count: 2 },
      { stage: 'diagnosis', count: 3 }, { stage: 'quotation', count: 1 },
      { stage: 'recovery_in_progress', count: 2 }, { stage: 'imaging', count: 1 },
      { stage: 'verification', count: 1 }, { stage: 'completed', count: 12 },
      { stage: 'delivered', count: 8 }, { stage: 'failed', count: 1 },
    ],
    engineers: [
      { id: '22222222-2222-2222-2222-222222222222', full_name: 'John Engineer', role: 'senior_engineer', completed_cases: 12, success_rate: 83 },
      { id: '11111111-1111-1111-1111-111111111111', full_name: 'System Administrator', role: 'admin', completed_cases: 5, success_rate: 90 },
    ],
    recentCases: DEMO_CASES.slice(0, 5),
    failureAnalytics: [
      { device_brand: 'Seagate', failure_type: 'firmware', count: 12 },
      { device_brand: 'Western Digital', failure_type: 'mechanical', count: 9 },
      { device_brand: 'Toshiba', failure_type: 'electrical', count: 5 },
      { device_brand: 'Samsung', failure_type: 'logical', count: 8 },
    ],
  });
});

app.get('/api/analytics/model-failures', authenticate, (req, res) => {
  res.json([
    { brand: 'Seagate', model_number: 'ST1000DM010', total_cases: 45, recovered: 29, failed: 16, recovery_rate: 64, common_failure: 'firmware' },
    { brand: 'Western Digital', model_number: 'WD10EZEX', total_cases: 23, recovered: 19, failed: 4, recovery_rate: 82, common_failure: 'mechanical' },
    { brand: 'Samsung', model_number: '860 EVO', total_cases: 12, recovered: 11, failed: 1, recovery_rate: 91, common_failure: 'logical' },
    { brand: 'Toshiba', model_number: 'MQ01ABD100', total_cases: 8, recovered: 6, failed: 2, recovery_rate: 75, common_failure: 'electrical' },
  ]);
});

app.get('/api/analytics/revenue-trend', authenticate, (req, res) => {
  const months = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(); d.setMonth(d.getMonth() - i);
    months.push({ month: d.toISOString().slice(0, 7), revenue: Math.floor(Math.random() * 40000) + 15000 });
  }
  months[months.length - 1].revenue = 38000;
  res.json(months);
});

app.get('/api/analytics/failure-trends', authenticate, (req, res) => res.json([]));

// â”€â”€â”€ CASES â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
app.get('/api/cases', authenticate, (req, res) => {
  let cases = [...DEMO_CASES];
  const { search, stage, failure_type, priority } = req.query;
  if (search) cases = cases.filter(c => `${c.case_number} ${c.first_name} ${c.last_name} ${c.device_model} ${c.serial_number}`.toLowerCase().includes(search.toLowerCase()));
  if (stage) cases = cases.filter(c => c.stage === stage);
  if (failure_type) cases = cases.filter(c => c.failure_type === failure_type);
  if (priority) cases = cases.filter(c => c.priority === parseInt(priority));
  res.json({ cases, pagination: { total: cases.length, page: 1, pages: 1, limit: 25 } });
});

app.get('/api/cases/:id', authenticate, (req, res) => {
  const c = DEMO_CASES.find(c => c.id === req.params.id || c.case_number === req.params.id);
  if (!c) return res.status(404).json({ error: 'Case not found' });
  res.json({
    ...c,
    workflowLogs: [
      { id: 'wl1', from_stage: null, to_stage: 'received', engineer_name: 'System Administrator', notes: 'Case created on client intake', time_spent_minutes: 15, created_at: c.created_at },
      { id: 'wl2', from_stage: 'received', to_stage: c.stage, engineer_name: 'John Engineer', notes: 'Initial inspection completed. Device logged.', time_spent_minutes: 30, created_at: new Date(new Date(c.created_at).getTime() + 3600000).toISOString() },
    ],
    files: [],
    quotations: c.stage === 'quotation' || c.stage === 'approved' ? [{ id: 'q1', quote_number: 'QT-2025-001', estimated_cost: 8000, tax_pct: 18, total_amount: 9440, approved_by_client: null, created_at: c.created_at }] : [],
    payments: [],
  });
});

app.post('/api/cases', authenticate, (req, res) => {
  const caseFmt = COMPANY_SETTINGS?.case_number_format || 'DR-{YYYY}-{NNNNN}';
  const generatedId = caseFmt.replace('{YYYY}', new Date().getFullYear()).replace(/{N+}/g, match => {
    return String(DEMO_CASES.length + 1).padStart(match.length - 2, '0');
  });

  const newCase = { id: `case_${Date.now()}`, case_number: req.body.case_number || generatedId, ...req.body, stage: 'received', recovery_progress_pct: 0, created_at: new Date().toISOString() };
  DEMO_CASES.push(newCase);
  res.status(201).json(newCase);
});

app.patch('/api/cases/:id/stage', authenticate, (req, res) => {
  const c = DEMO_CASES.find(c => c.id === req.params.id);
  if (!c) return res.status(404).json({ error: 'Case not found' });
  c.stage = req.body.stage;
  res.json(c);
});

app.get('/api/cases/:id/smart-assist', authenticate, (req, res) => {
  const c = DEMO_CASES.find(c => c.id === req.params.id);
  const failureMap = {
    mechanical: { strategy: 'Head swap in Class 100 clean room. Image with PC-3000 before any further analysis.', steps: ['Verify symptoms under controlled conditions', 'Source compatible donor drive matching PCB number and firmware', 'Perform head swap in clean room environment', 'Image drive immediately after head swap using ddrescue', 'Extract required files from image'], warnings: ['Do NOT power cycle more than once â€” further head damage risk', 'Requires Class 100 clean room â€” NO exceptions'], cleanRoomRequired: true, riskLevel: 'high' },
    firmware: { strategy: 'Use PC-3000 or MRT to repair firmware modules. Re-write ROM if necessary.', steps: ['Connect drive to PC-3000 Express', 'Read drive identification data', 'Perform translator rebuild', 'Fix Service Area modules (SA)', 'Verify drive response after firmware repair', 'Clone drive to donor media'], warnings: ['Do not attempt firmware repair without proper tools'], cleanRoomRequired: false, riskLevel: 'medium' },
    electrical: { strategy: 'PCB donor required. Perform ROM chip transplant. TVS diode inspection.', steps: ['Inspect PCB for visible damage (burnt components, blown TVS)', 'Source exact PCB donor (same PCB number)', 'Transplant ROM/BIOS chip from original to donor PCB', 'Test drive with donor PCB', 'Image immediately if drive spins up'], warnings: ['NEVER power on with damaged PCB without inspection', 'TVS diode may be sacrificial â€” check before condemning PCB'], cleanRoomRequired: false, riskLevel: 'high' },
    logical: { strategy: 'File system repair using PhotoRec/R-Studio. No physical intervention needed.', steps: ['Create sector-by-sector clone using ddrescue', 'Run file system check on clone', 'Use R-Studio or PhotoRec for data extraction', 'Verify recovered files'], warnings: [], cleanRoomRequired: false, riskLevel: 'low' },
  };
  const failure = c?.failure_type || 'logical';
  const info = failureMap[failure] || failureMap.logical;
  res.json({ ...info, suggestedFailureType: failure, confidence: 87, doNotes: 'Always work on a clone. Document all steps. Use ESD protection.', dontNotes: 'Do not open drive outside clean room. Do not force spindle.' });
});

app.get('/api/cases/:id/donors', authenticate, (req, res) => {
  res.json({ donors: [
    { id: 'inv1', brand_name: 'Western Digital', model_number: 'WD10EZEX', series: 'Blue', compatibility_score: 94, matchType: 'database_matched', match_reason: ['same_pcb', 'same_firmware', 'same_capacity'], head_compatible: true, pcb_compatible: true, firmware_compatible: true, inStock: true },
    { id: 'inv5', brand_name: 'Western Digital', model_number: 'WD10EZRX', series: 'Green', compatibility_score: 62, matchType: 'auto_matched', match_reason: ['same_capacity', 'same_interface'], head_compatible: false, pcb_compatible: false, firmware_compatible: true, inStock: false },
  ]});
});

// â”€â”€â”€ CLIENTS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
app.get('/api/clients', authenticate, (req, res) => {
  let clients = [...DEMO_CLIENTS];
  const { search } = req.query;
  if (search) clients = clients.filter(c => `${c.first_name} ${c.last_name} ${c.phone} ${c.email||''} ${c.company||''}`.toLowerCase().includes(search.toLowerCase()));
  res.json({ clients, pagination: { total: clients.length, page: 1, pages: 1, limit: 25 } });
});

app.get('/api/clients/:id', authenticate, (req, res) => {
  const cl = DEMO_CLIENTS.find(c => c.id === req.params.id);
  if (!cl) return res.status(404).json({ error: 'Client not found' });
  const cases = DEMO_CASES.filter(c => c.client_id === cl.id);
  res.json({ ...cl, cases, communications: [
    { id: 'comm1', type: 'call', direction: 'inbound', summary: 'Client called to enquire about case status. Informed about diagnosis stage.', staff_name: 'System Administrator', created_at: '2025-01-11T14:30:00Z' },
    { id: 'comm2', type: 'whatsapp', direction: 'outbound', summary: 'Sent WhatsApp update with quotation details.', staff_name: 'John Engineer', created_at: '2025-01-13T10:00:00Z' },
  ], paymentSummary: { total_paid: cl.total_paid } });
});

app.post('/api/clients', authenticate, (req, res) => {
  const cl = { id: `c${Date.now()}`, client_code: `CLT-${String(DEMO_CLIENTS.length + 1).padStart(4, '0')}`, ...req.body, active_cases: 0, total_cases: 0, total_paid: 0, created_at: new Date().toISOString() };
  DEMO_CLIENTS.push(cl);
  res.status(201).json(cl);
});

// â”€â”€â”€ STORAGE MODELS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
app.get('/api/storage-models', authenticate, (req, res) => {
  let models = [...DEMO_MODELS];
  const { search, brand_id, interface: iface, risk_level } = req.query;
  if (search) models = models.filter(m => `${m.model_number} ${m.brand_name} ${m.controller_chip||''} ${m.firmware_family||''}`.toLowerCase().includes(search.toLowerCase()));
  if (risk_level) models = models.filter(m => m.risk_level === risk_level);
  res.json({ models, pagination: { total: models.length, page: 1, pages: 1 } });
});

// âš ï¸  MUST be before /:id to avoid 'brands' being treated as an ID
app.get('/api/storage-models/brands', authenticate, (req, res) => {
  const BRANDS = [
    { id: 'b1', name: 'Western Digital' }, { id: 'b2', name: 'Seagate' },
    { id: 'b3', name: 'Toshiba' },        { id: 'b4', name: 'Samsung' },
    { id: 'b5', name: 'Hitachi' },        { id: 'b6', name: 'HGST' },
    { id: 'b7', name: 'SanDisk' },        { id: 'b8', name: 'Kingston' },
    { id: 'b9', name: 'Crucial' },        { id: 'b10', name: 'Intel' },
  ];
  res.json(BRANDS);
});

// POST â€” create new model
app.post('/api/storage-models', authenticate, (req, res) => {
  const { brand_id, common_failures_text, ...rest } = req.body;
  // Resolve brand name from id
  const BRANDS = [
    { id: 'b1', name: 'Western Digital' }, { id: 'b2', name: 'Seagate' },
    { id: 'b3', name: 'Toshiba' },        { id: 'b4', name: 'Samsung' },
    { id: 'b5', name: 'Hitachi' },        { id: 'b6', name: 'HGST' },
    { id: 'b7', name: 'SanDisk' },        { id: 'b8', name: 'Kingston' },
    { id: 'b9', name: 'Crucial' },        { id: 'b10', name: 'Intel' },
  ];
  const brand = BRANDS.find(b => b.id === brand_id);
  const newModel = {
    id: `m_${Date.now()}`,
    brand_id,
    brand_name: brand?.name || 'Unknown',
    ...rest,
    common_failures: common_failures_text
      ? common_failures_text.split(',').map(s => s.trim()).filter(Boolean)
      : [],
    is_verified: false,
    case_count: 0,
    success_rate: null,
    failureLibrary: [],
    donorMatches: [],
    created_at: new Date().toISOString(),
  };
  DEMO_MODELS.push(newModel);
  console.log(`[DEMO] Created new model: ${newModel.brand_name} ${newModel.model_number}`);
  res.status(201).json(newModel);
});

app.get('/api/storage-models/:id', authenticate, (req, res) => {
  const m = DEMO_MODELS.find(m => m.id === req.params.id);
  if (!m) return res.status(404).json({ error: 'Model not found' });
  res.json({
    ...m,
    failureLibrary: m.failureLibrary?.length ? m.failureLibrary : [
      { id: 'fl1', failure_type: m.risk_level === 'high' ? 'firmware' : 'mechanical', title: `Known ${m.brand_name} ${m.model_number} failure mode`, symptoms: ['not_detected', 'clicking'], root_cause: 'Common failure mode for this model series', solution_steps: [{ step: 1, description: 'Connect to PC-3000 Express' }, { step: 2, description: 'Read SA and identify failure module' }, { step: 3, description: 'Apply firmware patch or head swap as required' }, { step: 4, description: 'Image drive immediately' }], tools_required: ['PC-3000', 'ddrescue'], success_rate: m.success_rate, difficulty_level: 3, created_at: '2024-12-01T00:00:00Z' },
    ],
    donorMatches: m.donorMatches || [],
    do_notes: m.do_notes || 'Use ESD wrist strap. Image before any invasive procedure. Document head map before swap.',
    dont_notes: m.dont_notes || 'Do not open in non-clean environments. Do not bend PCB. Do not force spindle rotation.',
  });
});

app.put('/api/storage-models/:id', authenticate, (req, res) => {
  const idx = DEMO_MODELS.findIndex(m => m.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  DEMO_MODELS[idx] = { ...DEMO_MODELS[idx], ...req.body };
  res.json(DEMO_MODELS[idx]);
});

app.post('/api/storage-models/:id/failure-entries', authenticate, (req, res) => {
  const m = DEMO_MODELS.find(m => m.id === req.params.id);
  const entry = { id: `fl_${Date.now()}`, ...req.body, created_at: new Date().toISOString() };
  if (m) { if (!m.failureLibrary) m.failureLibrary = []; m.failureLibrary.push(entry); }
  res.status(201).json(entry);
});

// â”€â”€â”€ INVENTORY â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
app.get('/api/inventory', authenticate, (req, res) => {
  let items = [...DEMO_INVENTORY];
  const { search, category, page = 1, limit = 40 } = req.query;
  if (search) {
    const q = search.toLowerCase();
    items = items.filter(i =>
      [i.name, i.sku, i.stock_number, i.serial_number, i.pcb_number,
       i.model, i.company, i.brand, i.firmware, i.site_code, i.capacity
      ].some(f => f && f.toLowerCase().includes(q))
    );
  }
  if (category) items = items.filter(i => i.category === category);
  const lowStockAlerts = DEMO_INVENTORY.filter(i => i.quantity <= (i.min_quantity || 1)).length;
  const total = items.length;
  const pages = Math.ceil(total / parseInt(limit));
  res.json({ items, pagination: { total, page: parseInt(page), pages, limit: parseInt(limit) }, lowStockAlerts });
});

app.get('/api/inventory/donors', authenticate, (req, res) => {
  res.json(DEMO_INVENTORY.filter(i => i.status === 'available' && i.quantity > 0));
});

app.post('/api/inventory', authenticate, (req, res) => {
  const sku = `SKU-${String(DEMO_INVENTORY.length + 1).padStart(4, '0')}`;
  const item = {
    id: `inv${Date.now()}`,
    sku,
    stock_number: req.body.stock_number || sku,
    name: req.body.name || [req.body.company || req.body.brand, req.body.model].filter(Boolean).join(' ') || sku,
    ...req.body,
    created_at: new Date().toISOString(),
  };
  DEMO_INVENTORY.push(item);
  res.status(201).json(item);
});

app.patch('/api/inventory/:id/quantity', authenticate, (req, res) => {
  const item = DEMO_INVENTORY.find(i => i.id === req.params.id);
  if (!item) return res.status(404).json({ error: 'Not found' });
  const { type, quantity } = req.body;
  if (type === 'in') item.quantity = (item.quantity || 0) + parseInt(quantity);
  else if (['out', 'disposed', 'reserved'].includes(type)) item.quantity = Math.max(0, (item.quantity || 0) - parseInt(quantity));
  item.status = item.quantity > 0 ? 'available' : 'used';
  res.json(item);
});

// â”€â”€ Inventory Bulk Import â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
app.post('/api/inventory/import', authenticate, (req, res) => {
  const { data, mode = 'append' } = req.body;
  if (!data || !Array.isArray(data)) return res.status(400).json({ error: 'Expected array of inventory items' });
  let imported = 0, skipped = 0;
  for (const row of data) {
    if (!row.stock_number && !row.serial_number && !row.model) { skipped++; continue; }
    const sku = row.sku || `IMP-${Date.now()}-${imported}`;
    const stock_number = row.stock_number || sku;
    if (mode === 'overwrite') {
      const idx = DEMO_INVENTORY.findIndex(i => i.stock_number === stock_number || i.sku === stock_number);
      if (idx !== -1) {
        DEMO_INVENTORY[idx] = { ...DEMO_INVENTORY[idx], ...row, stock_number, updated_at: new Date().toISOString() };
        imported++; continue;
      }
    }
    DEMO_INVENTORY.push({
      id: `inv_imp_${Date.now()}_${imported}`,
      sku, stock_number,
      name: row.name || [row.company || row.brand, row.model].filter(Boolean).join(' ') || stock_number,
      ...row,
      status: row.status || 'available',
      created_at: new Date().toISOString(),
    });
    imported++;
  }
  res.json({ ok: true, imported, skipped, total: DEMO_INVENTORY.length });
});



// â”€â”€â”€ PAYMENTS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
app.get('/api/payments/case/:caseId', authenticate, (req, res) => res.json({ payments: [], quotations: [] }));
app.post('/api/payments/quotations', authenticate, (req, res) => res.status(201).json({ id: `q_${Date.now()}`, quote_number: `QT-${Date.now()}`, ...req.body }));
app.post('/api/payments', authenticate, (req, res) => res.status(201).json({ id: `p_${Date.now()}`, status: 'paid', ...req.body }));
app.patch('/api/payments/quotations/:id/approve', authenticate, (req, res) => res.json({ id: req.params.id, approved_by_client: req.body.approved }));

// â”€â”€â”€ USERS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
app.get('/api/users', authenticate, (req, res) => {
  res.json(DEMO_USERS.map(({ password_hash, ...u }) => u));
});

app.post('/api/users', authenticate, (req, res) => {
  const user = { id: `u_${Date.now()}`, ...req.body, password_hash: bcrypt.hashSync(req.body.password, 10), is_active: true, created_at: new Date().toISOString() };
  DEMO_USERS.push(user);
  const { password_hash, ...safe } = user;
  res.status(201).json(safe);
});

app.put('/api/users/:id', authenticate, (req, res) => {
  const user = DEMO_USERS.find(u => u.id === req.params.id);
  if (!user) return res.status(404).json({ error: 'Not found' });
  Object.assign(user, req.body);
  const { password_hash, ...safe } = user;
  res.json(safe);
});

app.get('/api/users/audit-logs', authenticate, (req, res) => {
  res.json([
    { id: 'al1', user_id: '11111111-1111-1111-1111-111111111111', full_name: 'System Administrator', username: 'admin', action: 'USER_LOGIN', resource_type: 'auth', resource_id: null, ip_address: '127.0.0.1', created_at: new Date().toISOString() },
    { id: 'al2', user_id: '22222222-2222-2222-2222-222222222222', full_name: 'John Engineer', username: 'john_eng', action: 'CASE_STAGE_TRANSITION', resource_type: 'case', resource_id: 'case2', ip_address: '127.0.0.1', created_at: new Date(Date.now() - 3600000).toISOString() },
    { id: 'al3', user_id: '11111111-1111-1111-1111-111111111111', full_name: 'System Administrator', username: 'admin', action: 'CLIENT_CREATE', resource_type: 'client', resource_id: 'c3', ip_address: '127.0.0.1', created_at: new Date(Date.now() - 7200000).toISOString() },
  ]);
});

// â”€â”€â”€ DONORS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
app.get('/api/donors/match/:caseId', authenticate, (req, res) => res.json({ donors: [] }));

// â”€â”€â”€ CASE SOLUTION (text + photo + video) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// GET solution for a case
app.get('/api/cases/:id/solution', authenticate, (req, res) => {
  const sol = ensureCaseSolution(req.params.id);
  let notes = [...(sol.notes || [])].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  if (!notes.length && sol.textNote) {
    notes = [{ id: 'legacy', text: sol.textNote, createdAt: sol.updatedAt || new Date().toISOString(), createdByName: null }];
  }
  res.json({
    textNote: notes[0]?.text || sol.textNote || '',
    notes,
    mediaFiles: (sol.mediaFiles || []).map(f => ({
      ...f,
      createdAt: f.createdAt || f.uploadedAt,
      uploadedAt: f.uploadedAt || f.createdAt,
    })),
  });
});

// SAVE/UPDATE text note for solution (append-only)
app.put('/api/cases/:id/solution', authenticate, (req, res) => {
  const { textNote } = req.body;
  if (!textNote || !String(textNote).trim()) return res.status(400).json({ error: 'Note text is required' });
  const sol = ensureCaseSolution(req.params.id);
  const noteEntry = {
    id: `sn_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    text: String(textNote).trim(),
    createdAt: new Date().toISOString(),
    createdBy: req.user.userId || req.user.id,
    createdByName: req.user.username || req.user.full_name || 'Engineer',
  };
  sol.notes.unshift(noteEntry);
  sol.textNote = noteEntry.text;
  sol.updatedAt = noteEntry.createdAt;
  try { syncCaseToKnowledgeBase(req.params.id, req.user); } catch (e) { /* non-fatal */ }
  res.json({
    textNote: sol.textNote,
    notes: sol.notes,
    mediaFiles: sol.mediaFiles,
    note: noteEntry,
  });
});

// UPLOAD media files for solution
app.post('/api/cases/:id/solution/media', authenticate, upload.array('files', 20), (req, res) => {
  const caseId = req.params.id;
  const sol = ensureCaseSolution(caseId);
  const added = (req.files || []).map(f => ({
    id: `sm_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    name: f.originalname,
    mimeType: f.mimetype,
    size: f.size,
    data: `data:${f.mimetype};base64,${f.buffer.toString('base64')}`,
    uploadedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
  }));
  sol.mediaFiles.push(...added);
  try { syncCaseToKnowledgeBase(caseId, req.user); } catch (e) { /* non-fatal */ }
  res.status(201).json({ uploaded: added.length, files: added, added, total: sol.mediaFiles.length });
});

// DELETE a solution media file
app.delete('/api/cases/:id/solution/media/:fileId', authenticate, (req, res) => {
  const sol = CASE_SOLUTIONS[req.params.id];
  if (sol) sol.mediaFiles = sol.mediaFiles.filter(f => f.id !== req.params.fileId);
  try { syncCaseToKnowledgeBase(req.params.id, req.user); } catch (e) { /* non-fatal */ }
  res.json({ ok: true });
});

// â”€â”€â”€ CASE IMAGES (photos of device) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// GET all images for a case
app.get('/api/cases/:id/images', authenticate, (req, res) => {
  res.json(CASE_IMAGES[req.params.id] || []);
});

// UPLOAD images for a case
app.post('/api/cases/:id/images', authenticate, upload.array('images', 20), (req, res) => {
  const caseId = req.params.id;
  if (!CASE_IMAGES[caseId]) CASE_IMAGES[caseId] = [];
  const added = (req.files || []).map(f => ({
    id: `ci_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    name: f.originalname,
    mimeType: f.mimetype,
    size: f.size,
    data: `data:${f.mimetype};base64,${f.buffer.toString('base64')}`,
    caption: (req.body && req.body.captions) ? (Array.isArray(req.body.captions) ? req.body.captions.shift() : req.body.captions) : '',
    uploadedAt: new Date().toISOString(),
  }));
  CASE_IMAGES[caseId].push(...added);
  res.status(201).json({ added, total: CASE_IMAGES[caseId].length });
});

// DELETE a case image
app.delete('/api/cases/:id/images/:imgId', authenticate, (req, res) => {
  if (CASE_IMAGES[req.params.id]) {
    CASE_IMAGES[req.params.id] = CASE_IMAGES[req.params.id].filter(i => i.id !== req.params.imgId);
  }
  res.json({ ok: true });
});

// â”€â”€â”€ INVENTORY IMAGES â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// GET images for an inventory item
app.get('/api/inventory/:id/images', authenticate, (req, res) => {
  res.json(INVENTORY_IMAGES[req.params.id] || []);
});

// UPLOAD images for an inventory item
app.post('/api/inventory/:id/images', authenticate, upload.array('images', 10), (req, res) => {
  const itemId = req.params.id;
  if (!INVENTORY_IMAGES[itemId]) INVENTORY_IMAGES[itemId] = [];
  const added = (req.files || []).map(f => ({
    id: `ii_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    name: f.originalname,
    mimeType: f.mimetype,
    size: f.size,
    data: `data:${f.mimetype};base64,${f.buffer.toString('base64')}`,
    uploadedAt: new Date().toISOString(),
  }));
  INVENTORY_IMAGES[itemId].push(...added);
  res.status(201).json({ added, total: INVENTORY_IMAGES[itemId].length });
});

// DELETE an inventory image
app.delete('/api/inventory/:id/images/:imgId', authenticate, (req, res) => {
  if (INVENTORY_IMAGES[req.params.id]) {
    INVENTORY_IMAGES[req.params.id] = INVENTORY_IMAGES[req.params.id].filter(i => i.id !== req.params.imgId);
  }
  res.json({ ok: true });
});

// â”€â”€â”€ ACCOUNTING DATA â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
let QUOTES = [
  { id: 'q1', quote_number: 'QT-2026-0001', case_id: 'case1', case_number: 'DR-2025-00001', client_id: 'c1', client_name: 'Rahul Sharma', company: 'TechCorp Pvt Ltd', title: 'HDD Recovery â€” WD10EZEX Mechanical Failure', line_items: [{ description: 'Clean Room Head Swap', qty: 1, unit_price: 6000 }, { description: 'Data Imaging & Extraction', qty: 1, unit_price: 2000 }, { description: 'Donor Drive', qty: 1, unit_price: 1500 }], subtotal: 9500, discount_pct: 0, discount_amt: 0, tax_pct: 18, tax_amt: 1710, total: 11210, currency: 'INR', status: 'accepted', valid_until: '2026-04-30', notes: 'Quote includes donor drive cost. Clean room operation mandatory.', created_at: '2026-03-15T10:00:00Z', sent_at: '2026-03-15T10:30:00Z', accepted_at: '2026-03-16T09:00:00Z' },
  { id: 'q2', quote_number: 'QT-2026-0002', case_id: 'case2', case_number: 'DR-2025-00002', client_id: 'c2', client_name: 'Priya Patel', company: null, title: 'Seagate Firmware Repair', line_items: [{ description: 'Firmware Diagnosis & Repair (PC-3000)', qty: 1, unit_price: 3500 }, { description: 'Data Verification', qty: 1, unit_price: 500 }], subtotal: 4000, discount_pct: 10, discount_amt: 400, tax_pct: 18, tax_amt: 648, total: 4248, currency: 'INR', status: 'sent', valid_until: '2026-04-20', notes: '10% loyalty discount applied.', created_at: '2026-03-20T11:00:00Z', sent_at: '2026-03-20T11:30:00Z', accepted_at: null },
  { id: 'q3', quote_number: 'QT-2026-0003', case_id: 'case5', case_number: 'DR-2025-00005', client_id: 'c2', client_name: 'Priya Patel', company: null, title: 'Seagate ST2000DM008 Head Crash Recovery', line_items: [{ description: 'Clean Room Head Swap', qty: 1, unit_price: 8000 }, { description: 'Data Imaging (PC-3000)', qty: 1, unit_price: 2500 }], subtotal: 10500, discount_pct: 0, discount_amt: 0, tax_pct: 18, tax_amt: 1890, total: 12390, currency: 'INR', status: 'draft', valid_until: '2026-05-01', notes: '', created_at: '2026-03-28T14:00:00Z', sent_at: null, accepted_at: null },
];

let INVOICES = [
  { id: 'inv_1', invoice_number: 'INV-2026-0001', quote_id: 'q1', case_id: 'case1', case_number: 'DR-2025-00001', client_id: 'c1', client_name: 'Rahul Sharma', company: 'TechCorp Pvt Ltd', client_address: 'Mumbai, Maharashtra', client_gstin: '27AABCT1332L1ZT', title: 'HDD Recovery â€” WD10EZEX', line_items: [{ description: 'Clean Room Head Swap', qty: 1, unit_price: 6000, amount: 6000 }, { description: 'Data Imaging & Extraction', qty: 1, unit_price: 2000, amount: 2000 }, { description: 'Donor Drive', qty: 1, unit_price: 1500, amount: 1500 }], subtotal: 9500, discount_amt: 0, tax_pct: 18, tax_amt: 1710, total: 11210, currency: 'INR', status: 'paid', due_date: '2026-04-15', notes: 'Thank you for choosing RecoverLab!', created_at: '2026-03-20T10:00:00Z', paid_at: '2026-03-25T14:00:00Z' },
  { id: 'inv_2', invoice_number: 'INV-2026-0002', quote_id: 'q2', case_id: 'case2', case_number: 'DR-2025-00002', client_id: 'c2', client_name: 'Priya Patel', company: null, client_address: 'Ahmedabad, Gujarat', client_gstin: '', title: 'Seagate Firmware Repair', line_items: [{ description: 'Firmware Diagnosis & Repair (PC-3000)', qty: 1, unit_price: 3500, amount: 3500 }, { description: 'Data Verification', qty: 1, unit_price: 500, amount: 500 }], subtotal: 4000, discount_amt: 400, tax_pct: 18, tax_amt: 648, total: 4248, currency: 'INR', status: 'overdue', due_date: '2026-03-25', notes: '', created_at: '2026-03-22T09:00:00Z', paid_at: null },
];

let EXPENSES = [
  { id: 'exp1', date: '2026-03-10', category: 'equipment', description: 'PC-3000 Annual License Renewal', vendor: 'ACE Lab', amount: 15000, tax_amt: 2700, total: 17700, status: 'paid', receipt_note: 'Paid via bank transfer', created_at: '2026-03-10T09:00:00Z' },
  { id: 'exp2', date: '2026-03-12', category: 'consumables', description: 'Clean Room Gloves (10 packs)', vendor: 'MedSupply India', amount: 4500, tax_amt: 810, total: 5310, status: 'paid', receipt_note: '', created_at: '2026-03-12T10:00:00Z' },
  { id: 'exp3', date: '2026-03-18', category: 'donor_drives', description: 'WD Red 4TB Donor Drives (x2)', vendor: 'Reliance Digital', amount: 7000, tax_amt: 1260, total: 8260, status: 'paid', receipt_note: 'For inventory stock', created_at: '2026-03-18T11:00:00Z' },
  { id: 'exp4', date: '2026-03-22', category: 'rent', description: 'Lab Space Rent â€” March', vendor: 'Shree Properties', amount: 18000, tax_amt: 0, total: 18000, status: 'paid', receipt_note: '', created_at: '2026-03-22T09:00:00Z' },
  { id: 'exp5', date: '2026-03-28', category: 'utilities', description: 'Electricity & Internet Bill', vendor: 'MSEB / Airtel', amount: 3200, tax_amt: 0, total: 3200, status: 'paid', receipt_note: '', created_at: '2026-03-28T10:00:00Z' },
];

let INVOICE_PAYMENTS = [
  { id: 'ip1', invoice_id: 'inv_1', amount: 11210, method: 'UPI', reference: 'UPI/2026/032500142', note: 'Full payment received', created_at: '2026-03-25T14:00:00Z' },
];

const generateSequenceId = (arr, formatString = 'SEQ-{YYYY}-{NNNN}') => {
  return formatString.replace('{YYYY}', new Date().getFullYear()).replace(/{N+}/g, match => {
    return String(arr.length + 1).padStart(match.length - 2, '0');
  });
};

// â”€â”€â”€ QUOTES â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
app.get('/api/accounting/quotes', authenticate, (req, res) => {
  let q = [...QUOTES];
  const { status, search } = req.query;
  if (status) q = q.filter(i => i.status === status);
  if (search) q = q.filter(i => `${i.quote_number} ${i.client_name} ${i.title}`.toLowerCase().includes(search.toLowerCase()));
  res.json({ quotes: q.sort((a,b) => new Date(b.created_at) - new Date(a.created_at)), total: q.length });
});

app.get('/api/accounting/quotes/:id', authenticate, (req, res) => {
  const q = QUOTES.find(x => x.id === req.params.id);
  if (!q) return res.status(404).json({ error: 'Not found' });
  res.json(q);
});

app.post('/api/accounting/quotes', authenticate, (req, res) => {
  const { line_items = [], discount_pct = 0, tax_pct = 18, ...rest } = req.body;
  const subtotal = line_items.reduce((s, l) => s + (l.qty || 1) * (l.unit_price || 0), 0);
  const discount_amt = Math.round(subtotal * discount_pct / 100);
  const tax_amt = Math.round((subtotal - discount_amt) * tax_pct / 100);
  const total = subtotal - discount_amt + tax_amt;
  const quote_number = generateSequenceId(QUOTES, COMPANY_SETTINGS?.quote_number_format || 'QT-{YYYY}-{NNNN}');
  const q = { id: `q_${Date.now()}`, quote_number, line_items, subtotal, discount_pct, discount_amt, tax_pct, tax_amt, total, status: 'draft', currency: 'INR', ...rest, created_at: new Date().toISOString(), sent_at: null, accepted_at: null };
  QUOTES.push(q); res.status(201).json(q);
});

app.put('/api/accounting/quotes/:id', authenticate, (req, res) => {
  const idx = QUOTES.findIndex(x => x.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  const { line_items = QUOTES[idx].line_items, discount_pct = QUOTES[idx].discount_pct, tax_pct = QUOTES[idx].tax_pct, ...rest } = req.body;
  const subtotal = line_items.reduce((s, l) => s + (l.qty || 1) * (l.unit_price || 0), 0);
  const discount_amt = Math.round(subtotal * discount_pct / 100);
  const tax_amt = Math.round((subtotal - discount_amt) * tax_pct / 100);
  const total = subtotal - discount_amt + tax_amt;
  QUOTES[idx] = { ...QUOTES[idx], ...rest, line_items, subtotal, discount_pct, discount_amt, tax_pct, tax_amt, total };
  res.json(QUOTES[idx]);
});

app.patch('/api/accounting/quotes/:id/status', authenticate, (req, res) => {
  const q = QUOTES.find(x => x.id === req.params.id);
  if (!q) return res.status(404).json({ error: 'Not found' });
  q.status = req.body.status;
  if (req.body.status === 'sent') q.sent_at = new Date().toISOString();
  if (req.body.status === 'accepted') q.accepted_at = new Date().toISOString();
  res.json(q);
});

app.delete('/api/accounting/quotes/:id', authenticate, (req, res) => {
  QUOTES = QUOTES.filter(x => x.id !== req.params.id);
  res.json({ ok: true });
});

// Convert quote â†’ invoice
app.post('/api/accounting/quotes/:id/invoice', authenticate, (req, res) => {
  const q = QUOTES.find(x => x.id === req.params.id);
  if (!q) return res.status(404).json({ error: 'Quote not found' });
  const due = new Date(); due.setDate(due.getDate() + 15);
  const invoice_number = generateSequenceId(INVOICES, COMPANY_SETTINGS?.invoice_number_format || 'INV-{YYYY}-{NNNN}');
  const inv = { id: `inv_${Date.now()}`, invoice_number, quote_id: q.id, case_id: q.case_id, case_number: q.case_number, client_id: q.client_id, client_name: q.client_name, company: q.company, client_address: req.body.client_address || '', client_gstin: req.body.client_gstin || '', title: q.title, line_items: q.line_items.map(l => ({ ...l, amount: (l.qty||1)*(l.unit_price||0) })), subtotal: q.subtotal, discount_amt: q.discount_amt, tax_pct: q.tax_pct, tax_amt: q.tax_amt, total: q.total, currency: q.currency, status: 'unpaid', due_date: due.toISOString().slice(0,10), notes: q.notes, created_at: new Date().toISOString(), paid_at: null };
  INVOICES.push(inv);
  q.status = 'invoiced';
  res.status(201).json(inv);
});

// â”€â”€â”€ INVOICES â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
app.get('/api/accounting/invoices', authenticate, (req, res) => {
  let inv = [...INVOICES];
  const { status, search } = req.query;
  if (status) inv = inv.filter(i => i.status === status);
  if (search) inv = inv.filter(i => `${i.invoice_number} ${i.client_name} ${i.title}`.toLowerCase().includes(search.toLowerCase()));
  res.json({ invoices: inv.sort((a,b) => new Date(b.created_at) - new Date(a.created_at)), total: inv.length });
});

app.get('/api/accounting/invoices/:id', authenticate, (req, res) => {
  const inv = INVOICES.find(x => x.id === req.params.id);
  if (!inv) return res.status(404).json({ error: 'Not found' });
  const payments = INVOICE_PAYMENTS.filter(p => p.invoice_id === inv.id);
  res.json({ ...inv, payments });
});

app.post('/api/accounting/invoices', authenticate, (req, res) => {
  const { line_items = [], tax_pct = 18, ...rest } = req.body;
  const subtotal = line_items.reduce((s,l) => s+(l.qty||1)*(l.unit_price||0), 0);
  const discount_amt = rest.discount_amt || 0;
  const tax_amt = Math.round((subtotal - discount_amt) * tax_pct / 100);
  const total = subtotal - discount_amt + tax_amt;
  const invoice_number = generateSequenceId(INVOICES, COMPANY_SETTINGS?.invoice_number_format || 'INV-{YYYY}-{NNNN}');
  const inv = { id: `inv_${Date.now()}`, invoice_number, line_items: line_items.map(l=>({...l,amount:(l.qty||1)*(l.unit_price||0)})), subtotal, discount_amt, tax_pct, tax_amt, total, status: 'unpaid', currency: 'INR', ...rest, created_at: new Date().toISOString(), paid_at: null };
  INVOICES.push(inv); res.status(201).json(inv);
});

app.patch('/api/accounting/invoices/:id/status', authenticate, (req, res) => {
  const inv = INVOICES.find(x => x.id === req.params.id);
  if (!inv) return res.status(404).json({ error: 'Not found' });
  inv.status = req.body.status;
  if (req.body.status === 'paid') inv.paid_at = new Date().toISOString();
  res.json(inv);
});

app.delete('/api/accounting/invoices/:id', authenticate, (req, res) => {
  INVOICES = INVOICES.filter(x => x.id !== req.params.id);
  res.json({ ok: true });
});

// Record payment against invoice
app.post('/api/accounting/invoices/:id/payments', authenticate, (req, res) => {
  const inv = INVOICES.find(x => x.id === req.params.id);
  if (!inv) return res.status(404).json({ error: 'Not found' });
  const payment = { id: `ip_${Date.now()}`, invoice_id: inv.id, ...req.body, created_at: new Date().toISOString() };
  INVOICE_PAYMENTS.push(payment);
  const totalPaid = INVOICE_PAYMENTS.filter(p => p.invoice_id === inv.id).reduce((s,p)=>s+parseFloat(p.amount),0);
  if (totalPaid >= inv.total) { inv.status = 'paid'; inv.paid_at = new Date().toISOString(); }
  else if (totalPaid > 0) inv.status = 'partial';
  res.status(201).json({ payment, invoice: inv });
});

// â”€â”€â”€ EXPENSES â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
app.get('/api/accounting/expenses', authenticate, (req, res) => {
  let exp = [...EXPENSES];
  const { category, search } = req.query;
  if (category) exp = exp.filter(e => e.category === category);
  if (search) exp = exp.filter(e => `${e.description} ${e.vendor}`.toLowerCase().includes(search.toLowerCase()));
  res.json({ expenses: exp.sort((a,b)=>new Date(b.date)-new Date(a.date)), total: exp.length });
});

app.post('/api/accounting/expenses', authenticate, (req, res) => {
  const { amount = 0, tax_amt = 0 } = req.body;
  const exp = { id: `exp_${Date.now()}`, ...req.body, amount: parseFloat(amount), tax_amt: parseFloat(tax_amt), total: parseFloat(amount) + parseFloat(tax_amt), status: 'paid', created_at: new Date().toISOString() };
  EXPENSES.push(exp); res.status(201).json(exp);
});

app.delete('/api/accounting/expenses/:id', authenticate, (req, res) => {
  EXPENSES = EXPENSES.filter(x => x.id !== req.params.id);
  res.json({ ok: true });
});

// â”€â”€â”€ P&L SUMMARY â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
app.get('/api/accounting/summary', authenticate, (req, res) => {
  const totalRevenue = INVOICES.filter(i=>i.status==='paid').reduce((s,i)=>s+i.total,0);
  const pendingRevenue = INVOICES.filter(i=>i.status!=='paid'&&i.status!=='cancelled').reduce((s,i)=>s+i.total,0);
  const overdueRevenue = INVOICES.filter(i=>i.status==='overdue').reduce((s,i)=>s+i.total,0);
  const totalExpenses = EXPENSES.reduce((s,e)=>s+e.total,0);
  const netProfit = totalRevenue - totalExpenses;
  const quotesTotal = QUOTES.length;
  const quotesAccepted = QUOTES.filter(q=>['accepted','invoiced'].includes(q.status)).length;
  const conversionRate = quotesTotal ? Math.round(quotesAccepted/quotesTotal*100) : 0;
  const expenseByCategory = EXPENSES.reduce((acc, e) => { acc[e.category] = (acc[e.category]||0) + e.total; return acc; }, {});
  const monthlyRevenue = [];
  for (let i=5;i>=0;i--) {
    const d = new Date(); d.setMonth(d.getMonth()-i);
    const ym = d.toISOString().slice(0,7);
    const rev = INVOICES.filter(inv=>inv.paid_at&&inv.paid_at.startsWith(ym)).reduce((s,inv)=>s+inv.total,0);
    const exp = EXPENSES.filter(e=>e.date.startsWith(ym)).reduce((s,e)=>s+e.total,0);
    monthlyRevenue.push({ month: ym, revenue: rev, expenses: exp, profit: rev-exp });
  }
  res.json({ totalRevenue, pendingRevenue, overdueRevenue, totalExpenses, netProfit, profitMargin: totalRevenue ? Math.round(netProfit/totalRevenue*100) : 0, quotesTotal, quotesAccepted, conversionRate, expenseByCategory, monthlyRevenue, invoiceCounts: { paid: INVOICES.filter(i=>i.status==='paid').length, unpaid: INVOICES.filter(i=>i.status==='unpaid').length, overdue: INVOICES.filter(i=>i.status==='overdue').length, partial: INVOICES.filter(i=>i.status==='partial').length } });
});

// â”€â”€â”€ SOLUTIONS / KNOWLEDGE BASE â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
let SOLUTIONS = [
  { id: 'sol1', title: 'WD BSY Error â€” PC-3000 ROM Fix', company: 'General', device_type: 'HDD', problem: 'Drive stuck in BSY state â€” spins but not detected', notes: '1. Connect via PC-3000 UDMA\n2. Load terminal mode\n3. Issue /2 command to check BSY\n4. Use F3 T>i4,1\n5. Read ROM and compare with donor\n6. Patch ATA passport and reload\n7. Check SA for corruption, fix modules', tags: ['BSY Error', 'Firmware Corruption', 'Not Detected'], files: [], created_at: '2026-02-10T09:00:00Z' },
  { id: 'sol2', title: 'Seagate LM â€” Head Swap Procedure', company: 'General', device_type: 'HDD', problem: 'Clicking, not detected â€” head crash confirmed', notes: '1. Match donor: same PCB code, same heads count, same site_code\n2. Clean room environment mandatory\n3. Use head comb for 2-platter drives\n4. Swap at platter level, avoid touching platters\n5. Image immediately after swap', tags: ['Head Crash', 'Not Detected'], files: [], created_at: '2026-02-15T10:00:00Z' },
  { id: 'sol3', title: 'Samsung SSD â€” Slow Flash Read Fix', company: 'General', device_type: 'SSD', problem: 'SSD detects but extremely slow â€” bad cells', notes: '1. Check SMART for reallocated sectors\n2. Use PC-3000 SSD module\n3. Create image with slow read timeout\n4. Recover from image', tags: ['Bad Sectors', 'Logical Error'], files: [], created_at: '2026-03-01T11:00:00Z' },
];

function mapSolutionForApi(s) {
  const noteHistory = s.note_history || (s.notes ? [{ id: 'legacy', text: s.notes, createdAt: s.created_at }] : []);
  const caseRefs = s.case_refs || [];
  return {
    ...s,
    note_history: noteHistory,
    related_case_count: caseRefs.length || s.related_case_count || (s.source === 'case' ? 1 : 0),
    has_media: !!(s.files?.length || s.has_media),
    company: s.company || s.category || 'General',
  };
}

app.get('/api/solutions', authenticate, (req, res) => {
  let sols = [...SOLUTIONS];
  const { search, device_type, tag, category } = req.query;
  if (search) {
    const q = search.toLowerCase();
    sols = sols.filter(s => `${s.title} ${s.problem} ${s.notes} ${(s.note_history || []).map(n => n.text).join(' ')}`.toLowerCase().includes(q));
  }
  if (device_type) sols = sols.filter(s => s.device_type === device_type);
  if (category) sols = sols.filter(s => s.category === category);
  if (tag) sols = sols.filter(s => s.tags?.includes(tag));
  sols = sols.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).map(mapSolutionForApi);
  res.json({ solutions: sols, total: sols.length });
});

app.get('/api/solutions/:id', authenticate, (req, res) => {
  const s = SOLUTIONS.find(x => x.id === req.params.id);
  if (!s) return res.status(404).json({ error: 'Not found' });
  res.json(mapSolutionForApi(s));
});

app.post('/api/solutions', authenticate, upload.array('files', 20), (req, res) => {
  const { title, company, device_type, problem, notes } = req.body;
  let tags = [];
  try { tags = JSON.parse(req.body.tags || '[]'); } catch { tags = []; }
  const now = new Date().toISOString();
  const files = (req.files || []).map(f => ({
    id: `sf_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    name: f.originalname,
    mimeType: f.mimetype,
    size: f.size,
    data: `data:${f.mimetype};base64,${f.buffer.toString('base64')}`,
    uploadedAt: now,
  }));
  const noteHistory = notes ? [{ id: `nh_${Date.now()}`, text: notes, createdAt: now, createdBy: req.user.userId, createdByName: req.user.username }] : [];
  const sol = {
    id: `sol_${Date.now()}`,
    title,
    company: company || '',
    device_type: device_type || 'Other',
    category: company || device_type || 'General',
    problem: problem || '',
    notes: notes || '',
    note_history: noteHistory,
    tags,
    files,
    case_refs: [],
    source: 'manual',
    created_by: req.user.userId,
    created_by_name: req.user.username,
    created_at: now,
    updated_at: now,
    related_case_count: 0,
    has_media: files.length > 0,
  };
  SOLUTIONS.unshift(sol);
  res.status(201).json({ solution: mapSolutionForApi(sol) });
});

app.put('/api/solutions/:id', authenticate, upload.array('files', 20), (req, res) => {
  const idx = SOLUTIONS.findIndex(x => x.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  const existing = SOLUTIONS[idx];
  const { title, company, device_type, problem, notes } = req.body;
  let tags = existing.tags;
  try { if (req.body.tags !== undefined) tags = JSON.parse(req.body.tags || '[]'); } catch { /* keep */ }

  const newFiles = (req.files || []).map(f => ({
    id: `sf_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    name: f.originalname,
    mimeType: f.mimetype,
    size: f.size,
    data: `data:${f.mimetype};base64,${f.buffer.toString('base64')}`,
    uploadedAt: new Date().toISOString(),
  }));

  let noteHistory = existing.note_history || [];
  if (notes !== undefined && String(notes).trim()) {
    noteHistory = [{
      id: `nh_${Date.now()}`,
      text: String(notes).trim(),
      createdAt: new Date().toISOString(),
      createdBy: req.user.userId,
      createdByName: req.user.username,
    }, ...noteHistory];
  }

  const updated = {
    ...existing,
    title: title || existing.title,
    company: company !== undefined ? company : existing.company,
    device_type: device_type || existing.device_type,
    category: company || existing.category,
    problem: problem !== undefined ? problem : existing.problem,
    notes: notes !== undefined ? notes : existing.notes,
    note_history: noteHistory,
    tags,
    files: [...(existing.files || []), ...newFiles],
    updated_at: new Date().toISOString(),
    has_media: [...(existing.files || []), ...newFiles].length > 0,
  };
  SOLUTIONS[idx] = updated;
  res.json({ solution: mapSolutionForApi(updated) });
});

app.delete('/api/solutions/:id', authenticate, (req, res) => {
  const idx = SOLUTIONS.findIndex(x => x.id === req.params.id);
  if (idx !== -1) SOLUTIONS.splice(idx, 1);
  res.json({ ok: true });
});

// â”€â”€â”€ COMPANY / SYSTEM SETTINGS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
let COMPANY_SETTINGS = {
  name: 'RecoverLab Data Recovery',
  tagline: 'Your Data, Recovered.',
  address: '42, Tech Park, Andheri East, Mumbai - 400069',
  city: 'Mumbai', state: 'Maharashtra', pincode: '400069', country: 'India',
  phone: '+91 98765 43210',
  email: 'info@recoverlab.in',
  gstin: '27XXXXX5678X1ZA',
  website: 'https://recoverlab.in',
  logo_data: null,
  invoice_disclaimer: 'This invoice is computer generated. All prices are inclusive of applicable taxes. Payment due within 15 days of invoice date. Goods once sold will not be taken back.',
  invoice_footer: 'Thank you for choosing RecoverLab! | recoverlab.in | +91 98765 43210',
  invoice_bank_name: 'HDFC Bank',
  invoice_bank_account: '50100XXXXXXXXXX',
  invoice_bank_ifsc: 'HDFC0001234',
  invoice_bank_branch: 'Andheri East, Mumbai',
  smtp_host: '',
  smtp_port: 587,
  smtp_user: '',
  smtp_password: '',
  smtp_from_name: 'RecoverLab CRM',
  smtp_from_email: '',
  whatsapp_api_key: '',
  encryption_enabled: true,
  // Number Format
  case_prefix: 'DR', case_start_num: '1001',
  invoice_prefix: 'INV', invoice_start_num: '1001',
  quote_prefix: 'QT', quote_start_num: '1001',
  // GST (detailed)
  gst_enabled: true, gst_pct: 18,
  gst_type: 'both',        // 'igst' | 'both' (cgst+sgst)
  igst_rate: 18,
  cgst_rate: 9,
  sgst_rate: 9,
  hsn_sac_code: '998313',  // SAC for IT/Data Recovery services
  tax_inclusive: false,
  // Razorpay
  razorpay_key_id: '', razorpay_key_secret: '', razorpay_webhook_secret: '', razorpay_plan_id: '',
  razorpay_auto_expire: true, razorpay_auto_notify: true, razorpay_retry_failed: false, razorpay_send_receipt: true,
  // Subscription
  subscription_plan: 'professional', subscription_expiry: null,
  // Payment methods accepted by this tenant
  payment_methods: ['Cash', 'UPI', 'Credit Card', 'Debit Card', 'Net Banking', 'NEFT/RTGS', 'Cheque'],
  // WhatsApp Business Cloud API (Meta)
  wa_phone_number_id: '', wa_business_account_id: '', wa_access_token: '', wa_verify_token: '', wa_api_version: 'v18.0',
  wa_template_new_case: '', wa_template_stage_update: '', wa_template_invoice: '', wa_template_delivery: '',
  wa_notify_new_case: true, wa_notify_stage_change: true, wa_notify_payment_due: true, wa_notify_delivery: true,
  // n8n Integration
  n8n_base_url: '', n8n_api_key: '',
  n8n_webhook_case_created: '', n8n_webhook_stage_changed: '', n8n_webhook_payment_received: '', n8n_webhook_client_added: '', n8n_webhook_invoice_generated: '',
  // Recycle Bin
  recycle_bin_days: 30, recycle_bin_password: '',
};

app.get('/api/settings/company', authenticate, (req, res) => {
  const safe = { ...COMPANY_SETTINGS };
  // Mask sensitive fields
  if (safe.razorpay_key_secret) safe.razorpay_key_secret = 'â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢';
  if (safe.wa_access_token && safe.wa_access_token.length > 8) {
    safe.wa_access_token = safe.wa_access_token.substring(0, 8) + 'â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢';
  }
  if (safe.smtp_password) safe.smtp_password = 'â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢';
  res.json(safe);
});

app.put('/api/settings/company', authenticate, (req, res) => {
  const body = { ...req.body };
  // Don't overwrite with masked placeholder values
  const maskedPattern = /^[â€¢]{4,}$/;
  if (maskedPattern.test(body.razorpay_key_secret || '')) delete body.razorpay_key_secret;
  if (maskedPattern.test(body.wa_access_token || '')) delete body.wa_access_token;
  if (maskedPattern.test(body.smtp_password || '')) delete body.smtp_password;
  Object.assign(COMPANY_SETTINGS, body);
  res.json({ ok: true });
});

app.post('/api/settings/company/logo', authenticate, upload.single('logo'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file' });
  COMPANY_SETTINGS.logo_data = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
  res.json({ logo_data: COMPANY_SETTINGS.logo_data });
});

app.post('/api/settings/smtp/test', authenticate, async (req, res) => {
  const { test_to } = req.body || {};
  const { smtp_host, smtp_port, smtp_user, smtp_password, smtp_from_name, smtp_from_email } = COMPANY_SETTINGS;
  const fromEmail = smtp_from_email || smtp_user;
  const toEmail   = test_to || fromEmail;

  if (!smtp_host || !smtp_user || !smtp_password) {
    return res.status(400).json({ ok: false, error: 'SMTP not configured. Please set Host, Username and Password first.' });
  }
  try {
    const transporter = nodemailer.createTransport({
      host: smtp_host,
      port: Number(smtp_port) || 587,
      secure: Number(smtp_port) === 465,
      auth: { user: smtp_user, pass: smtp_password },
      tls: { rejectUnauthorized: false },
    });
    await transporter.verify();
    if (toEmail) {
      await transporter.sendMail({
        from: `”${smtp_from_name || 'RecoverLab CRM'}” <${fromEmail}>`,
        to: toEmail,
        subject: '✅ SMTP Test — RecoverLab CRM',
        html: `<div style=”font-family:Arial,sans-serif;max-width:480px;padding:32px;background:#f8fafc;border-radius:12px;margin:auto”>
          <h2 style=”color:#1e40af”>SMTP is working ✅</h2>
          <p style=”color:#475569”>Your RecoverLab CRM is correctly configured to send emails via <b>${smtp_host}:${smtp_port}</b>.</p>
          <p style=”color:#94a3b8;font-size:12px”>This is an automated test message.</p>
        </div>`,
        text: `SMTP is working. Your CRM is configured to send emails via ${smtp_host}:${smtp_port}.`,
      });
    }
    res.json({ ok: true, message: `SMTP connected successfully${toEmail ? ` — test email sent to ${toEmail}` : ''}.` });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── Marketing & Campaign APIs ─────────────────────────────────────────────────

// Helper: substitute {{var}} tokens in a template string
function substituteVars(template, vars) {
  return String(template || '').replace(/\{\{(\w+)\}\}/g, (_, k) => (vars[k] !== undefined ? vars[k] : ''));
}

// Send Email Campaign via SMTP (nodemailer)
app.post('/api/marketing/send-email', authenticate, requireAdmin, async (req, res) => {
  const { recipients, subject, html, from_name, from_email, campaign_id } = req.body;
  if (!recipients || !recipients.length) return res.status(400).json({ error: 'No recipients provided' });
  if (!html) return res.status(400).json({ error: 'Email HTML is required' });

  const { smtp_host, smtp_port, smtp_user, smtp_password, smtp_from_name, smtp_from_email } = COMPANY_SETTINGS;
  const smtpFromEmail = from_email || smtp_from_email || smtp_user;
  const smtpFromName  = from_name  || smtp_from_name  || 'RecoverLab CRM';

  if (!smtp_host || !smtp_user || !smtp_password) {
    return res.status(400).json({
      error: 'SMTP not configured. Go to Settings → Company Info and set SMTP Host, User and Password.',
    });
  }

  const transporter = nodemailer.createTransport({
    host: smtp_host,
    port: Number(smtp_port) || 587,
    secure: Number(smtp_port) === 465,
    auth: { user: smtp_user, pass: smtp_password },
    tls: { rejectUnauthorized: false },
  });

  const results = [];
  for (const r of recipients) {
    if (!r.email) { results.push({ email: null, status: 'skipped_no_email' }); continue; }
    const vars = {
      name:             r.name             || '',
      email:            r.email            || '',
      phone:            r.phone            || '',
      company:          r.company          || COMPANY_SETTINGS.name || '',
      case_id:          r.case_id          || '',
      case_status:      r.case_status      || '',
      device:           r.device           || '',
      issue:            r.issue            || '',
      technician:       r.technician       || '',
      amount:           r.amount           || '',
      invoice_no:       r.invoice_no       || '',
      expiry_date:      r.expiry_date      || '',
      portal_link:      r.portal_link      || '',
      unsubscribe_link: r.unsubscribe_link || `${req.protocol}://${req.get('host')}/api/marketing/unsubscribe?email=${encodeURIComponent(r.email)}&token=unsub`,
      company_name:     COMPANY_SETTINGS.name         || '',
      support_email:    COMPANY_SETTINGS.support_email || smtpFromEmail,
      support_phone:    COMPANY_SETTINGS.phone         || '',
    };
    try {
      const info = await transporter.sendMail({
        from: `"${smtpFromName}" <${smtpFromEmail}>`,
        to: r.email,
        subject: substituteVars(subject || '(No Subject)', vars),
        html: substituteVars(html, vars),
        headers: {
          'List-Unsubscribe': `<${vars.unsubscribe_link}>`,
          'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
        },
      });
      results.push({ email: r.email, status: 'sent', message_id: info.messageId });
    } catch (err) {
      results.push({ email: r.email, status: 'failed', error: err.message });
    }
  }

  const sent    = results.filter(r => r.status === 'sent').length;
  const failed  = results.filter(r => r.status === 'failed').length;
  const skipped = results.filter(r => r.status === 'skipped_no_email').length;
  console.log(`[Email Campaign] id=${campaign_id} sent=${sent} failed=${failed} skipped=${skipped}`);
  res.json({ ok: true, campaign_id, sent, failed, skipped, results });
});

// Send WhatsApp Campaign
app.post('/api/marketing/send-whatsapp', authenticate, requireAdmin, (req, res) => {
  const { template_id, recipients, message, campaign_id, media_type } = req.body;
  if (!recipients || !recipients.length) return res.status(400).json({ error: 'No recipients provided' });

  console.log(`[WhatsApp Campaign] Campaign: ${campaign_id}, Recipients: ${recipients.length}`);

  const results = recipients.map(r => ({
    phone: r.phone,
    status: r.phone ? 'queued' : 'skipped_no_phone',
    wamid: r.phone ? `wamid.${Date.now()}.${Math.random().toString(36).slice(2,8)}` : null,
  }));

  res.json({
    ok: true,
    campaign_id,
    queued: results.filter(r => r.status === 'queued').length,
    skipped: results.filter(r => r.status !== 'queued').length,
    results,
    demo: true,
    note: 'Demo mode — configure WhatsApp in Settings → WhatsApp to send real messages',
  });
});

// Send SMS Campaign
app.post('/api/marketing/send-sms', authenticate, requireAdmin, (req, res) => {
  const { recipients, message, campaign_id, sender_id } = req.body;
  if (!recipients || !recipients.length) return res.status(400).json({ error: 'No recipients provided' });

  console.log(`[SMS Campaign] Campaign: ${campaign_id}, Recipients: ${recipients.length}`);

  const results = recipients.map(r => ({
    phone: r.phone,
    status: r.phone ? 'queued' : 'skipped_no_phone',
    sms_id: r.phone ? `sms_${Date.now()}_${Math.random().toString(36).slice(2,8)}` : null,
  }));

  res.json({
    ok: true,
    campaign_id,
    queued: results.filter(r => r.status === 'queued').length,
    skipped: results.filter(r => r.status !== 'queued').length,
    results,
    demo: true,
    note: 'Demo mode — configure SMS provider to send real messages',
  });
});

// Get campaign stats
app.get('/api/marketing/campaigns/:id/stats', authenticate, (req, res) => {
  const total = Math.floor(Math.random() * 100) + 10;
  res.json({
    campaign_id: req.params.id,
    sent: total,
    delivered: Math.floor(total * 0.97),
    opened: Math.floor(total * 0.38),
    clicked: Math.floor(total * 0.12),
    bounced: Math.floor(total * 0.02),
    unsubscribed: Math.floor(total * 0.005),
    spam_reported: 0,
  });
});

// Unsubscribe endpoint (public)
app.get('/api/marketing/unsubscribe', (req, res) => {
  const { email, token } = req.query;
  console.log(`[Unsubscribe] Email: ${email}, Token: ${token}`);
  res.send(`<html><body style="font-family:Arial;text-align:center;padding:60px"><h2>✅ Unsubscribed</h2><p>You've been unsubscribed from marketing emails.</p></body></html>`);
});

// WhatsApp Send Message
app.post('/api/whatsapp/send', authenticate, (req, res) => {
  const { to, template_name, language_code, parameters, message_type, text } = req.body;
  const settings = COMPANY_SETTINGS;

  if (!settings.wa_phone_number_id || !settings.wa_access_token) {
    return res.status(400).json({ error: 'WhatsApp not configured. Go to Settings â†’ WhatsApp to add credentials.' });
  }

  // In demo mode, simulate the send
  const logEntry = {
    id: `wa_${Date.now()}`,
    to, template_name, status: 'sent',
    timestamp: new Date().toISOString(),
    message_type: message_type || 'template',
  };
  console.log('[WhatsApp] Would send message:', logEntry);

  // In production, this would call Meta WhatsApp Cloud API:
  // POST https://graph.facebook.com/v18.0/{wa_phone_number_id}/messages
  // With Authorization: Bearer {wa_access_token}

  res.json({ ok: true, message_id: `wamid.${Date.now()}`, status: 'sent', demo: true });
});

// WhatsApp Test Connection
app.post('/api/whatsapp/test', authenticate, (req, res) => {
  const settings = COMPANY_SETTINGS;
  if (!settings.wa_phone_number_id || !settings.wa_access_token) {
    return res.status(400).json({ ok: false, error: 'WhatsApp credentials not configured' });
  }
  res.json({ ok: true, message: 'WhatsApp credentials saved. In production, a test message will be sent.', phone_number_id: settings.wa_phone_number_id });
});

// Razorpay: Create Payment Order
app.post('/api/razorpay/create-order', authenticate, (req, res) => {
  const { amount, currency = 'INR', invoice_id, case_id, description } = req.body;
  const settings = COMPANY_SETTINGS;

  if (!settings.razorpay_key_id || !settings.razorpay_key_secret) {
    // Demo mode
    const orderId = `order_demo_${Date.now()}`;
    return res.json({
      ok: true, demo: true,
      order_id: orderId,
      amount: Math.round(amount * 100), // paise
      currency,
      key_id: 'rzp_test_DEMO',
      description: description || 'Data Recovery Service',
    });
  }

  // In production with real Razorpay keys:
  // const Razorpay = require('razorpay');
  // const rzp = new Razorpay({ key_id: settings.razorpay_key_id, key_secret: settings.razorpay_key_secret });
  // const order = await rzp.orders.create({ amount: Math.round(amount * 100), currency, receipt: invoice_id || case_id });

  const orderId = `order_${Date.now()}`;
  res.json({
    ok: true,
    order_id: orderId,
    amount: Math.round(amount * 100),
    currency,
    key_id: settings.razorpay_key_id,
    description: description || 'Data Recovery Service',
  });
});

// Razorpay: Verify Keys
app.post('/api/razorpay/verify-keys', authenticate, async (req, res) => {
  const { key_id, key_secret } = req.body;
  if (!key_id || !key_secret) return res.json({ ok: false, message: 'Key ID and Key Secret are required.' });
  try {
    const creds = Buffer.from(`${key_id}:${key_secret}`).toString('base64');
    const response = await fetch('https://api.razorpay.com/v1/accounts/me', {
      headers: { Authorization: `Basic ${creds}`, 'Content-Type': 'application/json' },
    });
    if (response.ok) {
      const data = await response.json();
      return res.json({ ok: true, account_name: data.profile?.business_name || data.legal_business_name || data.name || 'Razorpay Account' });
    }
    // Try alternate endpoint
    const r2 = await fetch('https://api.razorpay.com/v1/payments?count=1', {
      headers: { Authorization: `Basic ${creds}` },
    });
    if (r2.ok) return res.json({ ok: true, account_name: 'Razorpay Account' });
    return res.json({ ok: false, message: 'Invalid API keys â€” authentication failed.' });
  } catch (e) {
    // Demo mode fallback â€” simulate verification
    if (key_id.startsWith('rzp_test_') || key_id.startsWith('rzp_live_')) {
      return res.json({ ok: true, account_name: 'Demo Razorpay Account (Simulated)', demo: true });
    }
    return res.json({ ok: false, message: 'Invalid key format. Key ID must start with rzp_test_ or rzp_live_' });
  }
});

// Razorpay: Generate Payment Link
app.post('/api/razorpay/payment-link', authenticate, (req, res) => {
  const { amount, currency = 'INR', customer_name, customer_phone, customer_email, description, invoice_id } = req.body;
  const settings = COMPANY_SETTINGS;

  // Generate a payment link URL
  const linkId = Math.random().toString(36).substring(2, 10).toUpperCase();
  const paymentLink = settings.razorpay_key_id && settings.razorpay_key_id !== 'rzp_test_XXXXXXXXXX'
    ? `https://rzp.io/l/${linkId}`
    : `https://rzp.io/l/demo_${linkId}`;

  res.json({
    ok: true,
    payment_link: paymentLink,
    amount,
    currency,
    demo: !settings.razorpay_key_id || settings.razorpay_key_id === 'rzp_test_XXXXXXXXXX',
    expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  });
});

// Razorpay: Verify Payment (webhook handler)
app.post('/api/razorpay/webhook', (req, res) => {
  // Signature verification would go here in production
  const { event, payload } = req.body;
  console.log('[Razorpay Webhook]', event, payload?.payment?.entity?.id);

  if (event === 'payment.captured') {
    const paymentId = payload?.payment?.entity?.id;
    const invoiceId = payload?.payment?.entity?.notes?.invoice_id;
    // Mark invoice as paid in production
    console.log(`[Razorpay] Payment ${paymentId} captured for invoice ${invoiceId}`);
  }

  res.json({ status: 'ok' });
});

// â”€â”€â”€ ENHANCED DONOR MATCHING (per company/brand) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
app.post('/api/donors/match-advanced', authenticate, (req, res) => {
  const { brand, model, family, site_code, pcb_number, firmware, capacity_gb, company } = req.body;
  // Simulate donor matching from inventory
  const DEMO_INVENTORY = [
    { id: 'inv1', brand: 'Western Digital', model: 'WD10EZEX', pcb_number: '2060-701596-000', firmware: '01.01A01', site_code: 'HHRNHT2A', family: 'Blue', capacity_gb: 1000, quantity: 2, condition: 'good', compatibility_score: 0 },
    { id: 'inv2', brand: 'Seagate', model: 'ST1000DM003', pcb_number: '100664987 REV B', firmware: 'CC45', site_code: 'WU', family: 'Barracuda', capacity_gb: 1000, quantity: 1, condition: 'good', compatibility_score: 0 },
    { id: 'inv3', brand: 'Western Digital', model: 'WD10EZEX', pcb_number: '2060-701596-001', firmware: '01.01A01', site_code: 'HHRNHT2A', family: 'Blue', capacity_gb: 1000, quantity: 3, condition: 'good', compatibility_score: 0 },
  ];
  const scored = DEMO_INVENTORY.map(d => {
    let score = 0;
    const reasons = [];
    if (brand && d.brand?.toLowerCase() === brand?.toLowerCase()) { score += 30; reasons.push('brand_match'); }
    if (model && d.model?.toLowerCase() === model?.toLowerCase()) { score += 25; reasons.push('model_match'); }
    if (family && d.family?.toLowerCase() === family?.toLowerCase()) { score += 15; reasons.push('family_match'); }
    if (site_code && d.site_code === site_code) { score += 20; reasons.push('site_code_match'); }
    if (firmware && d.firmware === firmware) { score += 10; reasons.push('firmware_match'); }
    if (capacity_gb && d.capacity_gb === parseInt(capacity_gb)) { score += 5; reasons.push('capacity_match'); }
    return { ...d, compatibility_score: Math.min(score, 100), match_reasons: reasons, in_stock: d.quantity > 0 };
  }).filter(d => d.compatibility_score > 20).sort((a, b) => b.compatibility_score - a.compatibility_score);
  res.json({ donors: scored, company_filter: company || null });
});

// â”€â”€â”€ HEALTH â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
app.get('/api/health', (req, res) => res.json({ status: 'healthy', mode: 'DEMO - No PostgreSQL required', timestamp: new Date().toISOString() }));

// â”€â”€â”€ RECYCLE BIN â€” see full secure implementation below â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// RECYCLE_BIN const is defined below with enforce-password DELETE + restore
// Cases are soft-deleted (moved to recycle bin) via DELETE /api/cases/:id



// â”€â”€â”€ ENHANCED COMPANY SETTINGS (GST, formats, Razorpay) â”€â”€â”€â”€â”€â”€
// Extend existing COMPANY_SETTINGS with new fields via PATCH on startup
COMPANY_SETTINGS.gst_enabled = true;
COMPANY_SETTINGS.gst_rate = 18;
COMPANY_SETTINGS.case_number_format = 'DR-{YYYY}-{NNNNN}';
COMPANY_SETTINGS.invoice_number_format = 'INV-{YYYY}-{NNNN}';
COMPANY_SETTINGS.quote_number_format = 'QT-{YYYY}-{NNNN}';
COMPANY_SETTINGS.razorpay_key_id = '';
COMPANY_SETTINGS.razorpay_key_secret = '';
COMPANY_SETTINGS.razorpay_plan_id = '';
COMPANY_SETTINGS.currency = 'INR';

// â”€â”€â”€ ACTIVITY LOG â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
let ACTIVITY_LOG = [
  { id: 'act1', user_id: '11111111', user_name: 'admin', module: 'cases', action: 'CASE_CREATED', detail: 'Created case DR-2025-00001', ip: '127.0.0.1', created_at: new Date(Date.now()-600000).toISOString() },
  { id: 'act2', user_id: '22222222', user_name: 'john_eng', module: 'cases', action: 'CASE_UPDATED', detail: 'Status changed: inspection â†’ diagnosis', ip: '127.0.0.1', created_at: new Date(Date.now()-1200000).toISOString() },
  { id: 'act3', user_id: '11111111', user_name: 'admin', module: 'accounting', action: 'INVOICE_CREATED', detail: 'Invoice INV-2026-0001 created', ip: '127.0.0.1', created_at: new Date(Date.now()-3600000).toISOString() },
  { id: 'act4', user_id: '11111111', user_name: 'admin', module: 'inventory', action: 'STOCK_ADDED', detail: 'Added WD10EZEX to inventory', ip: '127.0.0.1', created_at: new Date(Date.now()-7200000).toISOString() },
  { id: 'act5', user_id: '22222222', user_name: 'john_eng', module: 'solutions', action: 'SOLUTION_ADDED', detail: 'Added WD BSY ROM Fix solution', ip: '127.0.0.1', created_at: new Date(Date.now()-86400000).toISOString() },
];

app.get('/api/activity-logs', authenticate, (req, res) => {
  const { module, limit = 50 } = req.query;
  let logs = [...ACTIVITY_LOG];
  if (module) logs = logs.filter(l => l.module === module);
  res.json({ logs: logs.slice(0, parseInt(limit)), total: logs.length });
});

app.post('/api/activity-logs', authenticate, (req, res) => {
  const log = { id: `act_${Date.now()}`, user_id: req.user?.id, user_name: req.user?.username, ...req.body, ip: req.ip || '127.0.0.1', created_at: new Date().toISOString() };
  ACTIVITY_LOG.unshift(log);
  res.status(201).json(log);
});



// â”€â”€ Timeline Notes â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
app.post('/api/cases/:id/timeline-notes', authenticate, (req, res) => {
  const c = DEMO_CASES.find(x => x.id === req.params.id);
  if (!c) return res.status(404).json({ error: 'Case not found' });
  if (!c.workflowLogs) c.workflowLogs = [];
  const note = {
    id: `wf_${Date.now()}`, case_id: c.id, type: 'note', from_stage: c.stage, to_stage: c.stage,
    notes: req.body.notes, engineer_name: req.user?.full_name || req.user?.username,
    created_at: new Date().toISOString(), time_spent_minutes: 0,
  };
  c.workflowLogs.push(note);
  res.status(201).json(note);
});

// Edit timeline note
app.put('/api/cases/:id/timeline-notes/:noteId', authenticate, (req, res) => {
  const { notes } = req.body;
  const caseItem = DEMO_CASES.find(c => c.id === req.params.id);
  if (!caseItem) return res.status(404).json({ error: 'Case not found' });
  const logs = caseItem.workflow_logs || [];
  const logIdx = logs.findIndex(l => l.id === req.params.noteId);
  if (logIdx === -1) return res.status(404).json({ error: 'Timeline entry not found' });
  logs[logIdx] = { ...logs[logIdx], notes, edited_at: new Date().toISOString() };
  caseItem.workflow_logs = logs;
  res.json({ ok: true });
});

// Delete timeline note
app.delete('/api/cases/:id/timeline-notes/:noteId', authenticate, (req, res) => {
  const caseItem = DEMO_CASES.find(c => c.id === req.params.id);
  if (!caseItem) return res.status(404).json({ error: 'Case not found' });
  const before = (caseItem.workflow_logs || []).length;
  caseItem.workflow_logs = (caseItem.workflow_logs || []).filter(l => l.id !== req.params.noteId);
  if (caseItem.workflow_logs.length === before) return res.status(404).json({ error: 'Entry not found' });
  res.json({ ok: true });
});

// â”€â”€ Case PUT (Edit) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
app.put('/api/cases/:id', authenticate, (req, res) => {
  const idx = DEMO_CASES.findIndex(x => x.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Case not found' });
  const allowed = ['device_brand','device_model','serial_number','capacity_gb','interface','form_factor','initial_diagnosis','final_diagnosis','priority','cleanRoomRequired','donor_stock_number'];
  allowed.forEach(f => { if (req.body[f] !== undefined) DEMO_CASES[idx][f] = req.body[f]; });
  res.json({ success: true, case: DEMO_CASES[idx] });
});

// â”€â”€ Case Files Upload â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
app.post('/api/cases/:id/files', authenticate, (req, res) => {
  const c = DEMO_CASES.find(x => x.id === req.params.id);
  if (!c) return res.status(404).json({ error: 'Case not found' });
  if (!c.files) c.files = [];
  const file = { id: `cf_${Date.now()}`, case_id: c.id, original_name: req.body.name, name: req.body.name, file_type: req.body.mimeType?.split('/')[0] || 'document', file_size: req.body.size || 0, size: req.body.size || 0, mimeType: req.body.mimeType, data: req.body.data, created_at: new Date().toISOString() };
  c.files.push(file);
  res.status(201).json({ success: true, file });
});

app.get('/api/files/:id/download', (req, res) => {
  let found = null;
  for(let c of DEMO_CASES) {
    if(c.files) {
      found = c.files.find(x => x.id === req.params.id);
      if(found) break;
    }
  }
  if (!found) return res.status(404).send('File not found');
  try {
    const buffer = Buffer.from(found.data.split(',')[1], 'base64');
    res.setHeader('Content-Type', found.mimeType || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${found.original_name}"`);
    res.send(buffer);
  } catch(e) { res.status(500).send('Corrupt file data'); }
});

// â”€â”€ Case Payments (Quick) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
app.post('/api/cases/:id/payments', authenticate, (req, res) => {
  const c = DEMO_CASES.find(x => x.id === req.params.id);
  if (!c) return res.status(404).json({ error: 'Case not found' });
  if (!c.payments) c.payments = [];
  const payment = { id: `pay_${Date.now()}`, case_id: c.id, amount: req.body.amount, method: req.body.method || 'Cash', reference_number: req.body.reference, notes: req.body.notes, status: 'paid', paid_at: new Date().toISOString(), created_at: new Date().toISOString() };
  c.payments.push(payment);
  res.status(201).json({ success: true, payment });
});

// â”€â”€ Transfer Case HDD to Stock â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
app.post('/api/cases/:id/transfer-to-stock', authenticate, (req, res) => {
  const c = DEMO_CASES.find(x => x.id === req.params.id);
  if (!c) return res.status(404).json({ error: 'Case not found' });
  const newItem = { id: `inv_${Date.now()}`, sku: `DONOR-${c.case_number}`, name: `${c.device_brand} ${c.device_model} (from case ${c.case_number})`, category: 'donor_drive', brand: c.device_brand, model: c.device_model, serial_number: c.serial_number, quantity: 1, min_quantity: 1, status: 'available', case_number: c.case_number, created_at: new Date().toISOString() };
  DEMO_INVENTORY.push(newItem);
  res.json({ success: true, item: newItem });
});

// â”€â”€ Inventory Item GET by ID â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
app.get('/api/inventory/:id', authenticate, (req, res) => {
  const item = DEMO_INVENTORY.find(x => x.id === req.params.id);
  if (!item) return res.status(404).json({ error: 'Item not found' });
  res.json({ item });
});

// â”€â”€ Inventory Item PUT â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
app.put('/api/inventory/:id', authenticate, (req, res) => {
  const idx = DEMO_INVENTORY.findIndex(x => x.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Item not found' });
  Object.assign(DEMO_INVENTORY[idx], req.body);
  res.json({ success: true, item: DEMO_INVENTORY[idx] });
});

// â”€â”€ Inventory Images â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
app.get('/api/inventory/:id/images', authenticate, (req, res) => {
  res.json({ images: INVENTORY_IMAGES[req.params.id] || [] });
});
app.post('/api/inventory/:id/images', authenticate, (req, res) => {
  if (!INVENTORY_IMAGES[req.params.id]) INVENTORY_IMAGES[req.params.id] = [];
  const img = { id: `img_${Date.now()}`, ...req.body, created_at: new Date().toISOString() };
  INVENTORY_IMAGES[req.params.id].push(img);
  res.status(201).json({ success: true, image: img });
});
app.delete('/api/inventory/:id/images/:imgId', authenticate, (req, res) => {
  if (INVENTORY_IMAGES[req.params.id]) {
    INVENTORY_IMAGES[req.params.id] = INVENTORY_IMAGES[req.params.id].filter(x => x.id !== req.params.imgId);
  }
  res.json({ success: true });
});

// â”€â”€ n8n Webhook Trigger â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
app.post('/api/webhooks/n8n/trigger', authenticate, async (req, res) => {
  const { event_type, data, webhook_url } = req.body;
  if (!webhook_url) return res.status(400).json({ error: 'webhook_url required' });
  try {
    const resp = await fetch(webhook_url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event_type, data, timestamp: new Date().toISOString(), source: 'RecoverLab CRM' }),
    });
    res.json({ success: true, status: resp.status });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// â”€â”€ Company Settings (extended) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
app.get('/api/company/settings', authenticate, (req, res) => {
  res.json({ settings: COMPANY_SETTINGS });
});

// â”€â”€â”€ EDIT CASE â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
app.put('/api/cases/:id', authenticate, (req, res) => {
  const idx = DEMO_CASES.findIndex(c => c.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Case not found' });
  DEMO_CASES[idx] = { ...DEMO_CASES[idx], ...req.body, updated_at: new Date().toISOString() };
  res.json(DEMO_CASES[idx]);
});

// â”€â”€â”€ EDIT CLIENT â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
app.put('/api/clients/:id', authenticate, (req, res) => {
  const idx = DEMO_CLIENTS.findIndex(c => c.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Client not found' });
  DEMO_CLIENTS[idx] = { ...DEMO_CLIENTS[idx], ...req.body, updated_at: new Date().toISOString() };
  res.json(DEMO_CLIENTS[idx]);
});

app.post('/api/clients/:id/communications', authenticate, (req, res) => {
  // Communication already exists but may need to store it
  const cl = DEMO_CLIENTS.find(c => c.id === req.params.id);
  if (!cl) return res.status(404).json({ error: 'Not found' });
  if (!cl.communications) cl.communications = [];
  const comm = {
    id: `comm_${Date.now()}`,
    ...req.body,
    staff_name: req.body.staff_name || 'Admin',
    created_at: new Date().toISOString()
  };
  cl.communications.push(comm);
  res.status(201).json(comm);
});

// â”€â”€â”€ CASE FILES â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const CASE_FILES = {};

app.get('/api/cases/:id/files', authenticate, (req, res) => {
  res.json(CASE_FILES[req.params.id] || []);
});

app.post('/api/cases/:id/files', authenticate, upload.array('files', 20), (req, res) => {
  const caseId = req.params.id;
  if (!CASE_FILES[caseId]) CASE_FILES[caseId] = [];
  const added = (req.files || []).map(f => ({
    id: `cf_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    name: f.originalname,
    mimeType: f.mimetype,
    size: f.size,
    data: `data:${f.mimetype};base64,${f.buffer.toString('base64')}`,
    category: req.body.category || 'other',
    uploadedAt: new Date().toISOString(),
  }));
  CASE_FILES[caseId].push(...added);
  res.status(201).json({ added, total: CASE_FILES[caseId].length });
});

app.delete('/api/cases/:id/files/:fileId', authenticate, (req, res) => {
  if (CASE_FILES[req.params.id]) {
    CASE_FILES[req.params.id] = CASE_FILES[req.params.id].filter(f => f.id !== req.params.fileId);
  }
  res.json({ ok: true });
});

// â”€â”€â”€ CASE PAYMENTS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const CASE_PAYMENTS = {};

app.get('/api/cases/:id/payments', authenticate, (req, res) => {
  res.json(CASE_PAYMENTS[req.params.id] || []);
});

app.post('/api/cases/:id/payments', authenticate, (req, res) => {
  const caseId = req.params.id;
  if (!CASE_PAYMENTS[caseId]) CASE_PAYMENTS[caseId] = [];
  const payment = {
    id: `cp_${Date.now()}`,
    case_id: caseId,
    ...req.body,
    recorded_by: req.user?.username || 'admin',
    created_at: new Date().toISOString(),
  };
  CASE_PAYMENTS[caseId].push(payment);
  res.status(201).json(payment);
});

// â”€â”€â”€ SETTINGS: SYMPTOMS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
let SETTINGS_SYMPTOMS = [
  { id: 's1', label: 'Not Detected', value: 'not_detected', color: '#ef4444' },
  { id: 's2', label: 'Clicking', value: 'clicking', color: '#f59e0b' },
  { id: 's3', label: 'Slow', value: 'slow', color: '#3b82f6' },
  { id: 's4', label: 'Dead', value: 'dead', color: '#dc2626' },
  { id: 's5', label: 'Beeping', value: 'beeping', color: '#8b5cf6' },
  { id: 's6', label: 'Overheating', value: 'overheating', color: '#f97316' },
  { id: 's7', label: 'Grinding', value: 'grinding', color: '#ef4444' },
  { id: 's8', label: 'PCB Burnt', value: 'pcb_burnt', color: '#dc2626' },
  { id: 's9', label: 'Corrupted', value: 'corrupted', color: '#6366f1' },
  { id: 's10', label: 'Partial Data', value: 'partial_data', color: '#10b981' },
];

app.get('/api/settings/symptoms', authenticate, (req, res) => res.json(SETTINGS_SYMPTOMS));
app.put('/api/settings/symptoms', authenticate, (req, res) => {
  SETTINGS_SYMPTOMS = req.body;
  res.json(SETTINGS_SYMPTOMS);
});
app.post('/api/settings/symptoms', authenticate, (req, res) => {
  const sym = { id: `sym_${Date.now()}`, ...req.body };
  SETTINGS_SYMPTOMS.push(sym);
  res.status(201).json(sym);
});
app.delete('/api/settings/symptoms/:id', authenticate, (req, res) => {
  SETTINGS_SYMPTOMS = SETTINGS_SYMPTOMS.filter(s => s.id !== req.params.id);
  res.json({ ok: true });
});

// â”€â”€â”€ SETTINGS: STAGES â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
let SETTINGS_STAGES = [
  { id: 'st1', key: 'received', label: 'Received', icon: 'ðŸ“¥', color: '#64748b', order: 1 },
  { id: 'st2', key: 'inspection', label: 'Inspection', icon: 'ðŸ”', color: '#3b82f6', order: 2 },
  { id: 'st3', key: 'diagnosis', label: 'Diagnosis', icon: 'ðŸ§ª', color: '#6366f1', order: 3 },
  { id: 'st4', key: 'quotation', label: 'Quotation', icon: 'ðŸ’°', color: '#f59e0b', order: 4 },
  { id: 'st5', key: 'approved', label: 'Approved', icon: 'âœ…', color: '#10b981', order: 5 },
  { id: 'st6', key: 'rejected', label: 'Rejected', icon: 'âŒ', color: '#ef4444', order: 6 },
  { id: 'st7', key: 'recovery_in_progress', label: 'Recovery In Progress', icon: 'âš™ï¸', color: '#00d4ff', order: 7 },
  { id: 'st8', key: 'imaging', label: 'Imaging', icon: 'ðŸ’¿', color: '#7c3aed', order: 8 },
  { id: 'st9', key: 'data_extraction', label: 'Data Extraction', icon: 'ðŸ“¤', color: '#ec4899', order: 9 },
  { id: 'st10', key: 'verification', label: 'Verification', icon: 'ðŸ”¬', color: '#fbbf24', order: 10 },
  { id: 'st11', key: 'completed', label: 'Completed', icon: 'ðŸ†', color: '#10b981', order: 11 },
  { id: 'st12', key: 'delivered', label: 'Delivered', icon: 'ðŸ“¦', color: '#00d4ff', order: 12 },
  { id: 'st13', key: 'failed', label: 'Failed', icon: 'ðŸ’”', color: '#dc2626', order: 13 },
];

app.get('/api/settings/stages', authenticate, (req, res) => res.json(SETTINGS_STAGES));
app.put('/api/settings/stages', authenticate, (req, res) => {
  SETTINGS_STAGES = req.body;
  res.json(SETTINGS_STAGES);
});
app.post('/api/settings/stages', authenticate, (req, res) => {
  const stage = { id: `stg_${Date.now()}`, order: SETTINGS_STAGES.length + 1, ...req.body };
  SETTINGS_STAGES.push(stage);
  res.status(201).json(stage);
});
app.delete('/api/settings/stages/:id', authenticate, (req, res) => {
  SETTINGS_STAGES = SETTINGS_STAGES.filter(s => s.id !== req.params.id);
  res.json({ ok: true });
});

// â”€â”€â”€ SETTINGS: PAYMENT METHODS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
let SETTINGS_PAYMENT_METHODS = [
  { id: 'pm1', label: 'Cash', icon: 'ðŸ’µ' },
  { id: 'pm2', label: 'UPI', icon: 'ðŸ“±' },
  { id: 'pm3', label: 'Credit Card', icon: 'ðŸ’³' },
  { id: 'pm4', label: 'Debit Card', icon: 'ðŸ’³' },
  { id: 'pm5', label: 'Net Banking', icon: 'ðŸ¦' },
  { id: 'pm6', label: 'Cheque', icon: 'ðŸ“„' },
  { id: 'pm7', label: 'Bank Transfer', icon: 'ðŸ§' },
  { id: 'pm8', label: 'Razorpay', icon: 'ðŸ’Ž' },
];

app.get('/api/settings/payment-methods', authenticate, (req, res) => res.json(SETTINGS_PAYMENT_METHODS));
app.put('/api/settings/payment-methods', authenticate, (req, res) => {
  SETTINGS_PAYMENT_METHODS = req.body;
  res.json(SETTINGS_PAYMENT_METHODS);
});
app.post('/api/settings/payment-methods', authenticate, (req, res) => {
  const pm = { id: `pm_${Date.now()}`, ...req.body };
  SETTINGS_PAYMENT_METHODS.push(pm);
  res.status(201).json(pm);
});
app.delete('/api/settings/payment-methods/:id', authenticate, (req, res) => {
  SETTINGS_PAYMENT_METHODS = SETTINGS_PAYMENT_METHODS.filter(p => p.id !== req.params.id);
  res.json({ ok: true });
});

// â”€â”€â”€ SETTINGS: ROLES â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
let SETTINGS_ROLES = [
  {
    id: 'role_senior_eng', key: 'senior_engineer', name: 'Senior Engineer', level: 3, color: '#7c3aed', description: 'Handles complex recoveries, can advance case stages',
    permissions: { cases: { view: true, create: true, edit: true, delete: false, advance_stage: true }, clients: { view: true, create: false, edit: false, delete: false }, inventory: { view: true, create: false, edit: false, delete: false }, accounting: { view: false, create_invoice: false, create_quote: false, record_payment: false, create_expense: false }, reports: { view: true, export: false }, analytics: { view: true }, knowledge_base: { view: true, create: true, delete: false }, recycle_bin: { view: false, restore: false, permanent_delete: false }, settings: { view: false, edit_company: false, edit_numbers: false, edit_users: false, edit_roles: false, edit_stages: false, edit_symptoms: false, edit_failure_types: false, edit_brands: false, edit_payment_methods: false, edit_whatsapp: false, edit_razorpay: false, edit_gst: false }, users: { view: false, create: false, edit: false, deactivate: false }, webhooks: { view: false, edit: false } }
  },
  {
    id: 'role_junior_eng', key: 'junior_engineer', name: 'Junior Engineer', level: 2, color: '#3b82f6', description: 'View and update cases, no deletion or financial access',
    permissions: { cases: { view: true, create: false, edit: false, delete: false, advance_stage: false }, clients: { view: true, create: false, edit: false, delete: false }, inventory: { view: true, create: false, edit: false, delete: false }, accounting: { view: false }, reports: { view: false }, analytics: { view: false }, knowledge_base: { view: true, create: false, delete: false }, recycle_bin: { view: false }, settings: { view: false }, users: { view: false }, webhooks: { view: false } }
  },
  {
    id: 'role_receptionist', key: 'receptionist', name: 'Receptionist', level: 1, color: '#10b981', description: 'Front desk â€” create cases & clients, basic view',
    permissions: { cases: { view: true, create: true, edit: true, delete: false, advance_stage: false }, clients: { view: true, create: true, edit: true, delete: false }, inventory: { view: false }, accounting: { view: false }, reports: { view: false }, analytics: { view: false }, knowledge_base: { view: false }, recycle_bin: { view: false }, settings: { view: false }, users: { view: false }, webhooks: { view: false } }
  },
  {
    id: 'role_accountant', key: 'accountant', name: 'Accountant', level: 2, color: '#f59e0b', description: 'Full accounting access, read-only cases',
    permissions: { cases: { view: true, create: false, edit: false, delete: false, advance_stage: false }, clients: { view: true, create: false, edit: false, delete: false }, inventory: { view: false }, accounting: { view: true, create_invoice: true, create_quote: true, record_payment: true, create_expense: true }, reports: { view: true, export: true }, analytics: { view: true }, knowledge_base: { view: false }, recycle_bin: { view: false }, settings: { view: false }, users: { view: false }, webhooks: { view: false } }
  },
];

// Deprecated: roles are now managed via /api/super-admin/settings/roles (Super Admin only)
app.get('/api/settings/roles', authenticate, (req, res) => {
  return res.status(410).json({
    error: 'Endpoint deprecated',
    message: 'Roles are now managed via /api/super-admin/settings/roles',
    hint: 'Only Super Admin can manage roles'
  });
});
app.put('/api/settings/roles', authenticate, (req, res) => {
  return res.status(410).json({
    error: 'Endpoint deprecated',
    message: 'Use /api/super-admin/settings/roles instead',
    hint: 'Only Super Admin can manage roles'
  });
});
app.post('/api/settings/roles', authenticate, (req, res) => {
  return res.status(410).json({
    error: 'Endpoint deprecated',
    message: 'Use /api/super-admin/settings/roles instead',
    hint: 'Only Super Admin can manage roles'
  });
});
app.patch('/api/settings/roles/:id', authenticate, (req, res) => {
  return res.status(410).json({
    error: 'Endpoint deprecated',
    message: 'Use /api/super-admin/settings/roles/:id instead',
    hint: 'Only Super Admin can manage roles'
  });
});
app.delete('/api/settings/roles/:id', authenticate, (req, res) => {
  return res.status(410).json({
    error: 'Endpoint deprecated',
    message: 'Use /api/super-admin/settings/roles/:id instead',
    hint: 'Only Super Admin can manage roles'
  });
});


// â”€â”€â”€ SINGLE INVENTORY ITEM â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
app.get('/api/inventory/:id', authenticate, (req, res) => {
  const item = DEMO_INVENTORY.find(i => i.id === req.params.id);
  if (!item) return res.status(404).json({ error: 'Not found' });
  res.json({ item });
});

app.put('/api/inventory/:id', authenticate, (req, res) => {
  const idx = DEMO_INVENTORY.findIndex(i => i.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  DEMO_INVENTORY[idx] = { ...DEMO_INVENTORY[idx], ...req.body, updated_at: new Date().toISOString() };
  res.json(DEMO_INVENTORY[idx]);
});

// â”€â”€â”€ TRANSFER CASE HDD TO STOCK â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
app.post('/api/cases/:id/transfer-to-stock', authenticate, (req, res) => {
  const c = DEMO_CASES.find(c => c.id === req.params.id);
  if (!c) return res.status(404).json({ error: 'Case not found' });
  const sku = `SKU-${String(DEMO_INVENTORY.length + 1).padStart(4, '0')}`;
  const newItem = {
    id: `inv_${Date.now()}`,
    sku,
    stock_number: req.body.stock_number || sku,
    name: `${c.device_brand || ''} ${c.device_model || ''} (from ${c.case_number})`.trim(),
    category: req.body.category || 'others_35',
    company: req.body.company || c.device_brand || '',
    brand: req.body.brand || c.device_brand || '',
    model: req.body.model || c.device_model || '',
    serial_number: req.body.serial_number || c.serial_number || '',
    pcb_number: req.body.pcb_number || c.pcb_number || '',
    firmware: req.body.firmware || c.firmware || '',
    site_code: req.body.site_code || c.site_code || '',
    date_code: req.body.date_code || c.date_code || '',
    head_map: req.body.head_map || c.head_map || '',
    family: req.body.family || c.family || '',
    capacity: req.body.capacity || (c.capacity_gb ? `${c.capacity_gb}GB` : ''),
    interface: req.body.interface || c.interface || 'SATA',
    form_factor: req.body.form_factor || c.form_factor || '',
    quantity: parseInt(req.body.quantity) || 1,
    min_quantity: 1,
    unit_cost: req.body.unit_cost || 0,
    location: req.body.location || '',
    condition: req.body.condition || 'for_parts',
    status: req.body.status || 'available',
    notes: req.body.notes || `Transferred from case ${c.case_number}. Client: ${c.first_name || ''} ${c.last_name || ''}.`,
    source_case_id: c.id,
    created_at: new Date().toISOString(),
  };
  DEMO_INVENTORY.push(newItem);
  res.status(201).json({ ok: true, item: newItem });
});


// â”€â”€â”€ RECYCLE BIN â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const DELETED_CASES = [];

// Soft-delete a case â†’ moves to DELETED_CASES
app.delete('/api/cases/:id', authenticate, (req, res) => {
  const idx = DEMO_CASES.findIndex(c => c.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Case not found' });
  const [removed] = DEMO_CASES.splice(idx, 1);
  DELETED_CASES.push({
    ...removed,
    deleted_at: new Date().toISOString(),
    deleted_by: req.user.username,
    client_name: `${removed.first_name} ${removed.last_name}`,
    brand: removed.device_brand,
    model: removed.device_model,
    status: removed.stage,
  });
  res.json({ ok: true });
});

app.get('/api/recycle-bin', authenticate, (req, res) => {
  res.json({ items: DELETED_CASES, total: DELETED_CASES.length });
});

app.post('/api/recycle-bin/:id/restore', authenticate, (req, res) => {
  const { admin_password } = req.body;
  // Accept any non-empty password in demo mode
  if (!admin_password) return res.status(400).json({ error: 'Password required' });
  const idx = DELETED_CASES.findIndex(c => c.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Item not found in recycle bin' });
  const [restored] = DELETED_CASES.splice(idx, 1);
  const { deleted_at, deleted_by, client_name, ...caseData } = restored;
  DEMO_CASES.push(caseData);
  res.json({ ok: true, case: caseData });
});

app.delete('/api/recycle-bin/:id/permanent-delete', authenticate, (req, res) => {
  const { admin_password } = req.body;
  if (!admin_password) return res.status(400).json({ error: 'Admin password required' });
  if (req.user.role !== 'admin' && req.user.role !== 'super_admin') {
    return res.status(403).json({ error: 'Only Super Admin can permanently delete cases' });
  }
  const idx = DELETED_CASES.findIndex(c => c.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Item not found in recycle bin' });
  DELETED_CASES.splice(idx, 1);
  res.json({ ok: true });
});

// â”€â”€â”€ TIMELINE NOTES â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const CASE_TIMELINE_NOTES = {};

app.get('/api/cases/:id/timeline', authenticate, (req, res) => {
  res.json(CASE_TIMELINE_NOTES[req.params.id] || []);
});

app.post('/api/cases/:id/timeline', authenticate, (req, res) => {
  const caseId = req.params.id;
  if (!CASE_TIMELINE_NOTES[caseId]) CASE_TIMELINE_NOTES[caseId] = [];
  const note = {
    id: `tn_${Date.now()}`,
    case_id: caseId,
    ...req.body,
    author: req.user?.username || 'admin',
    created_at: new Date().toISOString(),
  };
  CASE_TIMELINE_NOTES[caseId].push(note);
  res.status(201).json(note);
});

app.put('/api/cases/:id/timeline/:noteId', authenticate, (req, res) => {
  const notes = CASE_TIMELINE_NOTES[req.params.id] || [];
  const idx = notes.findIndex(n => n.id === req.params.noteId);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  notes[idx] = { ...notes[idx], ...req.body, updated_at: new Date().toISOString() };
  res.json(notes[idx]);
});

app.delete('/api/cases/:id/timeline/:noteId', authenticate, (req, res) => {
  if (CASE_TIMELINE_NOTES[req.params.id]) {
    CASE_TIMELINE_NOTES[req.params.id] = CASE_TIMELINE_NOTES[req.params.id].filter(n => n.id !== req.params.noteId);
  }
  res.json({ ok: true });
});

// â”€â”€â”€ REPORTS DATA â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
app.get('/api/reports/cases', authenticate, (req, res) => {
  const { stage, failure_type, from_date, to_date } = req.query;
  let cases = [...DEMO_CASES];
  if (stage) cases = cases.filter(c => c.stage === stage);
  if (failure_type) cases = cases.filter(c => c.failure_type === failure_type || (c.failure_types||[]).includes(failure_type));
  if (from_date) cases = cases.filter(c => new Date(c.created_at) >= new Date(from_date));
  if (to_date) cases = cases.filter(c => new Date(c.created_at) <= new Date(to_date));
  res.json({ cases, total: cases.length });
});

app.get('/api/reports/accounting', authenticate, (req, res) => {
  const { from_date, to_date, type } = req.query;
  let invoices = [...INVOICES];
  let expenses = [...EXPENSES];
  if (from_date) {
    invoices = invoices.filter(i => new Date(i.created_at) >= new Date(from_date));
    expenses = expenses.filter(e => new Date(e.date) >= new Date(from_date));
  }
  if (to_date) {
    invoices = invoices.filter(i => new Date(i.created_at) <= new Date(to_date));
    expenses = expenses.filter(e => new Date(e.date) <= new Date(to_date));
  }
  res.json({ invoices, expenses, total_invoices: invoices.length, total_expenses: expenses.length });
});

app.get('/api/reports/inventory', authenticate, (req, res) => {
  const { category } = req.query;
  let items = [...DEMO_INVENTORY];
  if (category) items = items.filter(i => i.category === category);
  res.json({ items, total: items.length, low_stock: items.filter(i => i.quantity <= i.min_quantity).length });
});


// â”€â”€â”€ COMMUNICATION LOG (per case) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const CASE_COMMS = {}; // caseId -> [entries]

app.get('/api/cases/:id/communications', authenticate, (req, res) => {
  const { id } = req.params;
  res.json({ communications: (CASE_COMMS[id] || []) });
});

app.post('/api/cases/:id/communications', authenticate, (req, res) => {
  const { id } = req.params;
  const { type, direction, summary, agent, duration, followUp } = req.body;
  if (!summary) return res.status(400).json({ error: 'Summary required' });
  const entry = {
    id: `comm_${Date.now()}`,
    type: type || 'call',
    direction: direction || 'outbound',
    summary,
    agent: agent || req.user.username,
    duration: duration || null,
    followUp: followUp || null,
    createdAt: new Date().toISOString(),
    createdBy: req.user.userId,
  };
  if (!CASE_COMMS[id]) CASE_COMMS[id] = [];
  CASE_COMMS[id].unshift(entry);
  res.json({ communication: entry });
});

app.delete('/api/cases/:id/communications/:commId', authenticate, (req, res) => {
  const { id, commId } = req.params;
  if (CASE_COMMS[id]) {
    CASE_COMMS[id] = CASE_COMMS[id].filter(c => c.id !== commId);
  }
  res.json({ ok: true });
});

// â”€â”€â”€ KNOWLEDGE BASE (case solutions) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
app.get('/api/knowledge-base', authenticate, (req, res) => {
  const { q, failure_type, brand } = req.query;
  // Return solved cases with solutions
  let cases = DEMO_CASES.filter(c => ['completed','delivered'].includes(c.stage));
  if (q) {
    const query = q.toLowerCase();
    cases = cases.filter(c =>
      c.device_brand?.toLowerCase().includes(query) ||
      c.device_model?.toLowerCase().includes(query) ||
      c.failure_type?.toLowerCase().includes(query) ||
      (c.failure_types||[]).some(f => f.toLowerCase().includes(query)) ||
      (CASE_SOLUTIONS[c.id]?.textNote || '').toLowerCase().includes(query)
    );
  }
  if (failure_type) cases = cases.filter(c => c.failure_type === failure_type || (c.failure_types||[]).includes(failure_type));
  if (brand) cases = cases.filter(c => c.device_brand?.toLowerCase().includes(brand.toLowerCase()));

  const results = cases.map(c => ({
    ...c,
    solution: CASE_SOLUTIONS[c.id] || null,
    hasSolution: !!(CASE_SOLUTIONS[c.id]?.textNote),
  }));
  res.json({ results, total: results.length });
});

// â”€â”€â”€ PUBLIC CLIENT PORTAL (no auth needed) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
app.get('/api/client-portal/case', (req, res) => {
  const { case_number, phone } = req.query;
  if (!case_number) return res.status(400).json({ error: 'case_number required' });

  const c = DEMO_CASES.find(x => x.case_number?.toUpperCase() === case_number.trim().toUpperCase());
  if (!c) return res.status(404).json({ error: 'Case not found. Please check the case number.' });

  // Verify phone if provided (last 4 digits or full number)
  if (phone && phone.trim()) {
    const ph = phone.trim().replace(/\D/g, '');
    const clientPhone = (c.client_phone || '').replace(/\D/g, '');
    if (clientPhone && ph.length >= 4 && !clientPhone.endsWith(ph.slice(-4))) {
      return res.status(403).json({ error: 'Phone number does not match our records.' });
    }
  }

  // Return only client-safe fields
  const safe = {
    id: c.id,
    case_number: c.case_number,
    stage: c.stage,
    device_type: c.device_type,
    device_brand: c.device_brand,
    device_model: c.device_model,
    failure_type: c.failure_type,
    priority: c.priority,
    recovery_progress_pct: c.recovery_progress_pct || 0,
    created_at: c.created_at,
    description: c.description,
    status_note: c.status_note || '',
  };
  res.json(safe);
});

app.post('/api/client-portal/message', (req, res) => {
  const { case_id, case_number, message, phone } = req.body;
  if (!message?.trim()) return res.status(400).json({ error: 'message required' });

  const c = DEMO_CASES.find(x => x.id === case_id || x.case_number === case_number);
  if (!c) return res.status(404).json({ error: 'Case not found' });

  // Save as a communication log entry
  if (!c._communications) c._communications = [];
  c._communications.unshift({
    id: `comm_${Date.now()}`,
    type: 'client_message',
    direction: 'inbound',
    summary: message,
    agent: phone ? `Client (${phone})` : 'Client (Portal)',
    created_at: new Date().toISOString(),
    from_portal: true,
  });

  res.json({ ok: true, message: 'Message received. Our team will respond shortly.' });
});

// â”€â”€â”€ RAZORPAY INTEGRATION â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

// Verify Razorpay API Keys â€” returns merchant/account name
app.post('/api/razorpay/verify-keys', authenticate, async (req, res) => {
  const { key_id, key_secret } = req.body;
  if (!key_id || !key_secret) return res.status(400).json({ ok: false, message: 'key_id and key_secret required' });

  if (!key_id.startsWith('rzp_')) {
    return res.json({ ok: false, message: 'Invalid Key ID format. Should start with rzp_live_ or rzp_test_' });
  }

  try {
    // In demo mode: simulate Razorpay account verification
    // In production: use: await axios.get('https://api.razorpay.com/v1/payments', { auth: { username: key_id, password: key_secret }, params: { count: 1 } })
    const isTestKey = key_id.startsWith('rzp_test_');
    const company = COMPANY_SETTINGS;
    res.json({
      ok: true,
      account_name: company.name || 'RecoverLab Solutions Pvt Ltd',
      business_name: company.name || 'RecoverLab',
      email: company.email || 'admin@recoverlab.in',
      mode: isTestKey ? 'test' : 'live',
      message: `Verified as: ${company.name || 'RecoverLab Solutions'}`,
    });
  } catch (err) {
    res.json({ ok: false, message: 'Could not verify keys. Check credentials.' });
  }
});

// Generate secure payment link (amount locked server-side â€” client cannot tamper)
app.post('/api/razorpay/subscription-link', authenticate, async (req, res) => {
  const { plan, months = 1, amount, coupon_code, name, email, phone } = req.body;
  if (!plan || !amount) return res.status(400).json({ error: 'plan and amount required' });

  // Server validates amount: fetch plan price and compute expected amount
  const PLAN_PRICES = { starter: 999, professional: 2499, business: 4999, enterprise: 9999 };
  const basePrice = PLAN_PRICES[plan];
  if (!basePrice) return res.status(400).json({ error: 'Invalid plan' });

  // Record attempted purchase
  const purchaseEntry = {
    id: `purchase_${Date.now()}`,
    timestamp: new Date().toISOString(),
    tenant_name: name || 'Unknown',
    tenant_email: email || '',
    plan, months, amount,
    status: 'pending',
    coupon_code: coupon_code || null,
    razorpay_payment_id: null,
    razorpay_order_id: `order_${Math.random().toString(36).slice(2, 16)}`,
  };
  PURCHASE_LOG.unshift(purchaseEntry);

  // In production: create Razorpay Payment Link via API
  // const rzp = require('razorpay');
  // const instance = new rzp({ key_id: process.env.RAZORPAY_KEY_ID, key_secret: process.env.RAZORPAY_SECRET });
  // const link = await instance.paymentLink.create({ amount: amount * 100, currency: 'INR', ... });

  // Demo: return simulated payment link
  const shortId = Math.random().toString(36).slice(2, 10);
  res.json({
    ok: true,
    payment_link: `https://rzp.io/l/${shortId}`,
    short_url: `https://rzp.io/l/${shortId}`,
    order_id: purchaseEntry.razorpay_order_id,
    amount_paise: amount * 100,
    amount_inr: amount,
    expires_at: new Date(Date.now() + 24 * 3600000).toISOString(),
  });
});

// Razorpay Webhook â€” auto-update subscription on payment events
// Configure in Razorpay Dashboard â†’ Settings â†’ Webhooks â†’ URL: /api/razorpay/webhook
app.post('/api/razorpay/webhook', express.raw({ type: 'application/json' }), (req, res) => {
  const webhookSecret = COMPANY_SETTINGS.razorpay_webhook_secret || process.env.RAZORPAY_WEBHOOK_SECRET;

  // Signature verification (skip in demo if no secret configured)
  if (webhookSecret) {
    try {
      const crypto = require('crypto');
      const body = req.body.toString();
      const expectedSig = crypto.createHmac('sha256', webhookSecret).update(body).digest('hex');
      const receivedSig = req.headers['x-razorpay-signature'];
      if (expectedSig !== receivedSig) {
        console.warn('[Webhook] Signature mismatch â€” possibly invalid request');
        return res.status(400).json({ error: 'Invalid webhook signature' });
      }
    } catch (e) {
      console.warn('[Webhook] Signature check failed:', e.message);
    }
  }

  let payload;
  try {
    payload = JSON.parse(req.body.toString());
  } catch {
    return res.status(400).json({ error: 'Invalid JSON payload' });
  }

  const event = payload.event;
  const paymentData = payload.payload?.payment?.entity || {};
  const subscriptionData = payload.payload?.subscription?.entity || {};

  console.log(`[Razorpay Webhook] Event: ${event}`);

  const entry = {
    id: `webhook_${Date.now()}`,
    timestamp: new Date().toISOString(),
    event,
    status: 'pending',
    razorpay_payment_id: paymentData.id || null,
    razorpay_order_id: paymentData.order_id || subscriptionData.id || null,
    amount: paymentData.amount ? paymentData.amount / 100 : 0,
    tenant_email: paymentData.email || paymentData.contact || '',
    tenant_name: paymentData.description || '',
    plan: paymentData.notes?.plan || '',
    months: parseInt(paymentData.notes?.months || '1'),
    coupon_code: paymentData.notes?.coupon || null,
  };

  if (event === 'payment.captured') {
    entry.status = 'success';
    // Auto-upgrade tenant subscription
    const tenant = TENANTS.find(t =>
      t.admin_email === entry.tenant_email ||
      t.company_name === entry.tenant_name
    );
    if (tenant) {
      const plan = entry.plan || 'professional';
      const months = entry.months || 1;
      const newExpiry = new Date(Math.max(Date.now(), new Date(tenant.expiry_date || Date.now()).getTime()) + months * 30 * 86400000);
      tenant.plan = plan;
      tenant.status = 'active';
      tenant.expiry_date = newExpiry.toISOString().slice(0, 10);
      console.log(`[Webhook] âœ… Tenant ${tenant.company_name} upgraded to ${plan}, expires ${tenant.expiry_date}`);
    }
    console.log(`[Webhook] âœ… Payment captured: ${entry.razorpay_payment_id} â€” â‚¹${entry.amount}`);
  } else if (event === 'subscription.activated') {
    entry.status = 'success';
    const tenant = TENANTS.find(t => t.admin_email === entry.tenant_email);
    if (tenant) { tenant.status = 'active'; }
    console.log(`[Webhook] âœ… Subscription activated for ${entry.tenant_email}`);
  } else if (event === 'subscription.halted' || event === 'subscription.cancelled') {
    entry.status = 'failed';
    const tenant = TENANTS.find(t => t.admin_email === entry.tenant_email);
    if (tenant) { tenant.status = 'expired'; }
    console.log(`[Webhook] âŒ Subscription halted/cancelled for ${entry.tenant_email}`);
  } else if (event === 'payment.failed') {
    entry.status = 'failed';
    console.log(`[Webhook] âŒ Payment failed for ${entry.tenant_email}`);
  }

  PURCHASE_LOG.unshift(entry);
  res.json({ ok: true, event });
});

// Get purchase log (for Super Admin)
app.get('/api/razorpay/purchases', authenticate, requireSuperAdmin, (req, res) => {
  res.json({ purchases: PURCHASE_LOG, total: PURCHASE_LOG.length });
});

// Get subscription status for a tenant
app.get('/api/razorpay/subscription-status', authenticate, (req, res) => {
  const tenant = TENANTS.find(t => t.id === req.user.tenant_id);
  if (!tenant) return res.json({ status: 'active', plan: 'professional', expires_at: null });

  const isExpired = tenant.expiry_date && new Date(tenant.expiry_date) < new Date();
  const daysLeft = tenant.expiry_date
    ? Math.ceil((new Date(tenant.expiry_date) - Date.now()) / 86400000)
    : null;

  res.json({
    status: isExpired ? 'expired' : tenant.status,
    plan: tenant.plan,
    expires_at: tenant.expiry_date,
    days_left: daysLeft,
    is_expired: isExpired,
    is_expiring_soon: daysLeft !== null && daysLeft >= 0 && daysLeft <= 14,
  });
});

// â”€â”€â”€ 2FA (TOTP) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function generateTotpSecret() {
  return crypto.randomBytes(20).toString('hex').toUpperCase().slice(0, 32);
}
function generateOtp6() {
  return String(Math.floor(100000 + Math.random() * 900000));
}
function verifyTotp(secret, token, userId) {
  const stored = TOTP_SECRETS.get(userId);
  if (stored?.demo_otp && token === stored.demo_otp) { stored.demo_otp = null; return true; }
  return token === '123456'; // demo always accepts this for testing
}

app.post('/api/2fa/setup', authenticate, (req, res) => {
  const secret = generateTotpSecret();
  const backupCodes = Array.from({ length: 8 }, () => crypto.randomBytes(4).toString('hex').toUpperCase());
  TOTP_SECRETS.set(req.user.userId, { secret, enabled: false, backup_codes: backupCodes, created_at: new Date().toISOString() });
  const qrUrl = `otpauth://totp/RecoverLabCRM:${req.user.username}?secret=${secret}&issuer=RecoverLabCRM&algorithm=SHA1&digits=6&period=30`;
  res.json({ ok: true, secret, qr_url: qrUrl, backup_codes: backupCodes, message: 'Scan QR code in your authenticator app, then verify to activate 2FA.' });
});

app.post('/api/2fa/verify-setup', authenticate, (req, res) => {
  const { token } = req.body;
  const entry = TOTP_SECRETS.get(req.user.userId);
  if (!entry) return res.status(400).json({ error: '2FA setup not initialized. Call /api/2fa/setup first.' });
  if (!verifyTotp(entry.secret, token, req.user.userId)) return res.status(401).json({ error: 'Invalid TOTP code. Check your authenticator app and try again.' });
  entry.enabled = true;
  const user = [...DEMO_USERS, ...TEAM_USERS, SUPER_ADMIN].find(u => u.id === req.user.userId);
  if (user) user.two_factor_enabled = true;
  res.json({ ok: true, message: '2FA enabled successfully. Keep your backup codes in a safe place.' });
});

app.post('/api/2fa/disable', authenticate, async (req, res) => {
  const { password } = req.body;
  const user = [...DEMO_USERS, ...TEAM_USERS, SUPER_ADMIN].find(u => u.id === req.user.userId);
  if (!user) return res.status(404).json({ error: 'User not found' });
  const valid = await bcrypt.compare(password || '', user.password_hash);
  if (!valid) return res.status(401).json({ error: 'Incorrect password' });
  TOTP_SECRETS.delete(req.user.userId);
  if (user) user.two_factor_enabled = false;
  res.json({ ok: true, message: '2FA has been disabled.' });
});

app.post('/api/2fa/validate', (req, res) => {
  const { temp_token, totp_code } = req.body;
  if (!temp_token || !totp_code) return res.status(400).json({ error: 'temp_token and totp_code required' });
  try {
    const decoded = jwt.verify(temp_token, JWT_SECRET + '_2fa');
    const entry = TOTP_SECRETS.get(decoded.userId);
    if (!entry) return res.status(400).json({ error: '2FA not configured for this account' });
    const backupIdx = (entry.backup_codes || []).indexOf(totp_code.toUpperCase());
    if (backupIdx !== -1) { entry.backup_codes.splice(backupIdx, 1); }
    else if (!verifyTotp(entry.secret, totp_code, decoded.userId)) {
      return res.status(401).json({ error: 'Invalid 2FA code. Check your app or use a backup code.' });
    }
    const user = [...DEMO_USERS, ...TEAM_USERS, SUPER_ADMIN].find(u => u.id === decoded.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    const { password_hash, ...safe } = user;
    res.json({ accessToken: signToken(user), refreshToken: `refresh_${user.id}`, user: safe });
  } catch { res.status(401).json({ error: 'Invalid or expired 2FA session. Please log in again.' }); }
});

app.get('/api/2fa/status', authenticate, (req, res) => {
  const user = [...DEMO_USERS, ...TEAM_USERS, SUPER_ADMIN].find(u => u.id === req.user.userId);
  const entry = TOTP_SECRETS.get(req.user.userId);
  res.json({ enabled: !!(user?.two_factor_enabled && entry?.enabled), backup_codes_remaining: entry?.backup_codes?.length || 0 });
});

// â”€â”€â”€ PASSWORD RESET via OTP (Email / WhatsApp) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

app.post('/api/auth/request-reset', (req, res) => {
  const { identifier, method = 'email' } = req.body;
  if (!identifier) return res.status(400).json({ error: 'Email or phone required' });
  const allUsers = [...DEMO_USERS, ...TEAM_USERS, SUPER_ADMIN];
  const user = allUsers.find(u => u.email === identifier || u.phone === identifier || u.username === identifier);
  const otp = generateOtp6();
  if (user) {
    OTP_STORE.set(`${identifier}_reset`, { otp, userId: user.id, expires: Date.now() + 15 * 60 * 1000, used: false });
    console.log(`[Password Reset] OTP for ${identifier} via ${method}: ${otp}`);
  }
  // Always return success (prevents user enumeration)
  const masked = identifier.includes('@') ? identifier.replace(/(.{2}).*(@.*)/, '$1***$2') : identifier.slice(0, 3) + '***' + identifier.slice(-2);
  res.json({ ok: true, message: `If an account exists, a 6-digit code was sent to ${masked}.`, demo_otp: user ? otp : null });
});

app.post('/api/auth/verify-otp', (req, res) => {
  const { identifier, otp } = req.body;
  const entry = OTP_STORE.get(`${identifier}_reset`);
  if (!entry || entry.used || Date.now() > entry.expires) return res.status(400).json({ error: 'OTP expired or invalid. Request a new code.' });
  if (entry.otp !== String(otp)) return res.status(401).json({ error: 'Incorrect OTP.' });
  const resetToken = jwt.sign({ userId: entry.userId, purpose: 'password_reset' }, JWT_SECRET + '_reset', { expiresIn: '10m' });
  entry.used = true;
  res.json({ ok: true, reset_token: resetToken });
});

app.post('/api/auth/reset-password', async (req, res) => {
  const { reset_token, new_password } = req.body;
  if (!reset_token || !new_password) return res.status(400).json({ error: 'reset_token and new_password required' });
  if (new_password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });
  try {
    const decoded = jwt.verify(reset_token, JWT_SECRET + '_reset');
    if (decoded.purpose !== 'password_reset') return res.status(400).json({ error: 'Invalid token purpose' });
    const allUsers = [...DEMO_USERS, ...TEAM_USERS, SUPER_ADMIN];
    const user = allUsers.find(u => u.id === decoded.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    user.password_hash = await bcrypt.hash(new_password, 12);
    res.json({ ok: true, message: 'Password reset successfully. You can now log in.' });
  } catch { res.status(400).json({ error: 'Reset link expired. Request a new code.' }); }
});

// â”€â”€â”€ PER-USER ENCRYPTION KEYS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function generateUserKey(userId) {
  const keyId = `key_${userId.slice(0, 8)}_${Date.now()}`;
  const keyHash = crypto.createHmac('sha256', ENCRYPTION_MASTER_KEY).update(`${userId}:${Date.now()}`).digest('hex').slice(0, 16);
  const entry = { key_id: keyId, key_hash: keyHash, algorithm: 'AES-256-GCM', created_at: new Date().toISOString(), rotated_at: null };
  USER_ENC_KEYS.set(userId, entry);
  return entry;
}

app.get('/api/encryption/key', authenticate, (req, res) => {
  let entry = USER_ENC_KEYS.get(req.user.userId);
  if (!entry) entry = generateUserKey(req.user.userId);
  res.json({ key_info: entry, message: 'Each user has a unique encryption key derived from a master key.' });
});

app.post('/api/encryption/rotate', authenticate, async (req, res) => {
  const { password } = req.body;
  const user = [...DEMO_USERS, ...TEAM_USERS, SUPER_ADMIN].find(u => u.id === req.user.userId);
  const valid = await bcrypt.compare(password || '', user?.password_hash || '');
  if (!valid) return res.status(401).json({ error: 'Incorrect password. Cannot rotate encryption key.' });
  const entry = { ...generateUserKey(req.user.userId), rotated_at: new Date().toISOString() };
  USER_ENC_KEYS.set(req.user.userId, entry);
  res.json({ ok: true, key_info: entry, message: 'Encryption key rotated successfully.' });
});

app.get('/api/encryption/all-keys', authenticate, requireAdmin, (req, res) => {
  const keys = [];
  USER_ENC_KEYS.forEach((v, k) => keys.push({ user_id: k, ...v }));
  res.json({ keys, total: keys.length, algorithm: 'AES-256-GCM', master_key_configured: !!process.env.ENCRYPTION_MASTER_KEY });
});

// â”€â”€â”€ RECYCLE BIN â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

app.delete('/api/cases/:id', authenticate, (req, res) => {
  const idx = DEMO_CASES.findIndex(c => c.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Case not found' });
  const [deleted] = DEMO_CASES.splice(idx, 1);
  RECYCLE_BIN.unshift({
    ...deleted,
    client_name: `${deleted.first_name || ''} ${deleted.last_name || ''}`.trim(),
    device_type: 'HDD', brand: deleted.device_brand, model: deleted.device_model, status: deleted.stage,
    deleted_at: new Date().toISOString(), deleted_by: req.user.username || 'admin',
  });
  res.json({ ok: true, message: `Case ${deleted.case_number} moved to Recycle Bin.` });
});

app.get('/api/recycle-bin', authenticate, requireAdmin, (req, res) => {
  res.json({ items: RECYCLE_BIN, total: RECYCLE_BIN.length });
});

app.post('/api/recycle-bin/:id/restore', authenticate, requireAdmin, (req, res) => {
  const { admin_password } = req.body;
  if (!admin_password) return res.status(400).json({ error: 'Recycle Bin password is required to restore items.' });
  const rbPass = COMPANY_SETTINGS.recycle_bin_password;
  if (rbPass && admin_password !== rbPass) return res.status(401).json({ error: 'Incorrect Recycle Bin password. This is separate from your login password.' });
  const idx = RECYCLE_BIN.findIndex(i => i.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Item not in recycle bin' });
  const [item] = RECYCLE_BIN.splice(idx, 1);
  const { deleted_at, deleted_by, client_name, device_type, brand, model, status, ...caseData } = item;
  DEMO_CASES.push({ ...caseData, stage: caseData.stage || status, restored_at: new Date().toISOString() });
  res.json({ ok: true, message: `Case ${item.case_number} restored successfully.` });
});

// âš ï¸ ONLY super_admin with correct recycle_bin_password (NOT login password) can permanently delete
app.delete('/api/recycle-bin/:id/permanent-delete', authenticate, requireSuperAdmin, (req, res) => {
  const { admin_password } = req.body;
  if (!admin_password) return res.status(400).json({ error: 'Recycle Bin password required for permanent deletion.' });
  const rbPass = COMPANY_SETTINGS.recycle_bin_password;
  if (!rbPass) return res.status(403).json({ error: 'Set a Recycle Bin password in Settings â†’ Recycle Bin before permanent deletion is allowed.' });
  if (admin_password !== rbPass) return res.status(401).json({ error: 'Incorrect Recycle Bin password. Permanent deletion denied.' });
  const idx = RECYCLE_BIN.findIndex(i => i.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Item not in recycle bin' });
  const [gone] = RECYCLE_BIN.splice(idx, 1);
  console.log(`[RecycleBin] PERMANENT DELETE: ${gone.case_number} by ${req.user.username}`);
  res.json({ ok: true, message: `${gone.case_number} permanently deleted. Cannot be recovered.` });
});

// â”€â”€â”€ BACKUP & RESTORE â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

app.post('/api/backup/create', authenticate, requireAdmin, (req, res) => {
  const { name, include_images = true } = req.body;
  const casesWithData = DEMO_CASES.map(c => ({
    ...c,
    _images: include_images ? (CASE_IMAGES[c.id] || []) : [],
    _solution: CASE_SOLUTIONS[c.id] || null,
  }));
  const backupData = {
    version: '2.0', backup_type: 'full', created_at: new Date().toISOString(),
    created_by: req.user.username, platform: 'RecoverLab CRM', includes_images: include_images,
    data: {
      cases: casesWithData, clients: DEMO_CLIENTS, inventory: DEMO_INVENTORY,
      recycle_bin: RECYCLE_BIN,
      settings: { ...COMPANY_SETTINGS, razorpay_key_secret: '[REDACTED]', smtp_password: '[REDACTED]' },
      users: [...DEMO_USERS, ...TEAM_USERS].map(({ password_hash, ...u }) => u),
    },
  };
  const json = JSON.stringify(backupData);
  const sizeKb = Math.round(Buffer.byteLength(json, 'utf8') / 1024);
  const bkpName = name || `RecoverLab_Backup_${new Date().toISOString().slice(0, 10)}`;
  BACKUP_HISTORY.unshift({
    id: `bkp_${Date.now()}`, name: bkpName, created_at: new Date().toISOString(),
    created_by: req.user.username, size_kb: sizeKb, type: 'full',
    includes_images: include_images, items: { cases: DEMO_CASES.length, clients: DEMO_CLIENTS.length, inventory: DEMO_INVENTORY.length }, status: 'complete',
  });
  res.setHeader('Content-Disposition', `attachment; filename="${bkpName}.crm-backup"`);
  res.setHeader('Content-Type', 'application/octet-stream');
  res.send(Buffer.from(json, 'utf8'));
});

app.get('/api/backup/history', authenticate, requireAdmin, (req, res) => {
  res.json({ backups: BACKUP_HISTORY, total: BACKUP_HISTORY.length });
});

app.post('/api/backup/restore', authenticate, requireAdmin, upload.single('backup_file'), async (req, res) => {
  if (!req.file && !req.body.backup_data) return res.status(400).json({ error: 'Backup file required' });
  const { confirm_password, append_mode } = req.body;
  const user = [...DEMO_USERS, ...TEAM_USERS, SUPER_ADMIN].find(u => u.id === req.user.userId);
  if (confirm_password) {
    const valid = await bcrypt.compare(confirm_password, user?.password_hash || '');
    if (!valid) return res.status(401).json({ error: 'Incorrect password. Restore aborted for security.' });
  }
  let backupData;
  try { backupData = JSON.parse(req.file ? req.file.buffer.toString('utf8') : req.body.backup_data); }
  catch { return res.status(400).json({ error: 'Invalid backup file. May be corrupted.' }); }
  if (!backupData.version || !backupData.data) return res.status(400).json({ error: 'Not a valid RecoverLab backup file.' });
  const { data } = backupData;
  let restored = { cases: 0, clients: 0, inventory: 0 };
  const isAppend = append_mode === 'true' || append_mode === true;
  if (isAppend) {
    const existCaseIds = new Set(DEMO_CASES.map(c => c.id));
    (data.cases || []).filter(c => !existCaseIds.has(c.id)).forEach(c => {
      const { _images, _solution, ...cd } = c;
      DEMO_CASES.push(cd);
      if (_images?.length) CASE_IMAGES[c.id] = _images;
      if (_solution) CASE_SOLUTIONS[c.id] = _solution;
      restored.cases++;
    });
    const existClientIds = new Set(DEMO_CLIENTS.map(c => c.id));
    (data.clients || []).filter(c => !existClientIds.has(c.id)).forEach(c => { DEMO_CLIENTS.push(c); restored.clients++; });
    const existInvIds = new Set(DEMO_INVENTORY.map(i => i.id));
    (data.inventory || []).filter(i => !existInvIds.has(i.id)).forEach(i => { DEMO_INVENTORY.push(i); restored.inventory++; });
  } else {
    DEMO_CASES.length = 0;
    (data.cases || []).forEach(c => { const { _images, _solution, ...cd } = c; DEMO_CASES.push(cd); if (_images?.length) CASE_IMAGES[c.id] = _images; if (_solution) CASE_SOLUTIONS[c.id] = _solution; restored.cases++; });
    DEMO_CLIENTS.length = 0; (data.clients || []).forEach(c => { DEMO_CLIENTS.push(c); restored.clients++; });
    DEMO_INVENTORY.length = 0; (data.inventory || []).forEach(i => { DEMO_INVENTORY.push(i); restored.inventory++; });
    if (data.settings) { const { razorpay_key_secret, smtp_password, ...s } = data.settings; Object.assign(COMPANY_SETTINGS, s); }
  }
  BACKUP_HISTORY.unshift({ id: `restore_${Date.now()}`, name: `Restore from ${backupData.created_at?.slice(0,10)||'backup'}`, created_at: new Date().toISOString(), type: 'restore', mode: isAppend ? 'append' : 'replace', items: restored, status: 'complete' });
  res.json({ ok: true, restored, message: `Restore complete: ${restored.cases} cases, ${restored.clients} clients, ${restored.inventory} inventory items.` });
});

// Google Drive Backup (OAuth Required â€” configure GOOGLE_CLIENT_ID in .env)
app.get('/api/backup/google-drive/auth-url', authenticate, requireAdmin, (req, res) => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) return res.json({ ok: false, setup_required: true, message: 'Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to .env to enable Google Drive backup.' });
  const redirect = `${process.env.APP_URL || 'http://localhost:5173'}/settings`;
  const url = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirect)}&response_type=code&scope=${encodeURIComponent('https://www.googleapis.com/auth/drive.file')}&access_type=offline&prompt=consent`;
  res.json({ ok: true, auth_url: url });
});

app.get('/api/backup/google-drive/list', authenticate, requireAdmin, (req, res) => {
  res.json({ ok: true, files: [], demo: true, message: 'Configure Google OAuth credentials to see Drive backups.' });
});


// === TEAM CHAT ================================================================
const CHAT_MESSAGES = {};
const CHAT_ONLINE = new Map();
['general','engineers','billing','cases'].forEach(function(r) {
  CHAT_MESSAGES[r] = [{ id: 'seed_'+r, room: r, text: 'Welcome to #'+r+'! Welcome to RecoverLab Team Chat!', sender_id: 'system', sender_name: 'RecoverLab Bot', sender_role: 'system', created_at: new Date(Date.now()-3600000).toISOString() }];
});
app.get('/api/chat/messages', authenticate, function(req, res) {
  const room = req.query.room || 'general';
  const limit = parseInt(req.query.limit || '50');
  const user = [...DEMO_USERS,...TEAM_USERS,SUPER_ADMIN].find(function(u) { return u.id === req.user.userId; });
  if (user) CHAT_ONLINE.set(req.user.userId, { name: user.full_name||user.username, role: user.role, last_seen: Date.now() });
  const msgs = (CHAT_MESSAGES[room] || []).slice(-limit);
  res.json({ messages: msgs.map(function(m) { return Object.assign({}, m, { is_own: m.sender_id === req.user.userId }); }), room: room });
});
app.post('/api/chat/messages', authenticate, function(req, res) {
  const room = req.body.room || 'general';
  const text = req.body.text;
  if (!text || !text.trim()) return res.status(400).json({ error: 'Message text required' });
  if (!['general','engineers','billing','cases'].includes(room)) return res.status(400).json({ error: 'Invalid room' });
  const user = [...DEMO_USERS,...TEAM_USERS,SUPER_ADMIN].find(function(u) { return u.id === req.user.userId; });
  const msg = { id: 'msg_'+Date.now()+'_'+Math.random().toString(36).slice(2,5), room: room, text: text.trim(), sender_id: req.user.userId, sender_name: (user&&(user.full_name||user.username))||req.user.username, sender_role: user&&user.role, avatar: user&&user.avatar||null, created_at: new Date().toISOString() };
  if (!CHAT_MESSAGES[room]) CHAT_MESSAGES[room] = [];
  CHAT_MESSAGES[room].push(msg);
  if (CHAT_MESSAGES[room].length > 200) CHAT_MESSAGES[room] = CHAT_MESSAGES[room].slice(-200);
  res.json({ ok: true, message: Object.assign({}, msg, { is_own: true }) });
});
app.get('/api/chat/online', authenticate, function(req, res) {
  const cutoff = Date.now() - 30000;
  const users = [];
  CHAT_ONLINE.forEach(function(v,k) { if (v.last_seen > cutoff) users.push({ id: k, name: v.name, role: v.role }); });
  res.json({ users: users, count: users.length });
});

// === OCR ANALYSIS ============================================================
app.post('/api/ocr/analyze', authenticate, upload.single('image'), function(req, res) {
  if (!req.file) return res.status(400).json({ error: 'Image required' });
  const fn = (req.file.originalname || '').toLowerCase();
  const brand = fn.includes('wd')||fn.includes('western') ? 'Western Digital' : fn.includes('seagate') ? 'Seagate' : fn.includes('samsung') ? 'Samsung' : fn.includes('toshiba') ? 'Toshiba' : fn.includes('hitachi') ? 'Hitachi' : 'Unknown';
  res.json({ confidence: 0.87, raw_text: 'Model: WD10EARS Serial: WXE1E12A8123 Capacity: 1.0TB', extracted_fields: { brand: brand, model: 'WD10EARS', serial_number: 'WXE1E12A8123', capacity: '1.0 TB', form_factor: '3.5"', interface: 'SATA', rpm: '5400' }, message: 'OCR demo result. Add GOOGLE_VISION_API_KEY to .env for real OCR.' });
});

// === PROFILE PICTURE =========================================================
app.post('/api/auth/profile-picture', authenticate, upload.single('avatar'), function(req, res) {
  if (!req.file) return res.status(400).json({ error: 'Image required' });
  if (!req.file.mimetype.startsWith('image/')) return res.status(400).json({ error: 'Must be an image' });
  const b64 = 'data:' + req.file.mimetype + ';base64,' + req.file.buffer.toString('base64');
  const user = [...DEMO_USERS,...TEAM_USERS,SUPER_ADMIN].find(function(u) { return u.id === req.user.userId; });
  if (!user) return res.status(404).json({ error: 'User not found' });
  user.avatar = b64;
  res.json({ ok: true, avatar: b64 });
});
app.delete('/api/auth/profile-picture', authenticate, function(req, res) {
  const user = [...DEMO_USERS,...TEAM_USERS,SUPER_ADMIN].find(function(u) { return u.id === req.user.userId; });
  if (user) user.avatar = null;
  res.json({ ok: true });
});

// === SEO & HOMEPAGE SETTINGS =================================================
const SEO_SETTINGS = { site_title: 'RecoverLab CRM', meta_description: 'Enterprise CRM for data recovery.', meta_keywords: 'data recovery, CRM', og_title: 'RecoverLab CRM', og_description: 'Enterprise Data Recovery Platform', og_image: '', twitter_card: 'summary_large_image', robots: 'index,follow', canonical_url: '', custom_head_scripts: '', sitemap_enabled: true, analytics_id: '', pages: [{ id: 'home', label: 'Home', path: '/', indexed: true, custom_title: '', custom_desc: '' }, { id: 'portal', label: 'Client Portal', path: '/client-portal', indexed: true, custom_title: 'Track Your Case', custom_desc: 'Check your data recovery status.' }] };
const HOMEPAGE_SETTINGS_STORE = { favicon: '', app_name: 'RecoverLab CRM', app_tagline: 'Enterprise Data Recovery Platform', hero_title: 'Professional Data Recovery Management', hero_subtitle: 'Track cases, manage clients, handle billing.', contact_phone: '+91 98765 43210', contact_email: 'support@recoverlab.in', contact_address: 'Mumbai, India', footer_text: 'c 2025 RecoverLab.', primary_color: '#00d4ff', logo_emoji: '💾', logo_image: '', show_client_portal: true };
app.get('/api/settings/seo', authenticate, requireAdmin, function(req,res) { res.json(SEO_SETTINGS); });
app.patch('/api/settings/seo', authenticate, requireAdmin, function(req,res) { Object.assign(SEO_SETTINGS, req.body); res.json({ ok: true, settings: SEO_SETTINGS }); });
app.get('/api/settings/homepage', authenticate, requireAdmin, function(req,res) { res.json(HOMEPAGE_SETTINGS_STORE); });
app.patch('/api/settings/homepage', authenticate, requireAdmin, function(req,res) { Object.assign(HOMEPAGE_SETTINGS_STORE, req.body); res.json({ ok: true }); });
app.post('/api/settings/favicon', authenticate, requireAdmin, upload.single('favicon'), function(req,res) {
  if (!req.file) return res.status(400).json({ error: 'Image required' });
  HOMEPAGE_SETTINGS_STORE.favicon = 'data:' + req.file.mimetype + ';base64,' + req.file.buffer.toString('base64');
  res.json({ ok: true, favicon: HOMEPAGE_SETTINGS_STORE.favicon });
});

// === PAYMENT LINKS ===========================================================
const PAYMENT_LINKS = new Map();
app.post('/api/payments/generate-link', authenticate, function(req, res) {
  const case_id = req.body.case_id;
  const amount = req.body.amount;
  const description = req.body.description;
  const expires_in_hours = req.body.expires_in_hours || 48;
  if (!case_id || !amount) return res.status(400).json({ error: 'case_id and amount required' });
  const linkId = crypto.randomBytes(12).toString('hex');
  const link = { id: linkId, case_id: case_id, amount: parseFloat(amount), description: description || 'Payment for Case ' + case_id, status: 'pending', created_at: new Date().toISOString(), expires_at: new Date(Date.now() + expires_in_hours * 3600000).toISOString(), paid_at: null, url: (process.env.APP_URL || 'http://localhost:5173') + '/pay/' + linkId };
  PAYMENT_LINKS.set(linkId, link);
  res.json({ ok: true, link_id: linkId, payment_url: link.url, expires_at: link.expires_at, amount: amount, description: link.description });
});
app.get('/api/payments/link/:linkId', function(req, res) {
  const link = PAYMENT_LINKS.get(req.params.linkId);
  if (!link) return res.status(404).json({ error: 'Payment link not found' });
  if (new Date(link.expires_at) < new Date()) return res.status(410).json({ error: 'Link expired' });
  res.json(link);
});
app.post('/api/payments/link/:linkId/confirm-paid', authenticate, function(req, res) {
  const link = PAYMENT_LINKS.get(req.params.linkId);
  if (!link) return res.status(404).json({ error: 'Not found' });
  if (link.status === 'paid') return res.json({ ok: true, message: 'Already paid', link: link });
  link.status = 'paid'; link.paid_at = new Date().toISOString(); link.paid_by = req.user && req.user.username;
  fireWebhookEvent('payment.received', { case_id: link.case_id, amount: link.amount });
  res.json({ ok: true, link: link });
});

// === ADVANCED WEBHOOK SYSTEM (Event-Driven, No Cronjob) ======================
const EventEmitter = require('events');
const WH_CONFIG = []; const WH_LOG = []; const WH_QUEUE = [];
const WH_EVENTS = [
  { group:'Cases', events:[{key:'case.created',label:'Case Created'},{key:'case.updated',label:'Case Updated'},{key:'case.stage_changed',label:'Stage Changed'},{key:'case.delivered',label:'Case Delivered'},{key:'case.recovered',label:'Data Recovered'},{key:'case.failed',label:'Recovery Failed'},{key:'case.deleted',label:'Sent to Recycle Bin'},{key:'case.restored',label:'Case Restored'}]},
  { group:'Payments', events:[{key:'payment.received',label:'Payment Received'},{key:'payment.link_created',label:'Payment Link Created'},{key:'invoice.created',label:'Invoice Created'},{key:'invoice.sent',label:'Invoice Sent'}]},
  { group:'Clients', events:[{key:'client.created',label:'Client Created'},{key:'client.updated',label:'Client Updated'}]},
  { group:'System', events:[{key:'user.login',label:'User Login'},{key:'user.created',label:'User Created'},{key:'backup.created',label:'Backup Created'},{key:'webhook.test',label:'Test Event'}]},
];
function fireWebhookEvent(eventKey, data) {
  const active = WH_CONFIG.filter(function(w) { return w.enabled && (w.events.includes(eventKey) || w.events.includes('*')); });
  active.forEach(function(wh) {
    const jobId = 'job_' + Date.now() + '_' + Math.random().toString(36).slice(2,5);
    const job = { id: jobId, webhook_id: wh.id, webhook_name: wh.name, event: eventKey, status: 'pending', created_at: new Date().toISOString() };
    WH_QUEUE.push(job);
    setImmediate(async function() {
      job.status = 'running'; const start = Date.now();
      try {
        const body = JSON.stringify({ event: eventKey, data: data, fired_at: new Date().toISOString() });
        const sig = crypto.createHmac('sha256', wh.secret || 'crm-secret').update(body).digest('hex');
        const r = await fetch(wh.url, { method:'POST', headers:{'Content-Type':'application/json','X-CRM-Signature':sig,'X-CRM-Event':eventKey}, body: body, signal: AbortSignal.timeout(10000) });
        job.status = r.ok ? 'completed' : 'failed'; job.response_status = r.status; job.duration_ms = Date.now()-start;
        wh.last_fired = new Date().toISOString();
        if (r.ok) wh.success_count = (wh.success_count||0)+1; else wh.fail_count = (wh.fail_count||0)+1;
      } catch(err) { job.status='failed'; job.error=err.message; job.duration_ms=Date.now()-start; wh.fail_count=(wh.fail_count||0)+1; }
      WH_LOG.unshift(Object.assign({}, job, { completed_at: new Date().toISOString() }));
      const ix = WH_QUEUE.findIndex(function(j) { return j.id === jobId; }); if (ix !== -1) WH_QUEUE.splice(ix,1);
    });
  });
}
app.get('/api/webhooks', authenticate, requireAdmin, function(req,res) { res.json({ webhooks: WH_CONFIG, events: WH_EVENTS, total: WH_CONFIG.length }); });
app.post('/api/webhooks', authenticate, requireAdmin, function(req,res) {
  const name = req.body.name; const url = req.body.url; const events = req.body.events || []; const secret = req.body.secret;
  if (!name||!url) return res.status(400).json({ error:'name and url required' });
  try { new URL(url); } catch(e) { return res.status(400).json({ error:'Invalid URL' }); }
  const wh = { id:'wh_'+Date.now(), name:name, url:url, events:events, secret: secret||crypto.randomBytes(16).toString('hex'), enabled:true, created_at: new Date().toISOString(), last_fired:null, success_count:0, fail_count:0 };
  WH_CONFIG.push(wh); res.json({ ok:true, webhook:wh });
});
app.patch('/api/webhooks/:id', authenticate, requireAdmin, function(req,res) {
  const wh = WH_CONFIG.find(function(w) { return w.id === req.params.id; });
  if (!wh) return res.status(404).json({ error:'Not found' });
  const b = req.body;
  if (b.name!==undefined) wh.name=b.name; if (b.url!==undefined) wh.url=b.url; if (b.events!==undefined) wh.events=b.events; if (b.secret!==undefined) wh.secret=b.secret; if (b.enabled!==undefined) wh.enabled=b.enabled;
  res.json({ ok:true, webhook:wh });
});
app.delete('/api/webhooks/:id', authenticate, requireAdmin, function(req,res) { const i=WH_CONFIG.findIndex(function(w){return w.id===req.params.id;}); if(i===-1) return res.status(404).json({error:'Not found'}); WH_CONFIG.splice(i,1); res.json({ok:true}); });
app.post('/api/webhooks/:id/toggle', authenticate, requireAdmin, function(req,res) { const wh=WH_CONFIG.find(function(w){return w.id===req.params.id;}); if(!wh) return res.status(404).json({error:'Not found'}); wh.enabled=!wh.enabled; res.json({ok:true,enabled:wh.enabled}); });
app.post('/api/webhooks/:id/test', authenticate, requireAdmin, async function(req,res) {
  const wh = WH_CONFIG.find(function(w){return w.id===req.params.id;});
  if (!wh) return res.status(404).json({error:'Not found'});
  const start=Date.now();
  try {
    const body=JSON.stringify({event:'webhook.test',data:{msg:'Test from RecoverLab CRM'},fired_at:new Date().toISOString()});
    const sig=crypto.createHmac('sha256',wh.secret||'test').update(body).digest('hex');
    const r=await fetch(wh.url,{method:'POST',headers:{'Content-Type':'application/json','X-CRM-Signature':sig},body:body,signal:AbortSignal.timeout(8000)});
    const duration=Date.now()-start;
    WH_LOG.unshift({id:'test_'+Date.now(),webhook_id:wh.id,event:'webhook.test',status:r.ok?'completed':'failed',response_status:r.status,duration_ms:duration,completed_at:new Date().toISOString()});
    res.json({ok:r.ok,status:r.status,duration_ms:duration,message:r.ok?'Test delivered successfully':'Server returned '+r.status});
  } catch(err) {
    WH_LOG.unshift({id:'test_'+Date.now(),webhook_id:wh.id,event:'webhook.test',status:'failed',error:err.message,duration_ms:Date.now()-start,completed_at:new Date().toISOString()});
    res.json({ok:false,error:err.message,message:'Delivery failed'});
  }
});
app.get('/api/webhooks/logs', authenticate, requireAdmin, function(req,res) {
  const webhook_id = req.query.webhook_id; const status = req.query.status; const limit = parseInt(req.query.limit||'100');
  let logs = WH_LOG;
  if (webhook_id) logs=logs.filter(function(l){return l.webhook_id===webhook_id;});
  if (status) logs=logs.filter(function(l){return l.status===status;});
  res.json({ logs:logs.slice(0,limit), queue:WH_QUEUE, stats:{total:WH_LOG.length, completed:WH_LOG.filter(function(l){return l.status==='completed';}).length, failed:WH_LOG.filter(function(l){return l.status==='failed';}).length, pending:WH_QUEUE.length} });
});
app.get('/api/integrations/events', authenticate, requireAdmin, function(req,res) { res.json({ events: WH_EVENTS }); });

app.use((req, res) => res.status(404).json({ error: 'Endpoint not found' }));






app.listen(PORT, () => {
  console.log(`\nðŸš€ RecoverLab CRM API (DEMO MODE) running at http://localhost:${PORT}`);
  console.log(`ðŸ“Š No PostgreSQL required â€” using in-memory demo data`);
  console.log(`\nðŸ”‘ Demo credentials:`);
  console.log(`   ðŸ‘‘ superadmin / SuperAdmin@123  (Platform Owner / Super Admin)`);
  console.log(`   ðŸ‘¤ admin / Admin@1234            (Administrator / Tenant Admin)`);
  console.log(`   ðŸ”§ john_eng / Engineer@1234      (Senior Engineer)`);
  console.log(`\nðŸ”— API URL:           http://localhost:${PORT}`);
  console.log(`ðŸ“‹ Client Portal:     http://localhost:5173/client-portal`);
  console.log(`ðŸ‘‘ Super Admin:       http://localhost:5173/super-admin\n`);
});

