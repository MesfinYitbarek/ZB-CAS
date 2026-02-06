/* controllers/authController.js
 * Handles every authentication lifecycle event:
 *   POST /auth/register        – HR admin creates a user account
 *   POST /auth/login           – credential exchange → token pair
 *   POST /auth/refresh         – swap a valid refresh token for a new pair
 *   POST /auth/logout          – invalidate the refresh token server-side
 *   POST /auth/forgot-password – issue a reset link
 *   POST /auth/reset-password  – consume the reset token and set new password
 *   POST /auth/change-password – authenticated user changes own password
 *
 * OWASP:
 *   – Passwords hashed at bcrypt cost 12 (User model pre-save hook).
 *   – Reset tokens are one-time, hashed in DB, and expire in 1 hour.
 *   – Rate-limiting is applied at the router layer (authLimiter).
 *   – Generic error messages prevent user-enumeration.
 */
const crypto       = require('crypto');
const User         = require('../models/User');
const AppError     = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');
const { buildTokenPair, verifyRefreshToken } = require('../utils/jwt');
const { sendWelcomeEmail, sendPasswordResetEmail } = require('../services/emailService');

// ─── REGISTER ─────────────────────────────────────────────────────────────────
// Only HR_ADMIN can call this (enforced at router level).
exports.register = asyncHandler(async (req, res, next) => {
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
exports.login = asyncHandler(async (req, res, next) => {
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
exports.refresh = asyncHandler(async (req, res, next) => {
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
exports.logout = asyncHandler(async (req, res, next) => {
  // req.user is populated by protect() middleware
  const user = await User.findById(req.user.id).select('+refreshToken');
  if (user) {
    user.refreshToken = null;
    await user.save({ validateBeforeSave: false });
  }
  res.status(200).json({ status: 'success', message: 'Logged out successfully.' });
});

// ─── FORGOT PASSWORD ──────────────────────────────────────────────────────────
exports.forgotPassword = asyncHandler(async (req, res, next) => {
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
exports.resetPassword = asyncHandler(async (req, res, next) => {
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
exports.changePassword = asyncHandler(async (req, res, next) => {
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
