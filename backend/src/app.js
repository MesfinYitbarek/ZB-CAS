/* app.js
 * Express application factory.
 *
 * Middleware order matters – security layers are applied first, then routes,
 * then the 404 catcher, then the global error handler (must be last).
 */

import 'dotenv/config';                     // load .env before anything else
import express from 'express';
import connectDB from './config/database.js';
import errorHandler from './middleware/errorHandler.js';
import AppError from './utils/AppError.js';

// ── Security middleware (pre-built in security.js) ───────────────────────────
import {
  helmet,
  cors,
  generalLimiter,
  mongoSanitize,
  hpp,
  compression as compressMiddleware,
} from './middleware/security.js';

// ── Route modules ─────────────────────────────────────────────────────────────
import authRoutes from './routes/authRoutes.js';
import userRoutes from './routes/userRoutes.js';
import competencyRoutes from './routes/competencyRoutes.js';
import recommendationRoutes from './routes/recommendationRoutes.js';
import questionRoutes from './routes/questionRoutes.js';
import assessmentRoutes from './routes/assessmentRoutes.js';
import responseRoutes from './routes/responseRoutes.js';
import resultRoutes from './routes/resultRoutes.js';
import reportRoutes from './routes/reportRoutes.js';
import feedbackRoutes from './routes/feedbackRoutes.js';
import supervisorRoutes from './routes/supervisorRoutes.js';
import dashboardRoutes from './routes/dashboardRoutes.js';
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
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/competencies', competencyRoutes);
app.use('/api/recommendations', recommendationRoutes);
app.use('/api/questions', questionRoutes);
app.use('/api/assessments', assessmentRoutes);
app.use('/api/responses', responseRoutes);
app.use('/api/results', resultRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/feedback', feedbackRoutes);
app.use('/api/supervisors', supervisorRoutes);
app.use('/api/dashboard', dashboardRoutes);

// ── 404 catcher (must be after all routes) ───────────────────────────────────
app.use((req, res, next) => {
  next(new AppError(`Route ${req.method} ${req.originalUrl} not found.`, 404));
});

// ── Global error handler (must be last) ──────────────────────────────────────
app.use(errorHandler);

// ── Connect DB & start ───────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;

connectDB().then(() => {
  app.listen(PORT, () => {
    console.log(`[Server] ZB-CAS backend running on port ${PORT} (${process.env.NODE_ENV || 'development'})`);
  });
});

// Export for testing
export default app;
