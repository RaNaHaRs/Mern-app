const multer = require('multer');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');
const logger = require('../config/logger');

const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, '../../uploads');
const MAX_FILE_SIZE = parseInt(process.env.MAX_FILE_SIZE || '104857600'); // 100MB default

// Allowed MIME types (whitelist)
const ALLOWED_TYPES = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'application/pdf': 'pdf',
  'text/plain': 'txt',
  'text/csv': 'csv',
  'application/zip': 'zip',
  'application/x-rar-compressed': 'rar',
  'application/x-7z-compressed': '7z',
  'application/octet-stream': 'bin',
  'image/tiff': 'tiff',
  'image/webp': 'webp',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
};

// Dangerous file extensions to block (double extension attacks)
const BLOCKED_EXTENSIONS = [
  '.exe', '.bat', '.cmd', '.com', '.pif', '.scr', '.vbs', '.js',
  '.jar', '.zip', '.rar', '.7z', '.tar', '.gz',
  '.php', '.jsp', '.asp', '.aspx', '.phtml',
  '.sh', '.bash', '.zsh', '.ps1', '.psm1',
  '.app', '.deb', '.rpm', '.dmg'
];

/**
 * Validate file extension against dangerous patterns
 * @param {string} filename - Filename to validate
 * @returns {boolean} True if safe
 */
function isFilenameSecure(filename) {
  const ext = path.extname(filename).toLowerCase();
  
  // Check for dangerous extensions
  if (BLOCKED_EXTENSIONS.includes(ext)) {
    return false;
  }
  
  // Check for double extensions (e.g., shell.php.jpg)
  const name = path.basename(filename, ext).toLowerCase();
  const doubleExt = path.extname(name).toLowerCase();
  if (BLOCKED_EXTENSIONS.includes(doubleExt)) {
    return false;
  }
  
  // Check for null bytes (path traversal attempt)
  if (filename.includes('\x00')) {
    return false;
  }
  
  // Check for path traversal patterns
  if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
    return false;
  }
  
  return true;
}

/**
 * Validate file content by checking magic bytes
 * @param {Buffer} buffer - File buffer
 * @param {string} mimetype - Expected MIME type
 * @returns {boolean} True if content matches MIME type
 */
function validateFileContent(buffer, mimetype) {
  if (!buffer || buffer.length === 0) {
    return false;
  }
  
  const magicNumbers = {
    'image/jpeg': [0xFF, 0xD8, 0xFF],
    'image/png': [0x89, 0x50, 0x4E, 0x47],
    'image/gif': [0x47, 0x49, 0x46],
    'application/pdf': [0x25, 0x50, 0x44, 0x46], // %PDF
    'application/zip': [0x50, 0x4B, 0x03, 0x04], // PK..
    'application/x-7z-compressed': [0x37, 0x7A, 0xBC, 0xAF], // 7z..
  };
  
  const magic = magicNumbers[mimetype];
  if (!magic) {
    // No magic bytes defined for this type, allow by default
    return true;
  }
  
  // Check if buffer starts with magic bytes
  for (let i = 0; i < magic.length; i++) {
    if (buffer[i] !== magic[i]) {
      return false;
    }
  }
  
  return true;
}

// Ensure upload dirs exist and are isolated outside web root
['reports', 'recovered', 'client_data', 'images', 'diagnostic', 'other'].forEach(dir => {
  const dirPath = path.join(UPLOAD_DIR, dir);
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true, mode: 0o700 }); // 700: owner only
  }
});

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const fileType = req.body.file_type || 'other';
    const typeMap = {
      report: 'reports',
      recovered_data: 'recovered',
      client_data: 'client_data',
      image: 'images',
      diagnostic: 'diagnostic',
    };
    const dir = path.join(UPLOAD_DIR, typeMap[fileType] || 'other');
    
    // Normalize path to prevent traversal
    const normalizedDir = path.normalize(dir);
    const normalizedUploadDir = path.normalize(UPLOAD_DIR);
    
    if (!normalizedDir.startsWith(normalizedUploadDir)) {
      return cb(new Error('Invalid upload directory'), null);
    }
    
    cb(null, normalizedDir);
  },
  filename: (req, file, cb) => {
    // Generate secure filename: random hex + timestamp + original extension
    const ext = path.extname(file.originalname).toLowerCase();
    if (!isFilenameSecure(file.originalname)) {
      return cb(new Error('Unsafe filename detected'), null);
    }
    
    // Sanitize extension
    const safeExt = ext.replace(/[^a-z0-9.]/gi, '');
    const uniqueName = crypto.randomBytes(16).toString('hex') + '_' + Date.now() + safeExt;
    cb(null, uniqueName);
  }
});

const fileFilter = (req, file, cb) => {
  // Whitelist MIME types
  if (!ALLOWED_TYPES[file.mimetype]) {
    logger.warn('File upload rejected: unsupported MIME type', {
      mimetype: file.mimetype,
      filename: file.originalname,
      userId: req.user?.id
    });
    return cb(new Error(`File type not allowed: ${file.mimetype}`), false);
  }
  
  // Validate filename security
  if (!isFilenameSecure(file.originalname)) {
    logger.warn('File upload rejected: unsafe filename', {
      filename: file.originalname,
      userId: req.user?.id
    });
    return cb(new Error('Unsafe filename detected'), false);
  }
  
  cb(null, true);
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: MAX_FILE_SIZE,
    files: 10,
  }
});

/**
 * Middleware to validate uploaded file content
 * Run after multer to check file content matches MIME type
 */
function validateUploadedFile(req, res, next) {
  if (!req.file) {
    return next();
  }
  
  try {
    // Read file buffer to validate content
    const fileBuffer = fs.readFileSync(req.file.path);
    
    if (!validateFileContent(fileBuffer, req.file.mimetype)) {
      logger.warn('File upload rejected: content does not match MIME type', {
        filename: req.file.filename,
        mimetype: req.file.mimetype,
        userId: req.user?.id
      });
      
      // Delete the uploaded file
      fs.unlinkSync(req.file.path);
      
      return res.status(400).json({
        error: 'File content validation failed. File does not match declared type.'
      });
    }
    
    // Scan for viruses (placeholder for ClamAV integration)
    // TODO: Integrate with ClamAV for virus scanning
    // const isSafe = await scanFileWithClamAV(req.file.path);
    // if (!isSafe) { fs.unlinkSync(req.file.path); return error; }
    
    next();
  } catch (err) {
    logger.error('File validation error', { error: err.message });
    // Clean up file on error
    if (req.file?.path && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    res.status(500).json({ error: 'File validation failed' });
  }
}

/**
 * Placeholder for ClamAV virus scanning integration
 * @param {string} filePath - Path to file to scan
 * @returns {Promise<boolean>} True if file is safe
 */
async function scanFileWithClamAV(filePath) {
  // TODO: Implement ClamAV integration
  // Example integration points:
  // const NodeClam = require('clamscan');
  // const clamscan = await new NodeClam().init({...});
  // const { isInfected } = await clamscan.scanFile(filePath);
  // return !isInfected;
  
  logger.debug('ClamAV scan not yet configured. Skipping virus scan.', { filePath });
  return true; // Default to safe until configured
}

module.exports = { 
  upload, 
  UPLOAD_DIR, 
  validateUploadedFile,
  validateFileContent,
  isFilenameSecure,
  scanFileWithClamAV
};
