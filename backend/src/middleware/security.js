/* middleware/security.js
 * SECURITY FIXES:
 *  A03 – mongoSanitize now covers req.query via safe copy (was explicitly skipped)
 *  A04 – authLimiter now only applied to login/forgot-password (not entire auth router)
 *  A04 – Redis-ready rate limiter store configuration
 *  A05 – cookie-parser added so httpOnly refresh token cookies can be read
 */
import helmetPkg from 'helmet';
import corsPkg from 'cors';
import { rateLimit } from 'express-rate-limit';
import mongoSanitizePkg from 'express-mongo-sanitize';
import hppPkg from 'hpp';
import compressionPkg from 'compression';
import cookieParserPkg from 'cookie-parser';

// ─── CORS ────────────────────────────────────────────────────────────────────
const corsOptions = {
  origin: process.env.CLIENT_ORIGIN || 'http://localhost:3000',
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  credentials: true,           // required for cookies
  optionsSuccessStatus: 204,
};

// ─── Rate limiters ───────────────────────────────────────────────────────────
// FIX A04: General limiter unchanged
export const generalLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 900000, // 15 min
  max: parseInt(process.env.RATE_LIMIT_MAX, 10) || 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { status: 'fail', message: 'Too many requests. Please try again later.' },
});

// FIX A04: Auth limiter is EXPORTED and applied ONLY to specific routes
// (login, forgot-password) — NOT the entire auth router
// In production, replace the default memory store with Redis:
//   import RedisStore from 'rate-limit-redis';
//   store: new RedisStore({ sendCommand: (...args) => redisClient.sendCommand(args) })
export const authLimiter = rateLimit({
  windowMs: 600000,  // 10 min
  max: parseInt(process.env.AUTH_RATE_LIMIT_MAX, 10) || 10,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true, // only count failed attempts toward limit
  message: { status: 'fail', message: 'Too many login attempts. Please try again later.' },
});

// ─── Mongo sanitize middleware ────────────────────────────────────────────────
// FIX A03: Now sanitizes req.query too (creates a safe sanitized copy)
export const mongoSanitize = (req, res, next) => {
  const { sanitize } = mongoSanitizePkg;

  if (req.body)   req.body   = sanitize(req.body);
  if (req.params) {
    Object.keys(req.params).forEach(k => {
      req.params[k] = sanitize(req.params[k]);
    });
  }

  // FIX A03: Sanitize query by building a new object (req.query is read-only)
  if (req.query) {
    const sanitizedQuery = {};
    for (const [key, value] of Object.entries(req.query)) {
      sanitizedQuery[key] = sanitize(value);
    }
    // Replace req.query via Object.defineProperty to bypass read-only guard
    Object.defineProperty(req, 'query', {
      value: sanitizedQuery,
      writable: true,
      configurable: true,
    });
  }

  next();
};

// ─── Regex-safe escape helper ─────────────────────────────────────────────────
// FIX A03: Exported for use in controllers that build RegExp from user input
// Usage: new RegExp(escapeRegex(userInput), 'i')
export const escapeRegex = (str) =>
  String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// ─── Export middleware ────────────────────────────────────────────────────────
export const helmet      = helmetPkg();
export const cors        = corsPkg(corsOptions);
export const hpp         = hppPkg();
export const compression = compressionPkg();
export const cookieParser = cookieParserPkg();
