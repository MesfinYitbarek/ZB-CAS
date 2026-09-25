/* app.js
 * SECURITY FIXES:
 *  A02/A05 – cookieParser added so httpOnly refresh token cookies can be read
 *  A06     – package.json pinned to exact Express version (see package.json)
 *  A09     – startup log uses structured logger
 *
 * REAL-TIME CHAT:
 *  Socket.IO mounted on the same HTTP server for WebSocket support.
 *  See src/services/socketService.js
 */
import 'dotenv/config';
import http from 'http';
import express from 'express';
import { initSocket } from './services/socketService.js';
import { startScheduler } from './services/schedulerService.js';
import connectDB from './config/database.js';
import errorHandler from './middleware/errorHandler.js';
import AppError from './utils/AppError.js';
import logger from './utils/logger.js';

import {
  helmet,
  cors,
  generalLimiter,
  hpp,
  compression as compressMiddleware,
  cookieParser,
} from './middleware/security.js';

import authRoutes           from './routes/authRoutes.js';
import userRoutes           from './routes/userRoutes.js';
import competencyRoutes     from './routes/competencyRoutes.js';
import recommendationRoutes from './routes/recommendationRoutes.js';
import questionRoutes       from './routes/questionRoutes.js';
import assessmentRoutes     from './routes/assessmentRoutes.js';
import responseRoutes       from './routes/responseRoutes.js';
import resultRoutes         from './routes/resultRoutes.js';
import reportRoutes         from './routes/reportRoutes.js';
import feedbackRoutes       from './routes/feedbackRoutes.js';
import supervisorRoutes     from './routes/supervisorRoutes.js';
import dashboardRoutes      from './routes/dashboardRoutes.js';
import chatRoutes           from './routes/chatRoutes.js';
import faqRoutes            from './routes/faqRoutes.js';
import externalRoutes       from './routes/externalRoutes.js';
import notificationRoutes   from './routes/notificationRoutes.js';
import activityRoutes       from './routes/activityRoutes.js';

const app = express();

// Trust the first proxy hop (required on Render, Railway, Heroku, and any
// platform that sits behind a load-balancer / reverse-proxy).
// Without this, express-rate-limit sees X-Forwarded-For but Express won't
// 
// // expose req.ip correctly AND throws ERR_ERL_UNEXPECTED_X_FORWARDED_FOR.
// '1' means "trust exactly one proxy in front of us" — correct for Render.
app.set('trust proxy', 1);

// 1. Security headers
app.use(helmet);

// 2. CORS
app.use(cors);

// 3. Compression
app.use(compressMiddleware);

// 4. General rate limiter
app.use(generalLimiter);

// 5. Body parser — capped at 1 MB
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// 6. FIX A02: Cookie parser — required for httpOnly refresh token cookies
app.use(cookieParser);

// 7. HTTP parameter pollution
app.use(hpp);

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ── Routes ────────────────────────────────────────────────────────────────────
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
app.use('/api/supervisors',     supervisorRoutes);
app.use('/api/dashboard',       dashboardRoutes);
app.use('/api/chat',            chatRoutes);
app.use('/api/faq',             faqRoutes);
app.use('/api/external',        externalRoutes);
app.use('/api/notifications',   notificationRoutes);
app.use('/api/activities',      activityRoutes);

import swaggerUi from 'swagger-ui-express';
import { swaggerSpec } from './config/swagger.js';

// ── Swagger OpenAPI Documentation ─────────────────────────────────────────────
app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// ── 404 catcher ───────────────────────────────────────────────────────────────
app.use((req, res, next) => {
  next(new AppError(`Route ${req.method} ${req.originalUrl} not found.`, 404));
});

// ── Global error handler ──────────────────────────────────────────────────────
app.use(errorHandler);

// ── Connect DB & start ───────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;

// Wrap express in a plain http.Server so Socket.IO can share the same port
const httpServer = http.createServer(app);

// Boot Socket.IO real-time layer
initSocket(httpServer);

connectDB().then(async () => {
  // Fix stuck report jobs on restart
  try {
    const prisma = (await import('./config/prisma.js')).default;
    await prisma.generatedReport.updateMany({
      where: { status: 'PROCESSING' },
      data: { status: 'FAILED', error: 'Server restarted mid-generation' },
    });
  } catch (err) {
    logger.error({ event: 'report_reset_error', err: err.message });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
  logger.info({
    event: 'server_start',
    port: PORT,
    env: process.env.NODE_ENV || 'development',
  });
});
  // Boot cron jobs after DB is ready so they can query MongoDB
  startScheduler();
});

export default app;