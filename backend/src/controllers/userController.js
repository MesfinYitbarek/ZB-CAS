/* controllers/userController.js */
import ExcelJS from 'exceljs';
import prisma from '../config/prisma.js';
import AppError from '../utils/AppError.js';
import asyncHandler from '../utils/asyncHandler.js';
import logger from '../utils/logger.js';
import { hashPassword, DEFAULT_USER_PASSWORD } from '../utils/password.js';
import { toPublic } from '../utils/userHelpers.js';
import { notifyAccountCreated } from '../services/notificationService.js';
import { logActivity } from '../services/activityService.js';

// ─── GET ALL USERS ────────────────────────────────────────────────────────────
const USER_SORTABLE_FIELDS = new Set([
  'employeeId', 'name', 'username', 'email', 'position', 'department', 'status', 'createdAt',
]);

export const getUsers = asyncHandler(async (req, res) => {
  const { department, role, status, page = 1, limit = 20, search, sortBy, sortDir } = req.query;

  const where = {};
  if (department) where.department = department;
  if (status)     where.status     = status;

  if (role) {
    where.roles = { has: role };
  }

  if (search) {
    where.OR = [
      { name:       { contains: search, mode: 'insensitive' } },
      { email:      { contains: search, mode: 'insensitive' } },
      { employeeId: { contains: search, mode: 'insensitive' } },
      { username:   { contains: search, mode: 'insensitive' } },
    ];
  }

  if (req.user.role === 'SUPERVISOR') {
    where.supervisorId = req.user.id;
  }

  const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);

  // Whitelisted server-side sorting (roles is an array — not sortable via orderBy)
  const sortField = USER_SORTABLE_FIELDS.has(sortBy) ? sortBy : 'createdAt';
  const sortOrder = sortDir === 'asc' ? 'asc' : 'desc';

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      include: { supervisor: { select: { id: true, name: true, email: true, employeeId: true } } },
      skip,
      take: parseInt(limit, 10),
      orderBy: { [sortField]: sortOrder },
    }),
    prisma.user.count({ where }),
  ]);

  res.status(200).json({
    status: 'success',
    data: {
      users: users.map((u) => ({
        _id:          u.id,
        employeeId:   u.employeeId,
        name:         u.name,
        username:     u.username,
        email:        u.email,
        roles:        u.roles,
        gender:       u.gender,
        position:     u.position,
        department:   u.department,
        supervisorId: u.supervisor || null,
        status:       u.status,
        createdAt:    u.createdAt,
      })),
      pagination: { total, page: parseInt(page, 10), limit: parseInt(limit, 10) },
    },
  });
});

// ─── GET SINGLE USER ─────────────────────────────────────────────────────────
export const getUser = asyncHandler(async (req, res, next) => {
  const user = await prisma.user.findUnique({
    where: { id: req.params.id },
    include: { supervisor: { select: { id: true, name: true, email: true } } },
  });

  if (!user) return next(new AppError('User not found.', 404));

  if (req.user.role === 'SUPERVISOR') {
    const isSelf = req.params.id === req.user.id;
    const isReport = user.supervisor?.id === req.user.id;
    if (!isSelf && !isReport) {
      return next(new AppError('You do not have permission to view this user.', 403));
    }
  }

  const { passwordHash, refreshToken, passwordResetToken, passwordResetExpires, failedLoginAttempts, lockUntil, ...safe } = user;
  const { supervisor, ...rest } = safe;
  res.status(200).json({ status: 'success', data: { user: { ...rest, _id: user.id, supervisorId: supervisor || null } } });
});

// ─── GET MY PROFILE ──────────────────────────────────────────────────────────
export const getMe = asyncHandler(async (req, res, next) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    include: { supervisor: { select: { id: true, name: true, email: true } } },
  });

  if (!user) return next(new AppError('User not found.', 404));
  const { passwordHash, refreshToken, passwordResetToken, passwordResetExpires, failedLoginAttempts, lockUntil, supervisor, ...rest } = user;
  res.status(200).json({ status: 'success', data: { user: { ...rest, _id: user.id, supervisorId: supervisor || null } } });
});

