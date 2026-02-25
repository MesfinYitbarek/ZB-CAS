/* middleware/auth.js
 *
 * protect()    – extracts & verifies the Bearer token; attaches the decoded
 *                payload to req.user  { id, role (= activeRole), iat, exp }
 *
 * authorize()  – role-based guard; checks req.user.role (the active role that
 *                was embedded in the token at login or after a role-switch).
 *                Call AFTER protect().
 *
 * NOTE: The `role` field in the token is the *active* role the user chose,
 * not the full list. Multi-role awareness lives in the frontend + switchRole
 * endpoint; the backend simply trusts what the token says.
 */
import { verifyAccessToken } from '../utils/jwt.js';
import AppError from '../utils/AppError.js';
import asyncHandler from '../utils/asyncHandler.js';

// ─── Extract & verify ────────────────────────────────────────────────────────
export const protect = asyncHandler(async (req, res, next) => {
  let token;

  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer')
  ) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    return next(
      new AppError('Authentication token is missing. Please log in.', 401)
    );
  }

  try {
    const decoded = verifyAccessToken(token);
    req.user = decoded; // { id, role, iat, exp }
    next();
  } catch {
    return next(
      new AppError('Invalid or expired token. Please log in again.', 401)
    );
  }
});

// ─── Role guard ──────────────────────────────────────────────────────────────
// Usage:  router.get('/admin', protect, authorize('HR_ADMIN'), handler)
export const authorize = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return next(
        new AppError(
          'You do not have permission to access this resource.',
          403
        )
      );
    }
    next();
  };
};
