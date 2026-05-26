const multer = require('multer');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');

const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, '../../uploads/solution');
const MAX_FILE_SIZE = parseInt(process.env.SOLUTION_MAX_FILE_SIZE || '104857600', 10);

if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${crypto.randomBytes(12).toString('hex')}_${Date.now()}${ext}`);
  },
});

/** Accept all file types for solution / knowledge-base attachments */
const solutionUpload = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE, files: 20 },
});

module.exports = { solutionUpload, UPLOAD_DIR };
