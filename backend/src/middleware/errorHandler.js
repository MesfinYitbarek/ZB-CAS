/* middleware/errorHandler.js
 * Catch-all error handler – must be registered LAST in app.js.
 *
 * Behaviour:
 *   – Operational errors (AppError)   → return the status + message.
 *   – Mongoose validation errors      → map to 400 with field-level messages.
 *   – Duplicate-key (11000)           → 400 with a readable message.
 *   – JWT errors                      → 401.
 *   – Everything else                 → 500, and in production the message
 *                                       is hidden to avoid leaking internals.
 */
const AppError = require('../utils/AppError');

// ─── helpers ─────────────────────────────────────────────────────────────────
const handleValidationError = (err) => {
  const messages = Object.values(err.errors).map((e) => e.message);
  return new AppError(`Validation failed: ${messages.join('; ')}`, 400);
};

const handleDuplicateKeyError = (err) => {
  // err.keyValue is an object like { email: 'x@y.com' }
  const field = Object.keys(err.keyValue || {})[0] || 'field';
  return new AppError(`Duplicate value for "${field}". Please use a different value.`, 400);
};

const handleJWTError = () =>
  new AppError('Invalid token. Please log in again.', 401);

const handleJWTExpiredError = () =>
  new AppError('Token has expired. Please log in again.', 401);

// ─── main handler ────────────────────────────────────────────────────────────
const errorHandler = (err, req, res, next) => { // eslint-disable-line no-unused-vars
  let error = err;

  // Map known error types
  if (error.name === 'ValidationError')          error = handleValidationError(error);
  if (error.code === 11000)                      error = handleDuplicateKeyError(error);
  if (error.name === 'JsonWebTokenError')        error = handleJWTError();
  if (error.name === 'TokenExpiredError')        error = handleJWTExpiredError();

  // Default to 500 if no status was set
  const statusCode = error.statusCode || 500;
  const status     = error.status     || 'error';

  // In production, never expose internal error messages for 500s
  const message =
    process.env.NODE_ENV === 'production' && statusCode === 500
      ? 'Something went wrong on our side.'
      : error.message || 'An unexpected error occurred.';

  // Log for debugging (in production you'd send to a log aggregator)
  if (statusCode === 500) {
    console.error('[ERROR]', error);
  }

  res.status(statusCode).json({
    status,
    message,
    ...(process.env.NODE_ENV !== 'production' && statusCode === 500
      ? { stack: error.stack }   // only in dev
      : {}),
  });
};

module.exports = errorHandler;
