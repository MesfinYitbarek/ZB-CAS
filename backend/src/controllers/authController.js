/* controllers/authController.js */
import crypto from 'crypto';
import prisma from '../config/prisma.js';
import AppError from '../utils/AppError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { hashPassword, comparePassword } from '../utils/password.js';
import { defaultRole, toPublic } from '../utils/userHelpers.js';
import {
  buildTokenPair,
  verifyRefreshToken,
  refreshCookieOptions,
} from '../utils/jwt.js';
import { sendWelcomeEmail, sendPasswordResetEmail } from '../services/emailService.js';
import { notifyAccountCreated } from '../services/notificationService.js';
import { logActivity } from '../services/activityService.js';
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
  const passwordHash = await hashPassword(tempPassword);

  const resolvedRoles = roles
    ? (Array.isArray(roles) ? roles : [roles])
    : (req.body.role ? [req.body.role] : ['EMPLOYEE']);

  const user = await prisma.user.create({
    data: {
      employeeId,
      name,
      username,
      email,
      passwordHash,
      roles: resolvedRoles,
      gender: gender || null,
      position,
      department,
      supervisorId: supervisorId || null,
    },
  });

  sendWelcomeEmail(user, tempPassword);
  notifyAccountCreated(user.id);
  logger.info({ event: 'user_registered', createdBy: req.user.id, newUserId: user.id });

  await logActivity({
    req,
    action: 'created',
    entity: 'User',
    entityId: user.id,
    description: `User "${user.name}" created`,
    metadata: { name: user.name, email: user.email, roles: resolvedRoles },
  });

  res.status(201).json({
    status:  'success',
    message: 'User created successfully. A welcome email has been sent.',
    data:    { user: toPublic(user) },
  });
});

// ─── LOGIN (username + password) ──────────────────────────────────────────────
export const login = asyncHandler(async (req, res, next) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return next(new AppError('Username and password are required.', 400));
  }

  const user = await prisma.user.findUnique({
    where: { username: username.toLowerCase().trim() },
  });

  // Account lockout check
  if (user && user.lockUntil && user.lockUntil > Date.now()) {
    const waitMinutes = Math.ceil((user.lockUntil - Date.now()) / 60000);
    return next(new AppError(`Account locked due to too many failed attempts. Try again in ${waitMinutes} minute(s).`, 423));
  }

  const passwordMatch = user && await comparePassword(password, user.passwordHash);

  if (!user || !passwordMatch) {
    if (user) {
      const failedLoginAttempts = (user.failedLoginAttempts || 0) + 1;
      const lockUntil = failedLoginAttempts >= 5 ? new Date(Date.now() + 15 * 60 * 1000) : user.lockUntil;
      await prisma.user.update({
        where: { id: user.id },
        data: { failedLoginAttempts, lockUntil },
      });
      if (failedLoginAttempts >= 5) {
        logger.warn({ event: 'account_locked', userId: user.id });
      }
    }
    return next(new AppError('Invalid username or password.', 401));
  }

  if (user.status !== 'ACTIVE') {
    return next(new AppError('Account is inactive. Please contact HR.', 403));
  }

  // Reset lockout on success
  if (user.failedLoginAttempts > 0) {
    await prisma.user.update({
      where: { id: user.id },
      data: { failedLoginAttempts: 0, lockUntil: null },
    });
  }

  const activeRole = defaultRole(user.roles);
  const { accessToken, refreshToken } = buildTokenPair(user.id, activeRole);

  await prisma.user.update({
    where: { id: user.id },
    data: { refreshToken },
  });

  res.cookie('refreshToken', refreshToken, refreshCookieOptions());
  logger.info({ event: 'user_login', userId: user.id, role: activeRole });

  await logActivity({
    req,
    actor: user.id,
    action: 'login',
    entity: 'User',
    entityId: user.id,
    description: `User "${user.name}" logged in`,
  });

  res.status(200).json({
    status: 'success',
    data: {
      user:        toPublic(user),
      activeRole,
      accessToken,
    },
  });
});

// ─── SWITCH ROLE ──────────────────────────────────────────────────────────────
export const switchRole = asyncHandler(async (req, res, next) => {
  const { role } = req.body;
  if (!role) return next(new AppError('Target role is required.', 400));

  const user = await prisma.user.findUnique({ where: { id: req.user.id } });
  if (!user) return next(new AppError('User not found.', 404));

  if (!user.roles.includes(role)) {
    return next(new AppError(`You do not have the '${role}' role.`, 403));
  }

  const { accessToken, refreshToken } = buildTokenPair(user.id, role);
  await prisma.user.update({
    where: { id: user.id },
    data: { refreshToken },
  });

  res.cookie('refreshToken', refreshToken, refreshCookieOptions());
  logger.info({ event: 'role_switch', userId: user.id, newRole: role });

  await logActivity({
    req,
    action: 'role_switch',
    entity: 'User',
    entityId: user.id,
    description: `Switched role to ${role}`,
    metadata: { from: req.user.role, to: role },
  });

  res.status(200).json({
    status: 'success',
    data: { activeRole: role, accessToken },
  });
});

