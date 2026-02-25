/* controllers/authController.js */
import crypto from 'crypto';
import User from '../models/User.js';
import AppError from '../utils/AppError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { buildTokenPair, verifyRefreshToken } from '../utils/jwt.js';
import { sendWelcomeEmail, sendPasswordResetEmail } from '../services/emailService.js';

// ─── REGISTER ─────────────────────────────────────────────────────────────────
// Only HR_ADMIN can call this (enforced at router level).
export const register = asyncHandler(async (req, res, next) => {
  const { employeeId, name, email, roles, gender, position, department, supervisorId } = req.body;

  const tempPassword = crypto.randomBytes(8).toString('hex');

  // Accept either `roles` (array) or legacy `role` (string) from the request body
  const resolvedRoles = roles
    ? (Array.isArray(roles) ? roles : [roles])
    : (req.body.role ? [req.body.role] : ['EMPLOYEE']);

  const user = await User.create({
    employeeId,
    name,
    email,
    passwordHash: tempPassword,
    roles: resolvedRoles,
    gender: gender || null,
    position,
    department,
    supervisorId: supervisorId || null,
  });

  sendWelcomeEmail(user, tempPassword);

  res.status(201).json({
    status:  'success',
    message: 'User created successfully. A welcome email has been sent.',
    data:    { user: user.toPublic() },
  });
});

// ─── LOGIN ────────────────────────────────────────────────────────────────────
export const login = asyncHandler(async (req, res, next) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return next(new AppError('Email and password are required.', 400));
  }

  const user = await User.findOne({ email: email.toLowerCase() }).select('+passwordHash');

  if (!user || !(await user.comparePassword(password))) {
    return next(new AppError('Invalid email or password.', 401));
  }

  if (user.status !== 'ACTIVE') {
    return next(new AppError('Account is inactive. Please contact HR.', 403));
  }

  // Default active role = highest-priority role in the user's roles array
  const activeRole = user.defaultRole;

  const { accessToken, refreshToken } = buildTokenPair(user._id, activeRole);

  user.refreshToken = refreshToken;
  await user.save({ validateBeforeSave: false });

  res.status(200).json({
    status: 'success',
    data: {
      user:        user.toPublic(),   // includes `roles` array + `defaultRole`
      activeRole,
      accessToken,
      refreshToken,
    },
  });
});

// ─── SWITCH ROLE ──────────────────────────────────────────────────────────────
// Allows a multi-role user to switch their active role without logging out.
// Issues a fresh access token (same refresh token – no rotation needed here).
export const switchRole = asyncHandler(async (req, res, next) => {
  const { role } = req.body;   // the role the user wants to switch to

  if (!role) {
    return next(new AppError('Target role is required.', 400));
  }

  // req.user is set by the protect middleware (contains id from current token)
  const user = await User.findById(req.user.id).select('+refreshToken');

  if (!user) {
    return next(new AppError('User not found.', 404));
  }

  // Verify the user actually has the requested role
  if (!user.roles.includes(role)) {
    return next(new AppError(`You do not have the '${role}' role.`, 403));
  }

  // Issue a fresh access token for the new active role.
  // Refresh token stays the same (no rotation on role switch).
  const { signAccessToken } = await import('../utils/jwt.js');
  const newAccessToken = signAccessToken(user._id, role);

  res.status(200).json({
    status: 'success',
    data: {
      activeRole:  role,
      accessToken: newAccessToken,
    },
  });
});

// ─── REFRESH ──────────────────────────────────────────────────────────────────
export const refresh = asyncHandler(async (req, res, next) => {
  const { refreshToken } = req.body;
  if (!refreshToken) {
    return next(new AppError('Refresh token is required.', 400));
  }

  let decoded;
  try {
    decoded = verifyRefreshToken(refreshToken);
  } catch {
    return next(new AppError('Invalid or expired refresh token.', 401));
  }

  const user = await User.findById(decoded.id).select('+refreshToken');
  if (!user || user.refreshToken !== refreshToken) {
    return next(new AppError('Invalid refresh token.', 401));
  }

  // Use current default role when rotating
  const newPair = buildTokenPair(user._id, user.defaultRole);
  user.refreshToken = newPair.refreshToken;
  await user.save({ validateBeforeSave: false });

  res.status(200).json({ status: 'success', data: newPair });
});

// ─── LOGOUT ───────────────────────────────────────────────────────────────────
export const logout = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.id).select('+refreshToken');
  if (user) {
    user.refreshToken = null;
    await user.save({ validateBeforeSave: false });
  }
  res.status(200).json({ status: 'success', message: 'Logged out.' });
});

// ─── FORGOT PASSWORD ──────────────────────────────────────────────────────────
export const forgotPassword = asyncHandler(async (req, res, next) => {
  const user = await User.findOne({ email: req.body.email?.toLowerCase() });

  // Always return 200 to prevent email enumeration
  if (!user) {
    return res.status(200).json({
      status:  'success',
      message: 'If this email exists, a reset link has been sent.',
    });
  }

  const resetToken = crypto.randomBytes(32).toString('hex');
  user.passwordResetToken   = crypto.createHash('sha256').update(resetToken).digest('hex');
  user.passwordResetExpires = Date.now() + 60 * 60 * 1000; // 1 hour
  await user.save({ validateBeforeSave: false });

  sendPasswordResetEmail(user, resetToken);

  res.status(200).json({
    status:  'success',
    message: 'If this email exists, a reset link has been sent.',
  });
});

// ─── RESET PASSWORD ───────────────────────────────────────────────────────────
export const resetPassword = asyncHandler(async (req, res, next) => {
  const hashedToken = crypto
    .createHash('sha256')
    .update(req.params.token)
    .digest('hex');

  const user = await User.findOne({
    passwordResetToken:   hashedToken,
    passwordResetExpires: { $gt: Date.now() },
  }).select('+passwordHash');

  if (!user) {
    return next(new AppError('Token is invalid or has expired.', 400));
  }

  user.passwordHash         = req.body.password;
  user.passwordResetToken   = null;
  user.passwordResetExpires = null;
  await user.save();

  res.status(200).json({ status: 'success', message: 'Password reset successful.' });
});

// ─── CHANGE PASSWORD ──────────────────────────────────────────────────────────
export const changePassword = asyncHandler(async (req, res, next) => {
  const { currentPassword, newPassword } = req.body;

  const user = await User.findById(req.user.id).select('+passwordHash');
  if (!user) return next(new AppError('User not found.', 404));

  if (!(await user.comparePassword(currentPassword))) {
    return next(new AppError('Current password is incorrect.', 401));
  }

  user.passwordHash = newPassword;
  await user.save();

  res.status(200).json({ status: 'success', message: 'Password changed successfully.' });
});
