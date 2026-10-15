/* controllers/authController.js */
import prisma from '../config/prisma.js';
import AppError from '../utils/AppError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { hashPassword, comparePassword, DEFAULT_USER_PASSWORD } from '../utils/password.js';
import { defaultRole, toPublic } from '../utils/userHelpers.js';
import {
  buildTokenPair,
  verifyRefreshToken,
  refreshCookieOptions,
} from '../utils/jwt.js';
import { sendWelcomeEmail } from '../services/emailService.js';
import { notifyAccountCreated } from '../services/notificationService.js';
import { logActivity } from '../services/activityService.js';
import logger from '../utils/logger.js';
import { ldapAuthenticate } from '../services/ldapService.js';
import { checkLock, recordFailure, recordSuccess } from '../services/loginThrottle.js';

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

  const tempPassword = DEFAULT_USER_PASSWORD;
  const passwordHash = await hashPassword(tempPassword);

  const resolvedRoles = roles
    ? (Array.isArray(roles) ? roles : [roles])
    : (req.body.role ? [req.body.role] : ['EMPLOYEE']);

  const user = await prisma.user.create({
    data: {
      employeeId: employeeId?.trim() || null,
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

  const normalizedUsername = username.toLowerCase().trim();
  const sourceIp = req.ip;

  // Per-source lockout (username + client IP). Scoped to the source so an
  // attacker cannot lock an account for its legitimate owner (lockout DoS) —
  // see services/loginThrottle.js. Checked before the DB lookup so unknown
  // usernames are throttled identically.
  const lock = checkLock(normalizedUsername, sourceIp);
  if (lock.locked) {
    return next(new AppError(`Too many failed login attempts from this location. Try again in ${lock.waitMinutes} minute(s).`, 423));
  }

  // Look up user in DB first (auth mode does not affect this check)
  const user = await prisma.user.findUnique({
    where: { username: normalizedUsername },
  });

  const useLocal = (process.env.AUTH_MODE || '').toLowerCase() === 'local';

  let credentialsValid = false;

  if (useLocal) {
    // ── Local mode: compare against bcrypt hash in DB ──────────────────────
    credentialsValid = !!(user && await comparePassword(password, user.passwordHash));
  } else {
    // ── LDAP mode (default): bind against Active Directory ─────────────────
    if (!user) {
      // User not provisioned in the local DB — reject before even hitting LDAP
      return next(new AppError('User not found or not allowed.', 401));
    }
    const ldapResult = await ldapAuthenticate(normalizedUsername, password);
    credentialsValid = ldapResult.success;
  }

  if (!credentialsValid) {
    // Count the failure against this source; only ever locks this (username+IP).
    const { locked } = recordFailure(normalizedUsername, sourceIp);
    if (locked) {
      logger.warn({ event: 'login_throttled', username: normalizedUsername, ip: sourceIp });
    }
    return next(new AppError('Invalid username or password.', 401));
  }

  if (user.status !== 'ACTIVE') {
    return next(new AppError('Account is inactive. Please contact HR.', 403));
  }

  // Clear this source's failure counter on successful login.
  recordSuccess(normalizedUsername, sourceIp);

  const activeRole = defaultRole(user.roles);
  const { accessToken, refreshToken } = buildTokenPair(user.id, activeRole);

  await prisma.user.update({
    where: { id: user.id },
    data: { refreshToken },
  });

  res.cookie('refreshToken', refreshToken, refreshCookieOptions());
  logger.info({ event: 'user_login', userId: user.id, role: activeRole, mode: useLocal ? 'local' : 'ldap' });

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
  //    Honour the role embedded in the refresh token (set on login / switchRole)
  //    so a dual-role user who switched to a lower privilege role is NOT
  //    re-escalated on session restore. Fall back to the default only if the
  //    embedded role is missing (legacy tokens) or no longer assigned.
  const activeRole =
    decoded.role && user.roles.includes(decoded.role)
      ? decoded.role
      : defaultRole(user.roles);

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

  res.status(200).json({ status: 'success', message: 'Logged out.' });
});

// NOTE: forgotPassword, resetPassword, and changePassword are intentionally
// removed. Password management is handled by Active Directory (LDAP).
// Users must reset their passwords through the Zemen Bank AD self-service portal.
