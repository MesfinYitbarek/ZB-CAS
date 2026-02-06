/* utils/asyncHandler.js
 * Wraps an async Express route handler and forwards any rejected promise
 * to Express's next() so the global error handler catches it.
 */
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

module.exports = asyncHandler;