// ─── GET SUPERVISOR EMPLOYEES ─────────────────────────────────────────────────
export const getSupervisorEmployees = asyncHandler(async (req, res, next) => {
  if (req.user.role === 'SUPERVISOR' && req.params.id !== req.user.id) {
    return next(new AppError('You can only view your own team members.', 403));
  }

  const employees = await prisma.user.findMany({
    where: { supervisorId: req.params.id, status: 'ACTIVE' },
    include: { supervisor: { select: { id: true, name: true, email: true } } },
    orderBy: { name: 'asc' },
  });

  res.status(200).json({
    status: 'success',
    data: {
      employees: employees.map((u) => ({
        _id:          u.id,
        employeeId:   u.employeeId,
        name:         u.name,
        username:     u.username,
        email:        u.email,
        roles:        u.roles,
        gender:       u.gender,
        position:     u.position,
        department:   u.department,
        supervisorId: u.supervisor || null,
        status:       u.status,
      })),
    },
  });
});

const EMAIL_RE_UPDATE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_RE = /^[a-z0-9._-]+$/;

// ─── UPDATE USER ──────────────────────────────────────────────────────────────
export const updateUser = asyncHandler(async (req, res, next) => {
  const allowedFields = [
    'name', 'employeeId', 'username', 'email', 'position', 'department',
    'supervisorId', 'roles', 'gender', 'status',
  ];

  const updates = {};

  allowedFields.forEach((field) => {
    const value = req.body[field];
    if (field === 'supervisorId') {
      if (value === '' || value === null) updates.supervisorId = null;
      else if (value !== undefined)       updates.supervisorId = value;
    } else if (field === 'roles') {
      if (value !== undefined) updates.roles = Array.isArray(value) ? value : [value];
    } else {
      if (value !== undefined) updates[field] = value;
    }
  });

  if (Object.keys(updates).length === 0) {
    return next(new AppError('No valid fields to update.', 400));
  }

  // ── Normalize + validate unique identity fields (employeeId is optional) ──
  if (updates.employeeId !== undefined) {
    updates.employeeId = String(updates.employeeId).trim() || null;
  }
  if (updates.username !== undefined) {
    updates.username = String(updates.username).toLowerCase().trim();
    if (!updates.username) return next(new AppError('Username is required.', 400));
    if (!USERNAME_RE.test(updates.username)) {
      return next(new AppError('Username may only contain lowercase letters, numbers, dots, hyphens, and underscores.', 400));
    }
  }
  if (updates.email !== undefined) {
    updates.email = String(updates.email).toLowerCase().trim();
    if (!updates.email) return next(new AppError('Email is required.', 400));
    if (!EMAIL_RE_UPDATE.test(updates.email)) {
      return next(new AppError('Invalid email format.', 400));
    }
  }
  if (updates.name !== undefined && typeof updates.name === 'string') {
    updates.name = updates.name.trim();
    if (!updates.name) return next(new AppError('Full name is required.', 400));
  }

  // ── Uniqueness checks (excluding self; skip empty optional employeeId) ──
  const uniqueFields = ['employeeId', 'username', 'email'].filter(
    (f) => updates[f] !== undefined && updates[f] !== null && updates[f] !== ''
  );
  if (uniqueFields.length) {
    // Use case-insensitive match to catch `John@x.com` vs `john@x.com` style dupes
    const conflicts = await prisma.user.findMany({
      where: {
        id: { not: req.params.id },
        OR: uniqueFields.map((key) => ({ [key]: { equals: updates[key], mode: 'insensitive' } })),
      },
      select: { employeeId: true, username: true, email: true },
    });
    for (const c of conflicts) {
      if (updates.employeeId !== undefined && c.employeeId?.toLowerCase() === updates.employeeId.toLowerCase()) {
        return next(new AppError(`Employee ID "${updates.employeeId}" is already in use.`, 409));
      }
      if (updates.username !== undefined && c.username?.toLowerCase() === updates.username.toLowerCase()) {
        return next(new AppError(`Username "${updates.username}" is already in use.`, 409));
      }
      if (updates.email !== undefined && c.email?.toLowerCase() === updates.email.toLowerCase()) {
        return next(new AppError(`Email "${updates.email}" is already in use.`, 409));
      }
    }
  }

  let user;
  try {
    user = await prisma.user.update({
      where: { id: req.params.id },
      data: updates,
      include: { supervisor: { select: { id: true, name: true, email: true } } },
    });
  } catch (err) {
    // Fallback for race-condition dupes surfacing as Prisma unique-constraint errors
    if (err?.code === 'P2002') {
      const target = Array.isArray(err.meta?.target) ? err.meta.target.join(', ') : 'field';
      return next(new AppError(`This ${target} is already in use.`, 409));
    }
    if (err?.code === 'P2025') {
      return next(new AppError('User not found.', 404));
    }
    throw err;
  }

  await logActivity({
    req,
    action: 'updated',
    entity: 'User',
    entityId: user.id,
    description: `User "${user.name}" updated`,
    metadata: { fields: Object.keys(updates) },
  });

  res.status(200).json({ status: 'success', data: { user: toPublic(user) } });
});