// ─── REFRESH ──────────────────────────────────────────────────────────────────
export const refresh = asyncHandler(async (req, res, next) => {
  // Accept token from httpOnly cookie (browser) or body (non-browser clients)
  const incomingToken = req.cookies?.refreshToken || req.body?.refreshToken;
  if (!incomingToken) {
    return next(new AppError('Refresh token is required.', 400));
  }

  // 1. Verify the token is structurally valid and not expired
  let decoded;
  try {
    decoded = verifyRefreshToken(incomingToken);
  } catch {
    return next(new AppError('Invalid or expired refresh token.', 401));
  }

  // 2. Load the user
  const user = await prisma.user.findUnique({ where: { id: decoded.id } });
  if (!user) {
    return next(new AppError('User not found.', 401));
  }

  // 3. Verify the token matches what is stored in the DB (rotation check)
  if (user.refreshToken !== incomingToken) {
    return next(new AppError('Refresh token has already been used or revoked.', 401));
  }

  // 4. Determine the active role to encode in the new access token.
  const activeRole = defaultRole(user.roles);

  // 5. Issue a new token pair and rotate the stored refresh token
  const newPair = buildTokenPair(user.id, activeRole);
  await prisma.user.update({
    where: { id: user.id },
    data: { refreshToken: newPair.refreshToken },
  });

  res.cookie('refreshToken', newPair.refreshToken, refreshCookieOptions());

  res.status(200).json({
    status: 'success',
    data: { accessToken: newPair.accessToken },
  });
});

// ─── LOGOUT ───────────────────────────────────────────────────────────────────
export const logout = asyncHandler(async (req, res) => {
  await prisma.user.update({
    where: { id: req.user.id },
    data: { refreshToken: null },
  });
  res.clearCookie('refreshToken', { path: '/' });  // path must match refreshCookieOptions
  logger.info({ event: 'user_logout', userId: req.user.id });

  await logActivity({
    req,
    action: 'logout',
    entity: 'User',
    entityId: req.user.id,
    description: 'User logged out',
  });

  res.status(200).json({ status: 'success', message: 'Logged out.' });
});

// ─── FORGOT PASSWORD ──────────────────────────────────────────────────────────
export const forgotPassword = asyncHandler(async (req, res, next) => {
  // Accept either email or username for forgot-password flow
  const identifier = req.body.email?.toLowerCase() || req.body.username?.toLowerCase();
  const user = await prisma.user.findFirst({
    where: { OR: [{ email: identifier }, { username: identifier }] },
  });

  if (!user) {
    return res.status(200).json({
      status:  'success',
      message: 'If this account exists, a reset link has been sent.',
    });
  }

  const resetToken = crypto.randomBytes(32).toString('hex');
  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordResetToken:   crypto.createHash('sha256').update(resetToken).digest('hex'),
      passwordResetExpires: new Date(Date.now() + 60 * 60 * 1000),
    },
  });

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

  const user = await prisma.user.findFirst({
    where: {
      passwordResetToken:   hashedToken,
      passwordResetExpires: { gt: new Date() },
    },
  });

  if (!user) return next(new AppError('Token is invalid or has expired.', 400));

  const passwordHash = await hashPassword(req.body.password);
  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash,
      passwordResetToken:   null,
      passwordResetExpires: null,
      failedLoginAttempts:  0,
      lockUntil:            null,
    },
  });

  await logActivity({
    req,
    actor: user.id,
    action: 'password_reset',
    entity: 'User',
    entityId: user.id,
    description: `Password reset for "${user.name}" via reset token`,
  });

  res.status(200).json({ status: 'success', message: 'Password reset successful.' });
});

// ─── CHANGE PASSWORD ──────────────────────────────────────────────────────────
export const changePassword = asyncHandler(async (req, res, next) => {
  const { currentPassword, newPassword } = req.body;

  if (!validatePasswordStrength(newPassword, next)) return;

  const user = await prisma.user.findUnique({ where: { id: req.user.id } });
  if (!user) return next(new AppError('User not found.', 404));

  if (!(await comparePassword(currentPassword, user.passwordHash))) {
    return next(new AppError('Current password is incorrect.', 401));
  }

  if (currentPassword === newPassword) {
    return next(new AppError('New password must differ from current password.', 400));
  }

  const passwordHash = await hashPassword(newPassword);
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash },
  });

  logger.info({ event: 'password_changed', userId: user.id });

  await logActivity({
    req,
    action: 'password_changed',
    entity: 'User',
    entityId: user.id,
    description: 'Password changed',
  });

  res.status(200).json({ status: 'success', message: 'Password changed successfully.' });
});
