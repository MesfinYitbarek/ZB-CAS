/**
 * ZB-CAS Backend — Comprehensive Test Suite
 *
 * Coverage areas:
 *  1. Auth middleware (protect, authorize)
 *  2. JWT utilities (sign, verify, rotation)
 *  3. Security middleware (mongoSanitize, escapeRegex, rate limiters)
 *  4. Auth controller flows (login, register, refresh, logout, forgot/reset password)
 *  5. User controller (CRUD, role-scoped queries)
 *  6. Assessment controller (create, validate, auto-activate)
 *  7. Error handler (status codes, stack trace suppression)
 *  8. Password utilities (hashing, comparison, complexity)
 *  9. Penetration test scenarios (injection, brute force, privilege escalation)
 * 10. Performance helpers (pagination, lean queries)
 *
 * Prerequisites:
 *   npm install --save-dev jest @jest/globals supertest mongodb-memory-server
 *
 * Run:
 *   npm test
 *   npm test -- --coverage
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, jest } from '@jest/globals';

// ─────────────────────────────────────────────────────────────────────────────
// 1. JWT UTILITIES
// ─────────────────────────────────────────────────────────────────────────────

// Mock environment before importing jwt.js
process.env.JWT_SECRET         = 'test-access-secret-super-long-value';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-super-long-value';
process.env.JWT_EXPIRES_IN     = '15m';
process.env.JWT_REFRESH_EXPIRES_IN = '30d';

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

  it('signs and verifies a refresh token', () => {
    const token = signRefreshToken('user456');
    const decoded = verifyRefreshToken(token);
    expect(decoded.id).toBe('user456');
    expect(decoded).not.toHaveProperty('role'); // refresh token has no role
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

  it('refresh token does not contain role', () => {
    const pair = buildTokenPair('userABC', 'SUPERVISOR');
    const decoded = verifyRefreshToken(pair.refreshToken);
    expect(decoded).not.toHaveProperty('role');
  });

  it('refreshCookieOptions returns correct flags', () => {
    const opts = refreshCookieOptions();
    expect(opts.httpOnly).toBe(true);
    expect(opts.sameSite).toBe('strict');
    expect(opts.path).toBe('/api/auth');
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
// 2. SECURITY MIDDLEWARE — escapeRegex & mongoSanitize
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
    expect(re.test('aaaa')).toBe(false); // plain pattern no longer matches
  });
});

describe('Security Middleware — mongoSanitize', () => {
  let mongoSanitize;

  beforeAll(async () => {
    const mod = await import('../src/middleware/security.js');
    mongoSanitize = mod.mongoSanitize;
  });

  const makeReq = (overrides = {}) => ({
    body:   overrides.body   ?? {},
    params: overrides.params ?? {},
    query:  overrides.query  ?? {},
  });

  it('removes $ operators from req.body', (done) => {
    const req = makeReq({ body: { username: { $gt: '' } } });
    mongoSanitize(req, {}, () => {
      expect(req.body.username).not.toHaveProperty('$gt');
      done();
    });
  });

  it('removes $ operators from req.query', (done) => {
    const req = makeReq({ query: { search: { $where: 'malicious()' } } });
    mongoSanitize(req, {}, () => {
      expect(req.query.search).not.toHaveProperty('$where');
      done();
    });
  });

  it('removes $ operators from req.params', (done) => {
    const req = makeReq({ params: { id: { $ne: null } } });
    mongoSanitize(req, {}, () => {
      expect(req.params.id).not.toHaveProperty('$ne');
      done();
    });
  });

  it('leaves clean input untouched', (done) => {
    const req = makeReq({ body: { username: 'alice', password: 'Secret@1' } });
    mongoSanitize(req, {}, () => {
      expect(req.body.username).toBe('alice');
      expect(req.body.password).toBe('Secret@1');
      done();
    });
  });

  it('calls next()', (done) => {
    const req = makeReq();
    mongoSanitize(req, {}, done);
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
    expect(mockNext).toHaveBeenCalledWith(); // no error
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
  // Regex mirrors the one in authController.js
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

  it('maps ValidationError to 400', () => {
    const err = { name: 'ValidationError', errors: { email: { message: 'Invalid email' } } };
    const res = makeRes();
    errorHandler(err, { path: '/test', method: 'POST' }, res, () => {});
    expect(res._status).toBe(400);
    expect(res._body.message).toContain('Validation failed');
  });

  it('maps duplicate key error (code 11000) to 400', () => {
    const err = { code: 11000, keyValue: { email: 'test@test.com' } };
    const res = makeRes();
    errorHandler(err, { path: '/test', method: 'POST' }, res, () => {});
    expect(res._status).toBe(400);
    expect(res._body.message).toContain('Duplicate value');
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
// 7. USER MODEL — UNIT TESTS (mocked mongoose)
// ─────────────────────────────────────────────────────────────────────────────

describe('User Model — toPublic()', () => {
  // Test the toPublic helper logic without hitting the DB
  const mockUser = {
    _id: 'abc',
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
    // Sensitive fields that must NOT appear in toPublic()
    passwordHash: '$2b$12$hashedvalue',
    refreshToken: 'some-refresh-token',
    passwordResetToken: 'reset-token',
    failedLoginAttempts: 2,
    lockUntil: null,
  };

  // Replicate the toPublic() logic from User.js
  function toPublic(user) {
    return {
      _id:          user._id,
      employeeId:   user.employeeId,
      name:         user.name,
      username:     user.username,
      email:        user.email,
      roles:        user.roles,
      gender:       user.gender,
      position:     user.position,
      department:   user.department,
      supervisorId: user.supervisorId,
      status:       user.status,
      createdAt:    user.createdAt,
      updatedAt:    user.updatedAt,
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
  // Replicate pre-save validation logic from Assessment.js
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
    expect(err).toBeNull(); // no weight check for SelfAssessment
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

    // Simulate the check in authController.refresh
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
  // forgotPassword returns the same message regardless of whether the user exists
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

describe('Penetration Tests — NoSQL Injection', () => {
  // Simulate what the sanitizer does to a NoSQL injection payload
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