// ─── SOFT DELETE ─────────────────────────────────────────────────────────────
export const deleteUser = asyncHandler(async (req, res, next) => {
  const user = await prisma.user.update({
    where: { id: req.params.id },
    data: { status: 'INACTIVE' },
  });

  await logActivity({
    req,
    action: 'deactivated',
    entity: 'User',
    entityId: user.id,
    description: `User "${user.name}" deactivated`,
  });

  res.status(200).json({ status: 'success', message: 'User deactivated.' });
});

// ─── BULK UPDATE STATUS (activate / deactivate many) ──────────────────────────
export const bulkUpdateUserStatus = asyncHandler(async (req, res, next) => {
  const { ids, status } = req.body;

  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    return next(new AppError('Please provide an array of user IDs.', 400));
  }
  if (!['ACTIVE', 'INACTIVE'].includes(status)) {
    return next(new AppError('Status must be ACTIVE or INACTIVE.', 400));
  }
  if (ids.length > 500) {
    return next(new AppError('Bulk update limited to 500 users at a time.', 400));
  }

  // Never allow an admin to change their own account status in bulk
  const uniqueIds = [...new Set(ids)];
  const skippedSelf = uniqueIds.includes(req.user.id) ? 1 : 0;
  const filtered = uniqueIds.filter((id) => id !== req.user.id);
  if (!filtered.length) {
    return next(new AppError('You cannot change your own account status.', 400));
  }

  const result = await prisma.user.updateMany({
    where: { id: { in: filtered } },
    data: { status },
  });

  await logActivity({
    req,
    action: status === 'ACTIVE' ? 'bulk_activated' : 'bulk_deactivated',
    entity: 'User',
    description: `${result.count} user(s) ${status === 'ACTIVE' ? 'activated' : 'deactivated'}`,
    metadata: { count: result.count, status, skippedSelf },
  });

  res.status(200).json({
    status: 'success',
    message: `${result.count} user(s) ${status === 'ACTIVE' ? 'activated' : 'deactivated'}.`,
    data: { updated: result.count, skippedSelf },
  });
});

// ─── BULK SOFT-DELETE (deactivate many) ───────────────────────────────────────
export const bulkDeleteUsers = asyncHandler(async (req, res, next) => {
  const { ids } = req.body;

  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    return next(new AppError('Please provide an array of user IDs.', 400));
  }
  if (ids.length > 500) {
    return next(new AppError('Bulk delete limited to 500 users at a time.', 400));
  }

  // Never allow an admin to delete their own account
  const uniqueIds = [...new Set(ids)];
  const skippedSelf = uniqueIds.includes(req.user.id) ? 1 : 0;
  const filtered = uniqueIds.filter((id) => id !== req.user.id);
  if (!filtered.length) {
    return next(new AppError('You cannot delete your own account.', 400));
  }

  const result = await prisma.user.updateMany({
    where: { id: { in: filtered } },
    data: { status: 'INACTIVE' },
  });

  await logActivity({
    req,
    action: 'bulk_deleted',
    entity: 'User',
    description: `${result.count} user(s) deactivated`,
    metadata: { count: result.count, skippedSelf },
  });

  res.status(200).json({
    status: 'success',
    message: `${result.count} user(s) deleted.`,
    data: { deleted: result.count, skippedSelf },
  });
});

