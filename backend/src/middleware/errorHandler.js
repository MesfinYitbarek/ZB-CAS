/* middleware/errorHandler.js
 * SECURITY FIX A05: Stack traces are now hidden by default (fail-safe).
 * Previously relied on NODE_ENV === 'production'; now only shows stack in
 * explicit development mode to prevent accidental exposure.
 * SECURITY FIX A09: Uses structured logger instead of console.error
 * Migrated to Prisma: maps Prisma error codes (P2002, P2025, P2003, ...)
 * to friendly messages instead of Mongoose error types.
 */
import { Prisma } from '@prisma/client';
import AppError from '../utils/AppError.js';
import logger from '../utils/logger.js';

// ─── helpers ─────────────────────────────────────────────────────────────────
const MULTER_LIMIT_MESSAGES = {
  LIMIT_FILE_SIZE: 'Uploaded file is too large. Maximum size is 5 MB.',
  LIMIT_FILE_COUNT: 'Too many files uploaded. Only one file is allowed.',
  LIMIT_UNEXPECTED_FILE: 'Unexpected file field. Expected field name "file".',
};

const handleMulterError = (error) => {
  const message = MULTER_LIMIT_MESSAGES[error.code] || error.message || 'File upload failed.';
  const code = error.code;
  // LIMIT_FILE_SIZE → 413, everything else (including fileFilter rejections) → 400
  const status = code === 'LIMIT_FILE_SIZE' ? 413 : 400;
  return new AppError(message, status);
};
const handlePrismaKnownError = (err) => {
  switch (err.code) {
    case 'P2002': { // unique constraint failed
      const target = (err.meta && err.meta.target) || [];
      const field = Array.isArray(target) ? target[0] : target;
      return new AppError(`Duplicate value for "${field}". Please use a different value.`, 400);
    }
    case 'P2025': { // record not found
      return new AppError('The requested resource was not found.', 404);
    }
    case 'P2003': { // foreign key constraint failed
      return new AppError('Operation failed due to a referenced record constraint.', 400);
    }
    case 'P2004':   // constraint failed
    case 'P2014':   // relation violation
      return new AppError('Operation violates a database constraint.', 400);
    case 'P2000': { // value too long for column
      return new AppError('Provided value is too long for the field.', 400);
    }
    case 'P2011':   // null constraint violation
      return new AppError('A required field is missing.', 400);
    default:
      return new AppError('Database operation failed.', 400);
  }
};

const handleJWTError       = () => new AppError('Invalid token. Please log in again.', 401);
const handleJWTExpiredError = () => new AppError('Token has expired. Please log in again.', 401);

const isPrismaKnownError = (error) =>
  error instanceof Prisma.PrismaClientKnownRequestError;

// ─── main handler ────────────────────────────────────────────────────────────
const errorHandler = (err, req, res, next) => { // eslint-disable-line no-unused-vars
  let error = err;

  if (isPrismaKnownError(error)) {
    error = handlePrismaKnownError(error);
  }

  if (error.name === 'JsonWebTokenError')  error = handleJWTError();
  if (error.name === 'TokenExpiredError')  error = handleJWTExpiredError();

  // Multer upload errors (file too large, wrong field, or fileFilter rejection)
  if (error.name === 'MulterError' || error instanceof Error && error.code && error.code.startsWith('LIMIT_')) {
    error = handleMulterError(error);
  }

  const statusCode = error.statusCode || 500;
  const status     = error.status     || 'error';

  // FIX A05: Fail-safe — only show details in explicit development mode
  const isDev = process.env.NODE_ENV === 'development';

  const message = (!isDev && statusCode === 500)
    ? 'Something went wrong on our side.'
    : error.message || 'An unexpected error occurred.';

  // FIX A09: Structured logging instead of console.error
  if (statusCode === 500) {
    logger.error({ event: 'internal_server_error', message: error.message, path: req.path, method: req.method });
  }

  res.status(statusCode).json({
    status,
    message,
    ...(isDev && statusCode === 500 ? { stack: error.stack } : {}),
  });
};

export default errorHandler;
