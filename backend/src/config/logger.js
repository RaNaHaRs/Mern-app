const winston = require('winston');
require('winston-daily-rotate-file');
const path = require('path');
const { wrapLogger } = require('../utils/logMasking');

const logDir = path.join(__dirname, '../../logs');

const formats = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'HH:mm:ss' }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    const metaStr = Object.keys(meta).length ? ' ' + JSON.stringify(meta) : '';
    return `${timestamp} [${level}] ${message}${metaStr}`;
  })
);

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: formats,
  transports: [
    new winston.transports.Console({ format: consoleFormat }),
    new winston.transports.DailyRotateFile({
      dirname: logDir,
      filename: 'app-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      maxSize: '20m',
      maxFiles: '30d',
      level: 'info'
    }),
    new winston.transports.DailyRotateFile({
      dirname: logDir,
      filename: 'error-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      maxSize: '20m',
      maxFiles: '90d',
      level: 'error'
    })
  ]
});

// ─── Apply Sensitive Data Masking ───────────────────────────────
// Wraps logger methods to automatically mask sensitive data before logging
wrapLogger(logger);

module.exports = logger;
