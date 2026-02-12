/* middleware/auth.js
 * 1.  protect(req, res, next)  – extracts & verifies the Bearer token,
 *     attaches the decoded payload to req.user.
 * 2.  authorize(...roles)      – role-based guard; call AFTER protect().
 *
 * OWASP notes:
 *   – Token is read from the Authorization header only (not query params).
 *   – Verification is synchronous; an invalid / expired token is rejected
 *     immediately without touching the DB.
 *   – The decoded payload is minimal (id + role) to limit blast radius if
 *     the secret is ever compromised.
 */
import { verifyAccessToken } from '../utils/jwt.js';
import AppError from '../utils/AppError.js';
import asyncHandler from '../utils/asyncHandler.js';

// ─── extract & verify ────────────────────────────────────────────────────────
export const protect = asyncHandler(async (req, res, next) => {
  let token;

  // Only accept "Bearer <token>" in the Authorization header.
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    return next(new AppError('Authentication token is missing. Please log in.', 401));
  }

  try {
    const decoded = verifyAccessToken(token);
    req.user = decoded;          // { id, role, iat, exp }
    next();
  } catch (err) {
    // jwt.verify throws – catch here to give a clean 401.
    return next(new AppError('Invalid or expired token. Please log in again.', 401));
  }
});

// ─── role guard ──────────────────────────────────────────────────────────────
// Usage:  router.get('/admin', protect, authorize('HR_ADMIN'), handler)
export const authorize = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return next(new AppError('You do not have permission to access this resource.', 403));
    }
    next();
  };
};
