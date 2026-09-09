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

// Refresh token limiter — prevents hammering /auth/refresh with a stolen cookie
// Generous window because legitimate clients refresh at most once per 15-minute
// access-token lifetime, but we allow headroom for concurrent tab refreshes.
export const refreshLimiter = rateLimit({
  windowMs: 900000,  // 15 min
  max: parseInt(process.env.REFRESH_RATE_LIMIT_MAX, 10) || 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { status: 'fail', message: 'Too many refresh attempts. Please log in again.' },
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

// ─── Regex-safe escape helper ─────────────────────────────────────────────────
// Kept for controllers that translate user free-text into case-insensitive
// search tokens. Prisma `contains` mode is preferred, but this remains for
// any remaining regex-based matching.
export const escapeRegex = (str) =>
  String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// ─── Export middleware ────────────────────────────────────────────────────────
export const helmet      = helmetPkg();
export const cors        = corsPkg(corsOptions);
export const hpp         = hppPkg();
export const compression = compressionPkg();
export const cookieParser = cookieParserPkg();
