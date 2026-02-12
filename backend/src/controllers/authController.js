import crypto from 'crypto';
import User from '../models/User.js';
import AppError from '../utils/AppError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { buildTokenPair, verifyRefreshToken } from '../utils/jwt.js';
import { sendWelcomeEmail, sendPasswordResetEmail } from '../services/emailService.js';

// ─── REGISTER ─────────────────────────────────────────────────────────────────
// Only HR_ADMIN can call this (enforced at router level).
export const register = asyncHandler(async (req, res, next) => {
  const { employeeId, name, email, role, position, department, supervisorId } = req.body;

  // Generate a temporary password
  const tempPassword = crypto.randomBytes(8).toString('hex');

  const user = await User.create({
    employeeId,
    name,
    email,
    passwordHash: tempPassword,   // will be hashed by the pre-save hook
    role: role || 'EMPLOYEE',
    position,
    department,
    supervisorId: supervisorId || null,
  });

  // Send welcome email with temp password (fire-and-forget)
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

  // select('+passwordHash') because it is select:false
  const user = await User.findOne({ email: email.toLowerCase() }).select('+passwordHash');

  // Generic message to prevent user enumeration
  if (!user || !(await user.comparePassword(password))) {
    return next(new AppError('Invalid email or password.', 401));
  }

  if (user.status !== 'ACTIVE') {
    return next(new AppError('Account is inactive. Please contact HR.', 403));
  }

  // Issue token pair
  const { accessToken, refreshToken } = buildTokenPair(user._id, user.role);

  // Store refresh token hash (so we can invalidate it on logout)
  user.refreshToken = refreshToken;
  await user.save({ validateBeforeSave: false });

  res.status(200).json({
    status: 'success',
    data: {
      user:         user.toPublic(),
      accessToken,
      refreshToken,
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

  // Rotate: issue new pair
  const newPair = buildTokenPair(user._id, user.role);
  user.refreshToken = newPair.refreshToken;
  await user.save({ validateBeforeSave: false });

  res.status(200).json({ status: 'success', data: newPair });
});

// ─── LOGOUT ───────────────────────────────────────────────────────────────────
export const logout = asyncHandler(async (req, res, next) => {
  // req.user is populated by protect() middleware
  const user = await User.findById(req.user.id).select('+refreshToken');
  if (user) {
    user.refreshToken = null;
    await user.save({ validateBeforeSave: false });
  }
  res.status(200).json({ status: 'success', message: 'Logged out successfully.' });
});

// ─── FORGOT PASSWORD ──────────────────────────────────────────────────────────
export const forgotPassword = asyncHandler(async (req, res, next) => {
  const { email } = req.body;
  if (!email) return next(new AppError('Email is required.', 400));

  const user = await User.findOne({ email: email.toLowerCase() });

  // Always return 200 to prevent enumeration
  if (!user) {
    return res.status(200).json({
      status:  'success',
      message: 'If this email exists, a reset link has been sent.',
    });
  }

  // Generate token, hash it before storing
  const token       = crypto.randomBytes(32).toString('hex');
  const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

  user.passwordResetToken   = hashedToken;
  user.passwordResetExpires = Date.now() + 3600000; // 1 hour
  await user.save({ validateBeforeSave: false });

  sendPasswordResetEmail(user, token);

  res.status(200).json({
    status:  'success',
    message: 'If this email exists, a reset link has been sent.',
  });
});

// ─── RESET PASSWORD ──────────────────────────────────────────────────────────
export const resetPassword = asyncHandler(async (req, res, next) => {
  const { token }    = req.params;
  const { password } = req.body;

  if (!password) return next(new AppError('New password is required.', 400));

  const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

  const user = await User.findOne({
    passwordResetToken:   hashedToken,
    passwordResetExpires: { $gt: Date.now() },
  });

  if (!user) {
    return next(new AppError('Token is invalid or has expired.', 400));
  }

  // Update password (pre-save hook will hash it)
  user.passwordHash          = password;
  user.passwordResetToken    = null;
  user.passwordResetExpires  = null;
  await user.save();

  res.status(200).json({ status: 'success', message: 'Password has been reset.' });
});

// ─── CHANGE PASSWORD (authenticated) ─────────────────────────────────────────
export const changePassword = asyncHandler(async (req, res, next) => {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    return next(new AppError('Current and new passwords are required.', 400));
  }

  const user = await User.findById(req.user.id).select('+passwordHash');

  if (!(await user.comparePassword(currentPassword))) {
    return next(new AppError('Current password is incorrect.', 401));
  }

  user.passwordHash = newPassword;   // pre-save hook hashes it
  await user.save();

  res.status(200).json({ status: 'success', message: 'Password changed successfully.' });
});