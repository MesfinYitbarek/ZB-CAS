/* middleware/security.js
 * Centralised OWASP-aligned security middleware.
 *
 * What each layer does:
 *   helmet          – sets hardening HTTP headers (X-Content-Type-Options,
 *                     Strict-Transport-Security, Content-Security-Policy, …)
 *   cors            – whitelists only the React client origin
 *   rateLimit       – general API throttle (OWASP: brute-force mitigation)
 *   authRateLimit   – tighter throttle on auth endpoints only
 *   mongoSanitize   – strips $ and . from user input (NoSQL injection)
 *   hpp             – keeps only the last value of duplicate query params
 *   compression     – gzip responses (performance + smaller attack surface)
 */
const helmet          = require('helmet');
const cors            = require('cors');
const { rateLimit }   = require('express-rate-limit');
const mongoSanitize   = require('express-mongo-sanitize');
const hpp             = require('hpp');
const compression     = require('compression');

// ─── CORS ────────────────────────────────────────────────────────────────────
const corsOptions = {
  origin: process.env.CLIENT_ORIGIN || 'http://localhost:3000',
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  credentials: true,            // allow cookies (refresh token)
  optionsSuccessStatus: 204,    // some browsers choke on 204 for preflight
};

// ─── Rate limiters ───────────────────────────────────────────────────────────
const generalLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 900000,  // 15 min
  max:      parseInt(process.env.RATE_LIMIT_MAX, 10)       || 100,
  standardHeaders: true,        // X-RateLimit-* headers
  legacyHeaders: false,
  message: { status: 'fail', message: 'Too many requests. Please try again later.' },
});

const authLimiter = rateLimit({
  windowMs: 600000,             // 10 min window for auth routes
  max:      parseInt(process.env.AUTH_RATE_LIMIT_MAX, 10) || 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: { status: 'fail', message: 'Too many login attempts. Please try again later.' },
});

const mongoSanitizeMiddleware = (req, res, next) => {
  // Only sanitize the fields we can safely modify
  const sanitize = require('express-mongo-sanitize').sanitize;
  
  if (req.body) {
    req.body = sanitize(req.body);
  }
  
  if (req.params) {
    Object.keys(req.params).forEach(key => {
      req.params[key] = sanitize(req.params[key]);
    });
  }
  
  // DO NOT touch req.query as it's read-only in newer Node/Express
  next();
};

// ─── Export everything so app.js can apply in order ──────────────────────────
module.exports = {
  helmet:           helmet(),
  cors:             cors(corsOptions),
  generalLimiter,
  authLimiter,
  mongoSanitize: mongoSanitizeMiddleware,
  hpp:              hpp(),
  compression:      compression(),
};
