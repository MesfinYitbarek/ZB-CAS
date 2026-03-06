/* controllers/authController.js */
import crypto from 'crypto';
import User from '../models/User.js';
import AppError from '../utils/AppError.js';
import asyncHandler from '../utils/asyncHandler.js';
import {
  buildTokenPair,
  signAccessToken,
  verifyRefreshToken,
  refreshCookieOptions,
} from '../utils/jwt.js';
import { sendWelcomeEmail, sendPasswordResetEmail } from '../services/emailService.js';
import logger from '../utils/logger.js';

/* ─── Password complexity ─────────────────────────────────────────────────── */
const PASS_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]).{8,}$/;

function validatePasswordStrength(password, next) {
  if (!password || !PASS_REGEX.test(password)) {
    next(new AppError(
      'Password must be at least 8 characters and include uppercase, lowercase, digit, and special character.',
      400
    ));
    return false;
  }
  return true;
}

// ─── REGISTER ─────────────────────────────────────────────────────────────────
export const register = asyncHandler(async (req, res, next) => {
  const { employeeId, name, username, email, roles, gender, position, department, supervisorId } = req.body;

  if (!username) return next(new AppError('Username is required.', 400));

  const tempPassword = crypto.randomBytes(10).toString('hex');

  const resolvedRoles = roles
    ? (Array.isArray(roles) ? roles : [roles])
    : (req.body.role ? [req.body.role] : ['EMPLOYEE']);

  const user = await User.create({
    employeeId,
    name,
    username,
    email,
    passwordHash: tempPassword,
    roles: resolvedRoles,
    gender: gender || null,
    position,
    department,
    supervisorId: supervisorId || null,
  });

  sendWelcomeEmail(user, tempPassword);
  logger.info({ event: 'user_registered', createdBy: req.user.id, newUserId: user._id });

  res.status(201).json({
    status:  'success',
    message: 'User created successfully. A welcome email has been sent.',
    data:    { user: user.toPublic() },
  });
});

// ─── LOGIN (username + password) ──────────────────────────────────────────────
export const login = asyncHandler(async (req, res, next) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return next(new AppError('Username and password are required.', 400));
  }

  const user = await User.findOne({ username: username.toLowerCase().trim() })
    .select('+passwordHash +failedLoginAttempts +lockUntil');

  // Account lockout check
  if (user && user.lockUntil && user.lockUntil > Date.now()) {
    const waitMinutes = Math.ceil((user.lockUntil - Date.now()) / 60000);
    return next(new AppError(`Account locked due to too many failed attempts. Try again in ${waitMinutes} minute(s).`, 423));
  }

  const passwordMatch = user && await user.comparePassword(password);

  if (!user || !passwordMatch) {
    if (user) {
      user.failedLoginAttempts = (user.failedLoginAttempts || 0) + 1;
      if (user.failedLoginAttempts >= 5) {
        user.lockUntil = new Date(Date.now() + 15 * 60 * 1000);
        logger.warn({ event: 'account_locked', userId: user._id });
      }
      await user.save({ validateBeforeSave: false });
    }
    return next(new AppError('Invalid username or password.', 401));
  }

  if (user.status !== 'ACTIVE') {
    return next(new AppError('Account is inactive. Please contact HR.', 403));
  }

  // Reset lockout on success
  if (user.failedLoginAttempts > 0) {
    user.failedLoginAttempts = 0;
    user.lockUntil = null;
    await user.save({ validateBeforeSave: false });
  }

  const activeRole = user.defaultRole;
  const { accessToken, refreshToken } = buildTokenPair(user._id, activeRole);

  user.refreshToken = refreshToken;
  await user.save({ validateBeforeSave: false });

  res.cookie('refreshToken', refreshToken, refreshCookieOptions());
  logger.info({ event: 'user_login', userId: user._id, role: activeRole });

  res.status(200).json({
    status: 'success',
    data: {
      user:        user.toPublic(),
      activeRole,
      accessToken,
    },
  });
});

// ─── SWITCH ROLE ──────────────────────────────────────────────────────────────
export const switchRole = asyncHandler(async (req, res, next) => {
  const { role } = req.body;
  if (!role) return next(new AppError('Target role is required.', 400));

  const user = await User.findById(req.user.id).select('+refreshToken');
  if (!user) return next(new AppError('User not found.', 404));

  if (!user.roles.includes(role)) {
    return next(new AppError(`You do not have the '${role}' role.`, 403));
  }

  const { accessToken, refreshToken } = buildTokenPair(user._id, role);
  user.refreshToken = refreshToken;
  await user.save({ validateBeforeSave: false });

  res.cookie('refreshToken', refreshToken, refreshCookieOptions());
  logger.info({ event: 'role_switch', userId: user._id, newRole: role });

  res.status(200).json({
    status: 'success',
    data: { activeRole: role, accessToken },
  });
});