// ═══ BULK IMPORT (Excel / CSV) ═══════════════════════════════════════════════
const ROLE_SET = new Set(['HR_ADMIN', 'SUPERVISOR', 'EMPLOYEE']);
const GENDER_SET = new Set(['Male', 'Female']);
const STATUS_SET = new Set(['ACTIVE', 'INACTIVE']);

// Map common header spellings/synonyms → canonical field
const HEADER_ALIASES = {
  'employeeid': 'employeeId', 'emp id': 'employeeId', 'empid': 'employeeId',
  'employeenumber': 'employeeId', 'employee no': 'employeeId',
  'name': 'name', 'fullname': 'name', 'full name': 'name', 'employee name': 'name',
  'username': 'username', 'user name': 'username', 'login': 'username',
  'email': 'email', 'e-mail': 'email', 'emailaddress': 'email', 'email address': 'email',
  'role': 'role', 'roles': 'role', 'designation': 'role',
  'gender': 'gender', 'sex': 'gender',
  'position': 'position', 'job title': 'position', 'title': 'position', 'jobtitle': 'position',
  'department': 'department', 'dept': 'department', 'deptartment': 'department',
  'supervisor': 'supervisor', 'manager': 'supervisor', 'supervisorusername': 'supervisor',
  'supervisorusername/employeeid': 'supervisor', 'supervisorid': 'supervisor',
  'status': 'status', 'user status': 'status', 'employeestatus': 'status',
};

const normalizeHeader = (h) =>
  HEADER_ALIASES[(h || '').toString().trim().toLowerCase()] || null;

const toCell = (v) => (v === null || v === undefined ? '' : String(v).trim());

// Manual CSV parser — handles quoted fields, commas inside quotes, and CRLF.
function parseCSV(text) {
  const rows = [];
  let cur = '';
  let row = [];
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cur += '"'; i++; }
        else inQuotes = false;
      } else cur += ch;
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(cur); cur = '';
    } else if (ch === '\n') {
      row.push(cur); rows.push(row); row = []; cur = '';
    } else if (ch === '\r') {
      // skip, handle \n
    } else {
      cur += ch;
    }
  }
  if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

// Parse uploaded buffer into an array of plain objects (header → value).
async function parseImportBuffer(buffer, filename = '') {
  const lower = (filename || '').toLowerCase();

  if (lower.endsWith('.csv') || lower.endsWith('.txt')) {
    const text = buffer.toString('utf8').replace(/^\uFEFF/, '');
    const rows = parseCSV(text);
    if (rows.length < 2) throw new AppError('CSV must contain a header row and at least one data row.', 400);
    return rowsToObjects(rows);
  }

  if (lower.endsWith('.xlsx') || lower.endsWith('.xls')) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer);
    const ws = wb.worksheets[0];
    if (!ws || ws.rowCount < 2) throw new AppError('XLSX must contain a header row and at least one data row.', 400);
    const rows = [];
    ws.eachRow((r, n) => {
      const vals = [];
      r.eachCell({ includeEmpty: true }, (c) => vals.push(c.value));
      rows.push(vals.map((v) => (v === null || v === undefined ? '' : String(v))));
    });
    return rowsToObjects(rows);
  }

  throw new AppError('Unsupported file type. Please upload a .xlsx, .xls, or .csv file.', 400);
}

