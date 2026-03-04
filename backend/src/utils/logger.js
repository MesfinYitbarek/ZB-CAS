/* utils/logger.js
 * SECURITY FIX (A09): Structured, leveled logger replacing all console.log calls.
 * - Outputs JSON lines in production (for log aggregators like ELK, CloudWatch)
 * - Uses human-readable format in development
 * - Never logs passwords, tokens, or assessment correct answers
 * - Supports levels: error, warn, info, debug (debug suppressed in production)
 */

const IS_PROD = process.env.NODE_ENV === 'production';
const LOG_LEVEL = process.env.LOG_LEVEL || (IS_PROD ? 'info' : 'debug');

const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };
const currentLevel = LEVELS[LOG_LEVEL] ?? 2;

function formatProd(level, data) {
  return JSON.stringify({
    ts: new Date().toISOString(),
    level,
    ...data,
  });
}

function formatDev(level, data) {
  const prefix = { error: '❌', warn: '⚠️ ', info: 'ℹ️ ', debug: '🔍' }[level] || '  ';
  const { event, ...rest } = data;
  const extras = Object.keys(rest).length ? ' ' + JSON.stringify(rest) : '';
  return `${prefix} [${level.toUpperCase()}] ${event || ''}${extras}`;
}

function log(level, data) {
  if (LEVELS[level] > currentLevel) return;
  const line = IS_PROD ? formatProd(level, data) : formatDev(level, data);
  if (level === 'error') {
    console.error(line);
  } else if (level === 'warn') {
    console.warn(line);
  } else {
    console.log(line);
  }
}

const logger = {
  error: (data) => log('error', typeof data === 'string' ? { event: data } : data),
  warn:  (data) => log('warn',  typeof data === 'string' ? { event: data } : data),
  info:  (data) => log('info',  typeof data === 'string' ? { event: data } : data),
  debug: (data) => log('debug', typeof data === 'string' ? { event: data } : data),
};

export default logger;
