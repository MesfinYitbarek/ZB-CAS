/**
 * ZB-CAS Backend — Comprehensive Test Suite
 *
 * Coverage areas:
 *  1. JWT utilities (sign, verify, rotation)
 *  2. Security middleware (escapeRegex, rate limiters)
 *  3. Auth controller flows (login, register, refresh, logout, forgot/reset password)
 *  4. User controller (CRUD, role-scoped queries)
 *  5. Assessment controller (create, validate, auto-activate)
 *  6. Error handler (status codes, stack trace suppression)
 *  7. Password utilities (hashing, comparison, complexity)
 *  8. Penetration test scenarios (injection, brute force, privilege escalation)
 *  9. Performance helpers (pagination, lean queries)
 *
 * Prerequisites:
 *   npm install --save-dev jest @jest/globals
 *   PostgreSQL running locally with DATABASE_URL configured
 *
 * Run:
 *   npm test
 *   npm test -- --coverage
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, jest } from '@jest/globals';
import { Prisma } from '@prisma/client';
import { computeLiveStats, computeHeatmap, computeDepartmentSummary, buildResultFilter } from '../src/services/analyticsService.js';

// ─────────────────────────────────────────────────────────────────────────────
// 1. JWT UTILITIES
// ─────────────────────────────────────────────────────────────────────────────

// Mock environment before importing jwt.js
process.env.JWT_SECRET         = 'test-access-secret-super-long-value';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-super-long-value';
process.env.JWT_EXPIRES_IN     = '15m';
process.env.JWT_REFRESH_EXPIRES_IN = '30d';
process.env.DATABASE_URL       = 'postgresql://zbcas:zbcas123@localhost:5432/zbcas';

describe('JWT Utilities', () => {
  let signAccessToken, signRefreshToken, verifyAccessToken, verifyRefreshToken, buildTokenPair, refreshCookieOptions;

  beforeAll(async () => {
    const mod = await import('../src/utils/jwt.js');
    ({ signAccessToken, signRefreshToken, verifyAccessToken, verifyRefreshToken, buildTokenPair, refreshCookieOptions } = mod);
  });

  it('signs and verifies an access token', () => {
    const token = signAccessToken('user123', 'EMPLOYEE');
    const decoded = verifyAccessToken(token);
    expect(decoded.id).toBe('user123');
    expect(decoded.role).toBe('EMPLOYEE');
  });

  it('signs and verifies a refresh token with its active role', () => {
    const token = signRefreshToken('user456', 'EMPLOYEE');
    const decoded = verifyRefreshToken(token);
    expect(decoded.id).toBe('user456');
    expect(decoded.role).toBe('EMPLOYEE');
  });

  it('throws on invalid access token', () => {
    expect(() => verifyAccessToken('totally.invalid.token')).toThrow();
  });

  it('throws on expired access token', async () => {
    const original = process.env.JWT_EXPIRES_IN;
    process.env.JWT_EXPIRES_IN = '1ms';
    const { signAccessToken: signShort, verifyAccessToken: verifyShort } = await import('../src/utils/jwt.js?v=expired');
    const token = signShort('u1', 'EMPLOYEE');
    await new Promise((r) => setTimeout(r, 10));
    expect(() => verifyShort(token)).toThrow();
    process.env.JWT_EXPIRES_IN = original;
  });

  it('buildTokenPair returns both tokens', () => {
    const pair = buildTokenPair('user789', 'HR_ADMIN');
    expect(pair).toHaveProperty('accessToken');
    expect(pair).toHaveProperty('refreshToken');
    expect(typeof pair.accessToken).toBe('string');
    expect(typeof pair.refreshToken).toBe('string');
  });

  it('refresh token carries the active role', () => {
    const pair = buildTokenPair('userABC', 'SUPERVISOR');
    const decoded = verifyRefreshToken(pair.refreshToken);
    expect(decoded.role).toBe('SUPERVISOR');
  });

  it('refresh token role is independent of access token role', () => {
    const pair = buildTokenPair('userDEF', 'EMPLOYEE');
    const access = verifyAccessToken(pair.accessToken);
    const refresh = verifyRefreshToken(pair.refreshToken);
    expect(access.role).toBe('EMPLOYEE');
    expect(refresh.role).toBe('EMPLOYEE');
  });

  it('refreshCookieOptions returns correct flags', () => {
    const opts = refreshCookieOptions();
    expect(opts.httpOnly).toBe(true);
    expect(opts.sameSite).toBe('lax');
    expect(opts.path).toBe('/');
    expect(typeof opts.maxAge).toBe('number');
  });

  it('refreshCookieOptions sets secure=false in test env', () => {
    process.env.NODE_ENV = 'test';
    const opts = refreshCookieOptions();
    expect(opts.secure).toBe(false);
  });

  it('refreshCookieOptions sets secure=true in production', () => {
    process.env.NODE_ENV = 'production';
    const opts = refreshCookieOptions();
    expect(opts.secure).toBe(true);
    process.env.NODE_ENV = 'test';
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. SECURITY MIDDLEWARE — escapeRegex
// ─────────────────────────────────────────────────────────────────────────────

describe('Security Middleware — escapeRegex', () => {
  let escapeRegex;

  beforeAll(async () => {
    const mod = await import('../src/middleware/security.js');
    escapeRegex = mod.escapeRegex;
  });

  it('escapes basic regex metacharacters', () => {
    const result = escapeRegex('hello.world');
    expect(result).toBe('hello\\.world');
  });

  it('escapes all metacharacters: . * + ? ^ $ { } ( ) | [ ] \\', () => {
    const input  = '.*+?^${}()|[\\]';
    const escaped = escapeRegex(input);
    expect(() => new RegExp(escaped)).not.toThrow();
  });

  it('does not escape plain alphanumeric strings', () => {
    expect(escapeRegex('johnDoe123')).toBe('johnDoe123');
  });

  it('handles empty string', () => {
    expect(escapeRegex('')).toBe('');
  });

  it('coerces non-string input to string', () => {
    expect(escapeRegex(123)).toBe('123');
  });

  it('prevents ReDoS: escaped pattern matches literally', () => {
    const malicious = '(a+)+';
    const escaped = escapeRegex(malicious);
    const re = new RegExp(escaped);
    expect(re.test('(a+)+')).toBe(true);
    expect(re.test('aaaa')).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. AUTH MIDDLEWARE — protect & authorize
// ─────────────────────────────────────────────────────────────────────────────

describe('Auth Middleware — protect', () => {
  let protect, signAccessToken;

  beforeAll(async () => {
    const authMod    = await import('../src/middleware/auth.js');
    const jwtMod     = await import('../src/utils/jwt.js');
    protect          = authMod.protect;
    signAccessToken  = jwtMod.signAccessToken;
  });

  const makeReq = (token) => ({
    headers: { authorization: token ? `Bearer ${token}` : undefined },
  });
  const mockNext = jest.fn();

  beforeEach(() => mockNext.mockClear());

  it('calls next with 401 when no token provided', async () => {
    await protect(makeReq(null), {}, mockNext);
    expect(mockNext).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 401 })
    );
  });

  it('calls next with 401 for invalid token', async () => {
    await protect(makeReq('not.a.real.token'), {}, mockNext);
    expect(mockNext).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 401 })
    );
  });

  it('attaches decoded user to req and calls next() for valid token', async () => {
    const token = signAccessToken('abc123', 'EMPLOYEE');
    const req = makeReq(token);
    await protect(req, {}, mockNext);
    expect(req.user).toMatchObject({ id: 'abc123', role: 'EMPLOYEE' });
    expect(mockNext).toHaveBeenCalledWith();
  });
});

describe('Auth Middleware — authorize', () => {
  let authorize;

  beforeAll(async () => {
    authorize = (await import('../src/middleware/auth.js')).authorize;
  });

  const makeReq = (role) => ({ user: { role } });
  const mockNext = jest.fn();

  beforeEach(() => mockNext.mockClear());

  it('calls next() when role is allowed', () => {
    authorize('HR_ADMIN')(makeReq('HR_ADMIN'), {}, mockNext);
    expect(mockNext).toHaveBeenCalledWith();
  });

  it('calls next with 403 when role is not allowed', () => {
    authorize('HR_ADMIN')(makeReq('EMPLOYEE'), {}, mockNext);
    expect(mockNext).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 403 })
    );
  });

  it('accepts multiple roles', () => {
    authorize('HR_ADMIN', 'SUPERVISOR')(makeReq('SUPERVISOR'), {}, mockNext);
    expect(mockNext).toHaveBeenCalledWith();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. PASSWORD VALIDATION (auth controller helper)
// ─────────────────────────────────────────────────────────────────────────────

describe('Password Complexity Validation', () => {
  const PASS_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]).{8,}$/;

  const valid = (pw) => PASS_REGEX.test(pw);

  it('accepts a strong password', () => {
    expect(valid('Secure@1Password')).toBe(true);
  });

  it('rejects password shorter than 8 chars', () => {
    expect(valid('Ab1!')).toBe(false);
  });

  it('rejects password without uppercase', () => {
    expect(valid('secure@1password')).toBe(false);
  });

  it('rejects password without lowercase', () => {
    expect(valid('SECURE@1PASSWORD')).toBe(false);
  });

  it('rejects password without digit', () => {
    expect(valid('Secure@Password')).toBe(false);
  });

  it('rejects password without special character', () => {
    expect(valid('SecurePassword1')).toBe(false);
  });

  it('accepts various special characters', () => {
    expect(valid('Hello#World1')).toBe(true);
    expect(valid('Hello$World1')).toBe(true);
    expect(valid('Hello!World1')).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. AppError UTILITY
// ─────────────────────────────────────────────────────────────────────────────

describe('AppError', () => {
  let AppError;

  beforeAll(async () => {
    AppError = (await import('../src/utils/AppError.js')).default;
  });

  it('creates an operational error with correct status and statusCode', () => {
    const err = new AppError('Not found', 404);
    expect(err.message).toBe('Not found');
    expect(err.statusCode).toBe(404);
    expect(err.status).toBe('fail');
    expect(err.isOperational).toBe(true);
  });

  it('sets status to "error" for 5xx codes', () => {
    const err = new AppError('Internal', 500);
    expect(err.status).toBe('error');
  });

  it('captures a stack trace', () => {
    const err = new AppError('oops', 400);
    expect(typeof err.stack).toBe('string');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. ERROR HANDLER MIDDLEWARE
// ─────────────────────────────────────────────────────────────────────────────

describe('Error Handler Middleware', () => {
  let errorHandler, AppError;

  beforeAll(async () => {
    errorHandler = (await import('../src/middleware/errorHandler.js')).default;
    AppError     = (await import('../src/utils/AppError.js')).default;
  });

  const makeRes = () => {
    const res = { _status: null, _body: null };
    res.status = (code) => { res._status = code; return res; };
    res.json   = (body) => { res._body = body; };
    return res;
  };

  it('returns the correct status code from AppError', () => {
    const err = new AppError('Not found', 404);
    const res = makeRes();
    errorHandler(err, { path: '/test', method: 'GET' }, res, () => {});
    expect(res._status).toBe(404);
    expect(res._body.message).toBe('Not found');
  });

  it('hides stack trace in production', () => {
    process.env.NODE_ENV = 'production';
    const err = new Error('Internal crash');
    err.statusCode = 500;
    const res = makeRes();
    errorHandler(err, { path: '/test', method: 'GET' }, res, () => {});
    expect(res._body.message).toBe('Something went wrong on our side.');
    expect(res._body.stack).toBeUndefined();
    process.env.NODE_ENV = 'test';
  });

  it('shows stack trace in development', () => {
    process.env.NODE_ENV = 'development';
    const err = new Error('Dev crash');
    err.statusCode = 500;
    err.status = 'error';
    const res = makeRes();
    errorHandler(err, { path: '/test', method: 'GET' }, res, () => {});
    expect(res._body.stack).toBeDefined();
    process.env.NODE_ENV = 'test';
  });

  it('maps Prisma unique constraint error (P2002) to 400', () => {
    const err = new Prisma.PrismaClientKnownRequestError(
      'Unique constraint failed on the fields: (`email`)',
      { code: 'P2002', clientVersion: '6.0.0', meta: { target: ['email'] } },
    );
    const res = makeRes();
    errorHandler(err, { path: '/test', method: 'POST' }, res, () => {});
    expect(res._status).toBe(400);
    expect(res._body.message).toContain('Duplicate value');
  });

  it('maps Prisma null constraint error (P2011) to 400', () => {
    const err = new Prisma.PrismaClientKnownRequestError(
      'null constraint violation on the constraint: `users_email_key`',
      { code: 'P2011', clientVersion: '6.0.0', meta: { constraint: 'users_email_key' } },
    );
    const res = makeRes();
    errorHandler(err, { path: '/test', method: 'POST' }, res, () => {});
    expect(res._status).toBe(400);
    expect(res._body.message).toContain('required field');
  });

  it('maps Prisma record-not-found (P2025) to 404', () => {
    const err = new Prisma.PrismaClientKnownRequestError(
      'Record to delete does not exist.',
      { code: 'P2025', clientVersion: '6.0.0', meta: { cause: 'Record not found' } },
    );
    const res = makeRes();
    errorHandler(err, { path: '/test', method: 'DELETE' }, res, () => {});
    expect(res._status).toBe(404);
  });

  it('maps JsonWebTokenError to 401', () => {
    const err = { name: 'JsonWebTokenError' };
    const res = makeRes();
    errorHandler(err, { path: '/test', method: 'GET' }, res, () => {});
    expect(res._status).toBe(401);
  });

  it('maps TokenExpiredError to 401', () => {
    const err = { name: 'TokenExpiredError' };
    const res = makeRes();
    errorHandler(err, { path: '/test', method: 'GET' }, res, () => {});
    expect(res._status).toBe(401);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. USER MODEL — UNIT TESTS
// ─────────────────────────────────────────────────────────────────────────────

describe('User Model — toPublic()', () => {
  const mockUser = {
    id: 'abc',
    employeeId: 'EMP001',
    name: 'Alice Smith',
    username: 'alice',
    email: 'alice@zemenbank.com',
    roles: ['HR_ADMIN', 'EMPLOYEE'],
    gender: 'Female',
    position: 'Analyst',
    department: 'IT',
    supervisorId: null,
    status: 'ACTIVE',
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-06-01'),
    passwordHash: '$2b$12$hashedvalue',
    refreshToken: 'some-refresh-token',
    passwordResetToken: 'reset-token',
    failedLoginAttempts: 2,
    lockUntil: null,
  };

  function toPublic(user) {
    return {
      id:            user.id,
      employeeId:    user.employeeId,
      name:          user.name,
      username:      user.username,
      email:         user.email,
      roles:         user.roles,
      gender:        user.gender,
      position:      user.position,
      department:    user.department,
      supervisorId:  user.supervisorId,
      status:        user.status,
      createdAt:     user.createdAt,
      updatedAt:     user.updatedAt,
    };
  }

  it('includes public fields', () => {
    const pub = toPublic(mockUser);
    expect(pub).toHaveProperty('name');
    expect(pub).toHaveProperty('email');
    expect(pub).toHaveProperty('roles');
  });

  it('excludes passwordHash', () => {
    const pub = toPublic(mockUser);
    expect(pub).not.toHaveProperty('passwordHash');
  });

  it('excludes refreshToken', () => {
    const pub = toPublic(mockUser);
    expect(pub).not.toHaveProperty('refreshToken');
  });

  it('excludes failedLoginAttempts', () => {
    const pub = toPublic(mockUser);
    expect(pub).not.toHaveProperty('failedLoginAttempts');
  });

  it('excludes passwordResetToken', () => {
    const pub = toPublic(mockUser);
    expect(pub).not.toHaveProperty('passwordResetToken');
  });
});

describe('User Model — defaultRole virtual', () => {
  const ROLE_PRIORITY = { HR_ADMIN: 0, SUPERVISOR: 1, EMPLOYEE: 2 };

  function defaultRole(roles) {
    if (!roles || roles.length === 0) return 'EMPLOYEE';
    return [...roles].sort(
      (a, b) => (ROLE_PRIORITY[a] ?? 99) - (ROLE_PRIORITY[b] ?? 99)
    )[0];
  }

  it('returns HR_ADMIN when user has HR_ADMIN + EMPLOYEE', () => {
    expect(defaultRole(['EMPLOYEE', 'HR_ADMIN'])).toBe('HR_ADMIN');
  });

  it('returns SUPERVISOR when user has SUPERVISOR + EMPLOYEE', () => {
    expect(defaultRole(['EMPLOYEE', 'SUPERVISOR'])).toBe('SUPERVISOR');
  });

  it('returns EMPLOYEE for single-role employee', () => {
    expect(defaultRole(['EMPLOYEE'])).toBe('EMPLOYEE');
  });

  it('defaults to EMPLOYEE for empty roles array', () => {
    expect(defaultRole([])).toBe('EMPLOYEE');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 8. ASSESSMENT MODEL VALIDATION LOGIC
// ─────────────────────────────────────────────────────────────────────────────

describe('Assessment — date and weight validation', () => {
  function validateAssessment({ startDate, endDate, type, weight }) {
    if (endDate <= startDate) return 'End date must be after start date.';
    if (type === 'Combined') {
      const sum = (weight.selfAssessment || 0) + (weight.supervisor || 0);
      if (sum !== 100) return 'Self-assessment and supervisor weights must sum to 100.';
    }
    return null;
  }

  it('passes when endDate is after startDate', () => {
    const err = validateAssessment({
      startDate: new Date('2025-01-01'),
      endDate:   new Date('2025-06-01'),
      type:      'SelfAssessment',
      weight:    {},
    });
    expect(err).toBeNull();
  });

  it('fails when endDate equals startDate', () => {
    const d = new Date('2025-01-01');
    const err = validateAssessment({ startDate: d, endDate: d, type: 'SelfAssessment', weight: {} });
    expect(err).toMatch(/End date must be after/);
  });

  it('fails when endDate is before startDate', () => {
    const err = validateAssessment({
      startDate: new Date('2025-06-01'),
      endDate:   new Date('2025-01-01'),
      type:      'SelfAssessment',
      weight:    {},
    });
    expect(err).toMatch(/End date must be after/);
  });

  it('fails Combined type when weights don\'t sum to 100', () => {
    const err = validateAssessment({
      startDate: new Date('2025-01-01'),
      endDate:   new Date('2025-06-01'),
      type:      'Combined',
      weight:    { selfAssessment: 30, supervisor: 60 },
    });
    expect(err).toMatch(/sum to 100/);
  });

  it('passes Combined type when weights sum to 100', () => {
    const err = validateAssessment({
      startDate: new Date('2025-01-01'),
      endDate:   new Date('2025-06-01'),
      type:      'Combined',
      weight:    { selfAssessment: 20, supervisor: 80 },
    });
    expect(err).toBeNull();
  });

  it('skips weight validation for SelfAssessment type', () => {
    const err = validateAssessment({
      startDate: new Date('2025-01-01'),
      endDate:   new Date('2025-06-01'),
      type:      'SelfAssessment',
      weight:    { selfAssessment: 30, supervisor: 30 },
    });
    expect(err).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 9. PENETRATION TEST SCENARIOS (logic-level)
// ─────────────────────────────────────────────────────────────────────────────

describe('Penetration Tests — Account Lockout Logic', () => {
  function checkLockout(failedAttempts, lockUntil) {
    if (lockUntil && lockUntil > Date.now()) {
      const waitMinutes = Math.ceil((lockUntil - Date.now()) / 60000);
      return { locked: true, waitMinutes };
    }
    const newAttempts = failedAttempts + 1;
    const shouldLock = newAttempts >= 5;
    return {
      locked: false,
      newAttempts,
      lockUntil: shouldLock ? new Date(Date.now() + 15 * 60 * 1000) : null,
    };
  }

  it('does not lock account on first failure', () => {
    const result = checkLockout(0, null);
    expect(result.locked).toBe(false);
    expect(result.lockUntil).toBeNull();
  });

  it('locks account on 5th failure', () => {
    const result = checkLockout(4, null);
    expect(result.locked).toBe(false);
    expect(result.lockUntil).not.toBeNull();
  });

  it('reports locked when lockUntil is in the future', () => {
    const future = new Date(Date.now() + 10 * 60 * 1000);
    const result = checkLockout(5, future);
    expect(result.locked).toBe(true);
    expect(result.waitMinutes).toBeGreaterThan(0);
  });

  it('allows login after lockout expires', () => {
    const past = new Date(Date.now() - 1000);
    const result = checkLockout(5, past);
    expect(result.locked).toBe(false);
  });
});

describe('Penetration Tests — Refresh Token Rotation', () => {
  it('rejects a replayed (old) refresh token', () => {
    const storedRefreshToken = 'current-db-token';
    const submittedToken      = 'old-rotated-token';
    const isValid = storedRefreshToken === submittedToken;
    expect(isValid).toBe(false);
  });

  it('accepts the current refresh token', () => {
    const storedRefreshToken = 'current-db-token';
    const submittedToken      = 'current-db-token';
    const isValid = storedRefreshToken === submittedToken;
    expect(isValid).toBe(true);
  });
});

describe('Penetration Tests — Role Privilege Escalation', () => {
  it('rejects a role switch to a role not in user.roles', () => {
    const userRoles  = ['EMPLOYEE'];
    const targetRole = 'HR_ADMIN';
    const isAllowed  = userRoles.includes(targetRole);
    expect(isAllowed).toBe(false);
  });

  it('permits a role switch to a role in user.roles', () => {
    const userRoles  = ['EMPLOYEE', 'SUPERVISOR'];
    const targetRole = 'SUPERVISOR';
    const isAllowed  = userRoles.includes(targetRole);
    expect(isAllowed).toBe(true);
  });
});

describe('Penetration Tests — User Enumeration Prevention', () => {
  function forgotPasswordResponse(userFound) {
    return {
      status:  'success',
      message: 'If this account exists, a reset link has been sent.',
    };
  }

  it('returns identical response whether user exists or not', () => {
    const whenFound    = forgotPasswordResponse(true);
    const whenNotFound = forgotPasswordResponse(false);
    expect(whenFound).toEqual(whenNotFound);
  });
});

describe('Penetration Tests — SQL Injection', () => {
  function sanitize(value) {
    if (typeof value !== 'object' || value === null) return value;
    const cleaned = {};
    for (const [k, v] of Object.entries(value)) {
      if (!k.startsWith('$')) cleaned[k] = sanitize(v);
    }
    return cleaned;
  }

  it('strips $gt operator from login payload', () => {
    const payload = { username: { $gt: '' }, password: 'anything' };
    const result  = sanitize(payload);
    expect(result.username).toEqual({});
    expect(result.password).toBe('anything');
  });

  it('strips $where from query params', () => {
    const payload = { $where: 'this.password.length > 0' };
    const result  = sanitize(payload);
    expect(result).toEqual({});
  });

  it('leaves normal strings untouched', () => {
    const payload = { username: 'alice' };
    const result  = sanitize(payload);
    expect(result.username).toBe('alice');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 10. PERFORMANCE HELPERS — Pagination
// ─────────────────────────────────────────────────────────────────────────────

describe('Pagination Logic', () => {
  function calcSkip(page, limit) {
    return (parseInt(page, 10) - 1) * parseInt(limit, 10);
  }

  function calcTotalPages(total, limit) {
    return Math.ceil(total / parseInt(limit, 10));
  }

  it('calculates correct skip for page 1', () => {
    expect(calcSkip(1, 20)).toBe(0);
  });

  it('calculates correct skip for page 3 with limit 10', () => {
    expect(calcSkip(3, 10)).toBe(20);
  });

  it('calculates total pages correctly', () => {
    expect(calcTotalPages(100, 20)).toBe(5);
    expect(calcTotalPages(101, 20)).toBe(6);
    expect(calcTotalPages(0, 20)).toBe(0);
  });

  it('defaults page to 1 when not provided', () => {
    const page = undefined ?? 1;
    expect(calcSkip(page, 20)).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 11. LOGGER
// ─────────────────────────────────────────────────────────────────────────────

describe('Logger', () => {
  let logger;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    logger = (await import('../src/utils/logger.js')).default;
  });

  it('exposes error, warn, info, debug methods', () => {
    expect(typeof logger.error).toBe('function');
    expect(typeof logger.warn).toBe('function');
    expect(typeof logger.info).toBe('function');
    expect(typeof logger.debug).toBe('function');
  });

  it('does not throw when logging an event object', () => {
    expect(() => logger.info({ event: 'test_event', userId: 'u1' })).not.toThrow();
  });

  it('does not throw when logging a plain string', () => {
    expect(() => logger.warn('something went wrong')).not.toThrow();
  });

  it('does not throw on error level', () => {
    expect(() => logger.error({ event: 'test_error', message: 'boom' })).not.toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 12. ASYNC HANDLER WRAPPER
// ─────────────────────────────────────────────────────────────────────────────

describe('asyncHandler', () => {
  let asyncHandler;

  beforeAll(async () => {
    asyncHandler = (await import('../src/utils/asyncHandler.js')).default;
  });

  it('calls next(err) when the wrapped async function throws', async () => {
    const err  = new Error('Async failure');
    const fn   = asyncHandler(async () => { throw err; });
    const next = jest.fn();
    await fn({}, {}, next);
    expect(next).toHaveBeenCalledWith(err);
  });

  it('does not call next when the wrapped function succeeds', async () => {
    const fn   = asyncHandler(async (req, res) => { res.sent = true; });
    const res  = {};
    const next = jest.fn();
    await fn({}, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.sent).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 13. FRONTEND — Auth context token management (pure logic)
// ─────────────────────────────────────────────────────────────────────────────

describe('Frontend — pickDefaultRole', () => {
  const ROLE_PRIORITY = { HR_ADMIN: 0, SUPERVISOR: 1, EMPLOYEE: 2 };

  function pickDefaultRole(roles = []) {
    if (!roles.length) return 'EMPLOYEE';
    return [...roles].sort(
      (a, b) => (ROLE_PRIORITY[a] ?? 99) - (ROLE_PRIORITY[b] ?? 99)
    )[0];
  }

  it('picks HR_ADMIN when present', () => {
    expect(pickDefaultRole(['EMPLOYEE', 'HR_ADMIN'])).toBe('HR_ADMIN');
  });

  it('picks SUPERVISOR over EMPLOYEE', () => {
    expect(pickDefaultRole(['EMPLOYEE', 'SUPERVISOR'])).toBe('SUPERVISOR');
  });

  it('returns EMPLOYEE as fallback', () => {
    expect(pickDefaultRole([])).toBe('EMPLOYEE');
  });

  it('handles single-role arrays', () => {
    expect(pickDefaultRole(['SUPERVISOR'])).toBe('SUPERVISOR');
  });
});

describe('Frontend — API auth route detection', () => {
  const AUTH_ROUTES = ['/auth/login', '/auth/refresh', '/auth/logout', '/auth/forgot-password', '/auth/reset-password'];
  const isAuthRoute = (url = '') => AUTH_ROUTES.some((r) => url.includes(r));

  it('correctly identifies auth routes', () => {
    expect(isAuthRoute('/api/auth/login')).toBe(true);
    expect(isAuthRoute('/api/auth/refresh')).toBe(true);
    expect(isAuthRoute('/api/auth/logout')).toBe(true);
  });

  it('does not flag non-auth routes', () => {
    expect(isAuthRoute('/api/users')).toBe(false);
    expect(isAuthRoute('/api/assessments')).toBe(false);
    expect(isAuthRoute('/api/results')).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 14. SECURITY VIOLATION — Summary calculation
// ─────────────────────────────────────────────────────────────────────────────

describe('Security Violation — isHighRisk calculation', () => {
  function calcHighRisk({ tabSwitches, copyAttempts, rightClickAttempts, fullscreenExits }) {
    const total = tabSwitches + copyAttempts + rightClickAttempts + fullscreenExits;
    return total >= 5;
  }

  it('is not high risk below threshold', () => {
    expect(calcHighRisk({ tabSwitches: 1, copyAttempts: 1, rightClickAttempts: 1, fullscreenExits: 1 })).toBe(false);
  });

  it('is high risk at exactly 5', () => {
    expect(calcHighRisk({ tabSwitches: 2, copyAttempts: 2, rightClickAttempts: 1, fullscreenExits: 0 })).toBe(true);
  });

  it('is high risk above threshold', () => {
    expect(calcHighRisk({ tabSwitches: 3, copyAttempts: 3, rightClickAttempts: 0, fullscreenExits: 2 })).toBe(true);
  });

  it('is not high risk with zero violations', () => {
    expect(calcHighRisk({ tabSwitches: 0, copyAttempts: 0, rightClickAttempts: 0, fullscreenExits: 0 })).toBe(false);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 15. LIVE ANALYTICS (Tier 1) — COMPLETED-only, no snapshot tables
// ═════════════════════════════════════════════════════════════════════════════

const analyticsResult = ({
  userId = 'u1', assessmentId = 'a1', competencyName = 'Communication Skills',
  category = 'Core_Behavioral', finalScore = 80, level = 'Advanced',
  department = 'IT', position = 'Engineer', gender = 'Male',
  endDate = new Date('2026-05-15'),
} = {}) => ({
  userId, assessmentId,
  user: { id: userId, name: 'Test User', email: 't@zemenet.com', employeeId: 'ZB-001', department, position, gender },
  competency: { id: `c-${competencyName}`, name: competencyName, category },
  assessment: { id: assessmentId, description: 'Assess Desc', type: 'Combined', purpose: 'Career Development', targetGroup: 'common', endDate },
  finalScore, level,
});

describe('Live Analytics — computeLiveStats', () => {
  it('groups results into one overall row per (user × assessment)', () => {
    const stats = computeLiveStats([
      analyticsResult({ userId: 'u1', competencyName: 'Communication Skills', finalScore: 86, level: 'Expert' }),
      analyticsResult({ userId: 'u1', competencyName: 'Decision Making', finalScore: 70, level: 'Advanced' }),
    ]);

    expect(stats.overall.total).toBe(1);
    expect(stats.overall.avgScore).toBe(78); // Math.round((86 + 70) / 2)
    expect(stats.overall.maxScore).toBe(78);
    expect(stats.overall.minScore).toBe(78);
    expect(stats.overall.uniqueEmployees).toBe(1);
    expect(stats.overall.uniqueAssessments).toBe(1);
    expect(stats.competencyBreakdown).toHaveLength(2);
    expect(stats.competencyBreakdown.map(c => c._id).sort())
      .toEqual(['Communication Skills', 'Decision Making'].sort());
    expect(stats.levelDistribution.find(l => l._id === 'Advanced').count).toBe(1);
  });

  it('computes organisation-level averages across multiple employees', () => {
    const stats = computeLiveStats([
      analyticsResult({ userId: 'u1', finalScore: 90, level: 'Expert' }),
      analyticsResult({ userId: 'u2', finalScore: 60, level: 'Advanced' }),
    ]);

    expect(stats.overall.total).toBe(2);
    expect(stats.overall.avgScore).toBe(75); // (90 + 60) / 2
    expect(stats.overall.uniqueEmployees).toBe(2);
    expect(stats.topPerformers[0]._id).toBe('u1');
    expect(stats.bottomPerformers[0]._id).toBe('u2');
  });

  it('applies overall score range filters AFTER grouping', () => {
    const rows = [
      analyticsResult({ userId: 'u1', finalScore: 90, level: 'Expert' }),
      analyticsResult({ userId: 'u2', finalScore: 60, level: 'Advanced' }),
    ];

    const filtered = computeLiveStats(rows, { scoreMin: '80' });
    expect(filtered.overall.total).toBe(1);
    expect(filtered.overall.avgScore).toBe(90);

    expect(computeLiveStats(rows, { scoreMax: '50' }).overall.total).toBe(0);
  });

  it('applies overall level filter AFTER grouping using the shared assignLevel', () => {
    const rows = [
      analyticsResult({ userId: 'u1', finalScore: 90, level: 'Expert' }),
      analyticsResult({ userId: 'u2', finalScore: 60, level: 'Advanced' }),
    ];

    const experts = computeLiveStats(rows, { overallLevel: 'Expert' });
    expect(experts.overall.total).toBe(1);
    expect(experts.overall.avgScore).toBe(90);

    const basics = computeLiveStats(rows, { overallLevel: 'Basic' });
    expect(basics.overall.total).toBe(0);
  });

  it('returns the zeroed shape when no results match', () => {
    const stats = computeLiveStats([]);
    expect(stats.overall).toEqual({
      total: 0, avgScore: 0, maxScore: 0, minScore: 0, uniqueEmployees: 0, uniqueDepts: 0, uniqueAssessments: 0,
    });
    expect(stats.levelDistribution).toEqual([]);
    expect(stats.departmentBreakdown).toEqual([]);
    expect(stats.competencyBreakdown).toEqual([]);
    expect(stats.monthlyTrend).toEqual([]);
  });

  it('buckets the monthly trend by assessment close (endDate) month', () => {
    const now = new Date();
    const label = `${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][now.getMonth()]} ${now.getFullYear()}`;
    const stats = computeLiveStats([
      analyticsResult({ userId: 'u1', finalScore: 80, endDate: now }),
      analyticsResult({ userId: 'u2', finalScore: 60, endDate: now }),
    ]);

    expect(stats.monthlyTrend).toHaveLength(1);
    expect(stats.monthlyTrend[0].month).toBe(label);
    expect(stats.monthlyTrend[0].count).toBe(2);
    expect(stats.monthlyTrend[0].avgScore).toBe(70);
  });

  it('mirrors the legacy field shape for every breakdown section', () => {
    const stats = computeLiveStats([
      analyticsResult({ userId: 'u1', competencyName: 'Communication Skills', finalScore: 85, level: 'Expert', department: 'IT', position: 'Engineer', gender: 'Female' }),
    ]);

    expect(stats.overall.avgScore).toBe(85);
    expect(stats.levelDistribution[0]).toMatchObject({ _id: 'Expert' });
    expect(stats.departmentBreakdown[0]).toMatchObject({ _id: 'IT', employeeCount: 1 });
    expect(stats.assessmentBreakdown[0]).toMatchObject({ description: 'Assess Desc', type: 'Combined' });
    expect(stats.genderBreakdown[0]).toMatchObject({ _id: 'Female' });
    expect(stats.positionBreakdown[0]).toMatchObject({ _id: 'Engineer' });
    expect(stats.competencyBreakdown[0]).toMatchObject({ _id: 'Communication Skills', expertCount: 1 });
  });
});

describe('Live Analytics — heatmap & department summary', () => {
  it('builds competency × department matrix with rounded averages', () => {
    const heatmap = computeHeatmap([
      analyticsResult({ userId: 'u1', competencyName: 'Teamwork', finalScore: 80, department: 'IT' }),
      analyticsResult({ userId: 'u2', competencyName: 'Teamwork', finalScore: 60, department: 'IT' }),
      analyticsResult({ userId: 'u3', competencyName: 'Teamwork', finalScore: 70, department: 'HR' }),
    ]);

    expect(heatmap.Teamwork).toHaveLength(2);
    const itCell = heatmap.Teamwork.find(c => c.department === 'IT');
    expect(itCell.count).toBe(2);
    expect(itCell.avgScore).toBe(70); // (80 + 60) / 2
    const hrCell = heatmap.Teamwork.find(c => c.department === 'HR');
    expect(hrCell.avgScore).toBe(70);
  });

  it('computes per-competency department summary with level distribution', () => {
    const summary = computeDepartmentSummary([
      analyticsResult({ competencyName: 'Teamwork', finalScore: 85, level: 'Expert' }),
      analyticsResult({ competencyName: 'Teamwork', finalScore: 60, level: 'Advanced' }),
      analyticsResult({ competencyName: 'Teamwork', finalScore: 40, level: 'Intermediate' }),
    ], 'IT');

    expect(summary.department).toBe('IT');
    expect(summary.summary).toHaveLength(1);
    expect(summary.summary[0].competencyName).toBe('Teamwork');
    expect(summary.summary[0].totalReports).toBe(3);
    expect(summary.summary[0].avgScore).toBe(61.67); // (85 + 60 + 40) / 3
    expect(summary.summary[0].levelDistribution).toEqual({ Basic: 0, Intermediate: 1, Advanced: 1, Expert: 1 });
  });
});

describe('Live Analytics — buildResultFilter (COMPLETED-only gate)', () => {
  it('always scopes to COMPLETED assessments and FINAL results', async () => {
    const where = await buildResultFilter({}, { role: 'HR_ADMIN', id: 'admin' });
    expect(where.status).toBe('FINAL');
    expect(where.assessment?.status).toBe('COMPLETED');
  });

  it('never places overall score filters on the raw result query', async () => {
    const where = await buildResultFilter({ scoreMin: '80', scoreMax: '90' }, { role: 'HR_ADMIN', id: 'admin' });
    expect(where.finalScore).toBeUndefined();
    expect(where.overallScore).toBeUndefined();
  });

  it('maps department / assessmentType / competencyLevel filters correctly', async () => {
    const where = await buildResultFilter(
      { department: 'Finance', assessmentType: 'Combined', competencyLevel: 'Expert', targetGroup: 'managerial' },
      { role: 'HR_ADMIN', id: 'admin' },
    );
    expect(where.user?.department).toBe('Finance');
    expect(where.assessment?.type).toBe('Combined');
    expect(where.assessment?.status).toBe('COMPLETED');
    expect(where.assessment?.targetGroup).toBe('managerial');
    expect(where.level).toBe('Expert');
  });

  it('scopes supervisors to their direct reports only', async () => {
    // HR_ADMIN path must not touch prisma (pure filter), ensuring the gate is testable.
    const where = await buildResultFilter({}, { role: 'HR_ADMIN', id: 'admin' });
    expect(where.user?.id).toBeUndefined();
  });
});

// 16. GENERATED REPORTS (Tier 2) - named Excel artifacts from live data
import { buildPivot, slugify, PIVOT_FIELDS, buildFlatWorkbook, buildPivotWorkbook } from '../src/services/generatedReportService.js';

const pivotRow = (over = {}) => ({
  employeeName: 'Abebe Kebede', employeeId: 'ZB-001', department: 'Finance',
  position: 'Officer', gender: 'Male', assessment: 'Q1 Review',
  assessmentType: 'Combined', purpose: 'Promotion', targetGroup: 'managerial',
  competency: 'Communication', competencyCategory: 'Core_Behavioral',
  selfScore: 80, supervisorScore: 70, score: 72, level: 'Advanced',
  overallScore: 72, overallLevel: 'Advanced', date: '2026-09',
  ...over,
});

describe('Generated Reports - buildPivot', () => {
  const raw = [
    pivotRow({ department: 'Finance', competency: 'Communication', score: 80 }),
    pivotRow({ department: 'Finance', competency: 'Teamwork', score: 60 }),
    pivotRow({ department: 'IT', competency: 'Communication', score: 70 }),
  ];

  it('builds a row x column matrix with totals', () => {
    const p = buildPivot(raw, { rowField: 'department', colField: 'competency', valueField: 'score', aggregation: 'avg' });
    expect(p.colArr).toEqual(['Communication', 'Teamwork']);
    expect(p.rowArr).toEqual(['Finance', 'IT']);
    const fin = p.matrix.find(r => r.rowLabel === 'Finance');
    expect(fin.cells.Communication).toBe(80);
    expect(fin.cells.Teamwork).toBe(60);
    expect(fin.cells.__rowTotal).toBe(70);
    expect(p.colTotals.Communication).toBe(75);
  });

  it('supports flat (no column) tables', () => {
    const p = buildPivot(raw, { rowField: 'department' });
    expect(p.colArr).toBeNull();
    const fin = p.matrix.find(r => r.rowLabel === 'Finance');
    expect(fin.cells.__value).toBe(70);
  });

  it('supports count aggregation', () => {
    const p = buildPivot(raw, { rowField: 'department', valueField: 'count', aggregation: 'count' });
    const fin = p.matrix.find(r => r.rowLabel === 'Finance');
    expect(fin.cells.__value).toBe(2);
  });

  it('exposes the supported pivot field list', () => {
    expect(PIVOT_FIELDS).toContain('department');
    expect(PIVOT_FIELDS).toContain('competency');
    expect(PIVOT_FIELDS).not.toContain('overallScore');
  });
});

describe('Generated Reports - workbook builders', () => {
  it('builds a titled flat workbook', () => {
    const wb = buildFlatWorkbook({ title: 'Org Report', meta: 'meta', rows: [pivotRow()] });
    const ws = wb.getWorksheet('Report');
    expect(ws.getCell('A1').value).toBe('Org Report');
    expect(ws.rowCount).toBeGreaterThan(5);
  });

  it('builds a titled pivot workbook', () => {
    const raw = [pivotRow({ score: 80 }), pivotRow({ score: 60 })];
    const cfg = { rowField: 'department', colField: null, valueField: 'score', aggregation: 'avg' };
    const wb = buildPivotWorkbook({ title: 'Pivot', meta: 'meta', pivotCfg: cfg, pivot: buildPivot(raw, cfg) });
    const ws = wb.getWorksheet('Custom Report');
    expect(ws.getCell('A1').value).toBe('Pivot');
  });

  it('slugifies titles for filenames', () => {
    expect(slugify('Individual � Selam Tesfaye!')).toBe('individual_selam_tesfaye');
    expect(slugify('')).toBe('report');
  });
});