function rowsToObjects(rows) {
  const header = rows[0].map(normalizeHeader);
  if (header.every((h) => h === null)) {
    throw new AppError('Could not detect a valid header row. Use the provided template.', 400);
  }
  const data = [];
  for (let i = 1; i < rows.length; i++) {
    const obj = {};
    rows[i].forEach((cellVal, idx) => {
      const key = header[idx];
      if (key) obj[key] = cellVal;
    });
    if (Object.keys(obj).length) data.push(obj);
  }
  return data;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function buildRowError(row, message) {
  return { row: row.__line, message };
}

function parseRoles(raw) {
  if (raw === undefined || raw === null || String(raw).trim() === '') return ['EMPLOYEE'];
  const parts = String(raw).split(/[;,|/]+/).map((s) => s.trim().toUpperCase()).filter(Boolean);
  const singles = [];
  parts.forEach((p) => {
    if (p.includes('&')) singles.push(...p.split('&').map((s) => s.trim()).filter(Boolean));
    else singles.push(p);
  });
  return singles;
}

function parseSupervisorRef(raw) {
  if (!raw || !String(raw).trim()) return null;
  return String(raw).trim();
}

export const bulkImportUsers = asyncHandler(async (req, res, next) => {
  if (!req.file) return next(new AppError('No file uploaded. Attach an .xlsx, .xls, or .csv file.', 400));

  let rows;
  try {
    rows = await parseImportBuffer(req.file.buffer, req.file.originalname);
  } catch (err) {
    return next(new AppError(err.message || 'Unable to parse file.', 400));
  }

  if (rows.length > 500) {
    return next(new AppError('Import limited to 500 users per file.', 400));
  }

  const imported = [];
  const failed = [];
  let processed = 0;

  // Pre-load existing users once to detect duplicates efficiently.
  const existing = await prisma.user.findMany({ select: { id: true, employeeId: true, username: true, email: true } });
  const seen = { employeeId: {}, username: {}, email: {} };
  existing.forEach((u) => {
    if (u.employeeId) seen.employeeId[u.employeeId.toLowerCase()] = u.id;
    if (u.username)   seen.username[u.username.toLowerCase()]   = u.id;
    if (u.email)      seen.email[u.email.toLowerCase()]         = u.id;
  });

  // Resolve supervisors (username / employeeId / email) once.
  const supervisorRefs = [...new Set(rows.map((r) => parseSupervisorRef(r.supervisor)).filter(Boolean))];
  const supervisorIdByRef = {};
  for (const ref of supervisorRefs) {
    const lower = ref.toLowerCase();
    const match = await prisma.user.findFirst({
      where: {
        OR: [
          { username: { equals: lower, mode: 'insensitive' } },
          { employeeId: { equals: ref, mode: 'insensitive' } },
          { email: { equals: lower, mode: 'insensitive' } },
        ],
      },
      select: { id: true },
    });
    if (match) supervisorIdByRef[lower] = match.id;
  }

  const uniqueKeyPresent = (key, value) => value && (seen[key][value.toLowerCase()] !== undefined);

  for (let i = 0; i < rows.length; i++) {
    const raw = rows[i];
    const line = i + 2; // +1 header row, +1 for 0-index -> human 1-based data row
    processed++;

    const name       = toCell(raw.name);
    const employeeId = toCell(raw.employeeId);
    const username   = toCell(raw.username);
    const email      = toCell(raw.email);
    const roleRaw    = toCell(raw.role);
    const genderRaw  = toCell(raw.gender);
    const position   = toCell(raw.position);
    const department = toCell(raw.department);
    const supervisorRef = parseSupervisorRef(raw.supervisor);
    const statusRaw  = toCell(raw.status).toUpperCase() || 'ACTIVE';

    const row = { __line: line };

    // Basic validations (employeeId is optional; status/supervisor also optional)
    if (!name) { failed.push(buildRowError(row, 'Missing required field: name')); continue; }
    if (!username) { failed.push(buildRowError(row, 'Missing required field: username')); continue; }
    if (!email) { failed.push(buildRowError(row, 'Missing required field: email')); continue; }
    if (!EMAIL_RE.test(email)) { failed.push(buildRowError(row, `Invalid email format: ${email}`)); continue; }

    const roles = parseRoles(roleRaw);
    if (roles.some((r) => !ROLE_SET.has(r))) {
      failed.push(buildRowError(row, `Invalid role(s): ${roleRaw}. Allowed: ${[...ROLE_SET].join(', ')}`));
      continue;
    }

    if (genderRaw && !GENDER_SET.has(genderRaw)) {
      failed.push(buildRowError(row, `Invalid gender: ${genderRaw}. Allowed: Male, Female`));
      continue;
    }

    if (statusRaw && !STATUS_SET.has(statusRaw)) {
      failed.push(buildRowError(row, `Invalid status: ${statusRaw}. Allowed: ACTIVE, INACTIVE`));
      continue;
    }

    // Duplicate detection (DB + within-file) — employeeId only when provided
    if (employeeId && (uniqueKeyPresent('employeeId', employeeId) || seen.employeeId[employeeId.toLowerCase()] !== undefined)) {
      failed.push(buildRowError(row, `Duplicate employeeId: ${employeeId}`)); continue;
    }
    if (uniqueKeyPresent('username', username) || seen.username[username.toLowerCase()] !== undefined) {
      failed.push(buildRowError(row, `Duplicate username: ${username}`)); continue;
    }
    if (uniqueKeyPresent('email', email) || seen.email[email.toLowerCase()] !== undefined) {
      failed.push(buildRowError(row, `Duplicate email: ${email}`)); continue;
    }

    // Optional supervisor lookup
    let supervisorId = null;
    if (supervisorRef) {
      const sid = supervisorIdByRef[supervisorRef.toLowerCase()];
      if (!sid) { failed.push(buildRowError(row, `Supervisor not found: ${supervisorRef}`)); continue; }
      supervisorId = sid;
    }

    // Mark within-file duplicates so the same file can't create dupes
    if (employeeId) seen.employeeId[employeeId.toLowerCase()] = 'pending';
    seen.username[username.toLowerCase()]     = 'pending';
    seen.email[email.toLowerCase()]           = 'pending';

    const tempPassword = DEFAULT_USER_PASSWORD;
    const passwordHash = await hashPassword(tempPassword);

    try {
      const created = await prisma.user.create({
        data: {
          employeeId: employeeId || null,
          name,
          username,
          email,
          passwordHash,
          roles,
          gender: genderRaw || null,
          position: position || null,
          department: department || null,
          supervisorId,
          status: statusRaw || 'ACTIVE',
        },
      });
      imported.push({
        _id: created.id,
        employeeId: employeeId || null,
        name,
        username,
        email,
        roles,
        tempPassword,
      });
      notifyAccountCreated(created.id).catch(() => {});
    } catch (err) {
      failed.push(buildRowError(row, `DB error: ${err.message}`));
    }
  }

  logger.info({ event: 'users_bulk_import', by: req.user.id, processed, imported: imported.length, failed: failed.length });

  await logActivity({
    req,
    action: 'bulk_import',
    entity: 'User',
    description: `Bulk imported ${imported.length} user(s)${failed.length ? ` (${failed.length} failed)` : ''}`,
    metadata: { total: rows.length, processed, imported: imported.length, failed: failed.length },
  });

  res.status(200).json({
    status: 'success',
    data: {
      summary: { total: rows.length, processed, imported: imported.length, failed: failed.length },
      imported,
      failed,
    },
  });
});

// ─── DOWNLOAD IMPORT TEMPLATE (Excel) ────────────────────────────────────────
export const downloadImportTemplate = asyncHandler(async (req, res) => {
  const headers = [
    'employeeId', 'name', 'username', 'email', 'role', 'gender', 'position', 'department',
  ];
  const sample = [
    'EMP001', 'Abebe Kebede', 'abebe.kebede2', 'abebe@zemenbank.com', 'EMPLOYEE', 'Male', 'Senior Officer', 'Retail Banking',
  ];

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Users');
  ws.addRow(headers);
  ws.addRow(sample);
  ws.getRow(1).font = { bold: true };
  headers.forEach((h, i) => {
    const col = ws.getColumn(i + 1);
    col.width = Math.max(h.length + 4, 18);
  });

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="user-import-template.xlsx"');
  await wb.xlsx.write(res);
  res.end();
});

