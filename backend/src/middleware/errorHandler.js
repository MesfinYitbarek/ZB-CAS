/* middleware/errorHandler.js
 * SECURITY FIX A05: Stack traces are now hidden by default (fail-safe).
 * Previously relied on NODE_ENV === 'production'; now only shows stack in
 * explicit development mode to prevent accidental exposure.
 * SECURITY FIX A09: Uses structured logger instead of console.error
 */
import AppError from '../utils/AppError.js';
import logger from '../utils/logger.js';

// ─── helpers ─────────────────────────────────────────────────────────────────
const handleValidationError = (err) => {
  const messages = Object.values(err.errors).map((e) => e.message);
  return new AppError(`Validation failed: ${messages.join('; ')}`, 400);
};

const handleDuplicateKeyError = (err) => {
  const field = Object.keys(err.keyValue || {})[0] || 'field';
  return new AppError(`Duplicate value for "${field}". Please use a different value.`, 400);
};

const handleJWTError       = () => new AppError('Invalid token. Please log in again.', 401);
const handleJWTExpiredError = () => new AppError('Token has expired. Please log in again.', 401);

// ─── main handler ────────────────────────────────────────────────────────────
const errorHandler = (err, req, res, next) => { // eslint-disable-line no-unused-vars
  let error = err;

  if (error.name === 'ValidationError')   error = handleValidationError(error);
  if (error.code === 11000)               error = handleDuplicateKeyError(error);
  if (error.name === 'JsonWebTokenError') error = handleJWTError();
  if (error.name === 'TokenExpiredError') error = handleJWTExpiredError();

  const statusCode = error.statusCode || 500;
  const status     = error.status     || 'error';

  // FIX A05: Fail-safe — only show details in explicit development mode
  // Previously: process.env.NODE_ENV === 'production' ? hide : show
  // Now: process.env.NODE_ENV === 'development' ? show : hide  (safe default)
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
