/* utils/AppError.js
 * Custom error class that carries an HTTP status code and an
 * isOperational flag so the global error handler can distinguish
 * expected errors (validation, not-found) from unexpected ones.
 */
class AppError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode;
    this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';
    this.isOperational = true;   // known / expected error

    Error.captureStackTrace(this, this.constructor);
  }
}

module.exports = AppError;