// ─── REFRESH ──────────────────────────────────────────────────────────────────
export const refresh = asyncHandler(async (req, res, next) => {
  const refreshToken = req.cookies?.refreshToken || req.body.refreshToken;
  if (!refreshToken) return next(new AppError('Refresh token is required.', 400));

  let decoded;
  try {
    decoded = verifyRefreshToken(refreshToken);
  } catch {
    return next(new AppError('Invalid or expired refresh token.', 401));
  }

  const user = await User.findById(decoded.id).select('+refreshToken');
  if (!user) return next(new AppError('Invalid refresh token.', 401));

  // Race-safety: React StrictMode (and concurrent tab refreshes) can send two
  // requests with the same token in quick succession. The first rotates the DB
  // token; the second arrives with the old token and would normally be rejected.
  // We allow a 10-second reuse window: if the incoming token doesn't match the
  // stored one but was issued within the last 10 seconds, we treat it as a
  // valid "just-rotated" token and return a fresh pair without rotating again.
  const tokenAge = Math.floor(Date.now() / 1000) - (decoded.iat || 0);
  const tokenMatchesStored = user.refreshToken === refreshToken;

  if (!tokenMatchesStored) {
    // Outside the grace window → genuine replay attack or expired rotation
    if (tokenAge > 10) {
      return next(new AppError('Invalid refresh token.', 401));
    }
    // Within grace window: verify the stored token belongs to the same user
    // (confirms this is a race, not a stolen token from a different session)
    try {
      const storedDecoded = verifyRefreshToken(user.refreshToken);
      if (storedDecoded.id !== decoded.id) {
        return next(new AppError('Invalid refresh token.', 401));
      }
    } catch {
      return next(new AppError('Invalid refresh token.', 401));
    }
    // Grace-window hit — issue a fresh pair based on the already-rotated session
  }

  const newPair = buildTokenPair(user._id, user.defaultRole);
  user.refreshToken = newPair.refreshToken;
  await user.save({ validateBeforeSave: false });

  res.cookie('refreshToken', newPair.refreshToken, refreshCookieOptions());

  res.status(200).json({
    status: 'success',
    data: { accessToken: newPair.accessToken },
  });
});

// ─── LOGOUT ───────────────────────────────────────────────────────────────────
export const logout = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.id).select('+refreshToken');
  if (user) {
    user.refreshToken = null;
    await user.save({ validateBeforeSave: false });
  }
  res.clearCookie('refreshToken', { path: '/' });  // path must match refreshCookieOptions
  logger.info({ event: 'user_logout', userId: req.user.id });
  res.status(200).json({ status: 'success', message: 'Logged out.' });
});

// ─── FORGOT PASSWORD ──────────────────────────────────────────────────────────
export const forgotPassword = asyncHandler(async (req, res, next) => {
  // Accept either email or username for forgot-password flow
  const identifier = req.body.email?.toLowerCase() || req.body.username?.toLowerCase();
  const user = await User.findOne({
    $or: [{ email: identifier }, { username: identifier }]
  });

  if (!user) {
    return res.status(200).json({
      status:  'success',
      message: 'If this account exists, a reset link has been sent.',
    });
  }

  const resetToken = crypto.randomBytes(32).toString('hex');
  user.passwordResetToken   = crypto.createHash('sha256').update(resetToken).digest('hex');
  user.passwordResetExpires = Date.now() + 60 * 60 * 1000;
  await user.save({ validateBeforeSave: false });

  sendPasswordResetEmail(user, resetToken);

  res.status(200).json({
    status:  'success',
    message: 'If this account exists, a reset link has been sent.',
  });
});

// ─── RESET PASSWORD ───────────────────────────────────────────────────────────
export const resetPassword = asyncHandler(async (req, res, next) => {
  if (!validatePasswordStrength(req.body.password, next)) return;

  const hashedToken = crypto.createHash('sha256').update(req.params.token).digest('hex');

  const user = await User.findOne({
    passwordResetToken:   hashedToken,
    passwordResetExpires: { $gt: Date.now() },
  }).select('+passwordHash');

  if (!user) return next(new AppError('Token is invalid or has expired.', 400));

  user.passwordHash         = req.body.password;
  user.passwordResetToken   = null;
  user.passwordResetExpires = null;
  user.failedLoginAttempts  = 0;
  user.lockUntil            = null;
  await user.save();

  res.status(200).json({ status: 'success', message: 'Password reset successful.' });
});

// ─── CHANGE PASSWORD ──────────────────────────────────────────────────────────
export const changePassword = asyncHandler(async (req, res, next) => {
  const { currentPassword, newPassword } = req.body;

  if (!validatePasswordStrength(newPassword, next)) return;

  const user = await User.findById(req.user.id).select('+passwordHash');
  if (!user) return next(new AppError('User not found.', 404));

  if (!(await user.comparePassword(currentPassword))) {
    return next(new AppError('Current password is incorrect.', 401));
  }

  if (currentPassword === newPassword) {
    return next(new AppError('New password must differ from current password.', 400));
  }

  user.passwordHash = newPassword;
  await user.save();

  logger.info({ event: 'password_changed', userId: user._id });
  res.status(200).json({ status: 'success', message: 'Password changed successfully.' });
});