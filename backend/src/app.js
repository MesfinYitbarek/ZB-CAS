/* app.js
 * Express application factory.
 *
 * Middleware order matters – security layers are applied first, then routes,
 * then the 404 catcher, then the global error handler (must be last).
 *
 * OWASP layers applied (see middleware/security.js for details):
 *   1. helmet           – hardened HTTP headers
 *   2. cors             – origin whitelist
 *   3. compression      – gzip (performance + smaller payloads)
 *   4. generalLimiter   – global rate limit
 *   5. express.json     – body parser (with size cap)
 *   7. mongoSanitize    – NoSQL injection prevention
 *   8. hpp              – HTTP parameter pollution prevention
 */
require('dotenv').config();                     // load .env before anything else

const express      = require('express');
const connectDB    = require('./config/database');
const errorHandler = require('./middleware/errorHandler');
const AppError     = require('./utils/AppError');

// ── Security middleware (pre-built in security.js) ───────────────────────────
const {
  helmet,
  cors,
  generalLimiter,
  mongoSanitize,
  hpp,
  compression: compressMiddleware,
} = require('./middleware/security');

// ── Route modules ─────────────────────────────────────────────────────────────
const authRoutes           = require('./routes/authRoutes');
const userRoutes           = require('./routes/userRoutes');
const competencyRoutes     = require('./routes/competencyRoutes');
const recommendationRoutes = require('./routes/recommendationRoutes');
const questionRoutes       = require('./routes/questionRoutes');
const assessmentRoutes     = require('./routes/assessmentRoutes');
const responseRoutes       = require('./routes/responseRoutes');
const resultRoutes         = require('./routes/resultRoutes');
const reportRoutes         = require('./routes/reportRoutes');
const feedbackRoutes       = require('./routes/feedbackRoutes');
const supervisorRoutes       = require('./routes/supervisorRoutes');

// ── Bootstrap ─────────────────────────────────────────────────────────────────
const app = express();

// 1. Security headers
app.use(helmet);

// 2. CORS
app.use(cors);

// 3. Compression
app.use(compressMiddleware);

// 4. General rate limiter (applies to every route)
app.use(generalLimiter);

// 5. Body parser – cap at 1 MB to prevent large-payload DoS
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// 7. NoSQL injection protection
app.use(mongoSanitize);

// 8. HTTP parameter pollution
app.use(hpp);

// ── Health check (no auth required) ──────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ── Mount routes ──────────────────────────────────────────────────────────────
app.use('/api/auth',            authRoutes);
app.use('/api/users',           userRoutes);
app.use('/api/competencies',    competencyRoutes);
app.use('/api/recommendations', recommendationRoutes);
app.use('/api/questions',       questionRoutes);
app.use('/api/assessments',     assessmentRoutes);
app.use('/api/responses',       responseRoutes);
app.use('/api/results',         resultRoutes);
app.use('/api/reports',         reportRoutes);
app.use('/api/feedback',        feedbackRoutes);
app.use('/api/supervisors',        supervisorRoutes);

// ── 404 catcher (must be after all routes) ───────────────────────────────────
app.use((req, res, next) => {
  next(new AppError(`Route ${req.method} ${req.originalUrl} not found.`, 404));
});

// ── Global error handler (must be last) ──────────────────────────────────────
app.use(errorHandler);

// ── Connect DB & start ────────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;

connectDB().then(() => {
  app.listen(PORT, () => {
    console.log(`[Server] ZB-CAS backend running on port ${PORT} (${process.env.NODE_ENV || 'development'})`);
  });
});

module.exports = app;   // exported for testing
