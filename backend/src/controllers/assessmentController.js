/* controllers/assessmentController.js
 * SECURITY FIXES:
 *  A03 – escapeRegex applied to all regex search fields
 *  A09 – All console.log replaced with structured logger
 */
import Assessment from '../models/Assessment.js';
import User from '../models/User.js';
import AppError from '../utils/AppError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { escapeRegex } from '../middleware/security.js';
import logger from '../utils/logger.js';
import {
  sendAssessmentNotification,
  sendSupervisorReminder,
  sendAssessmentReminderEmail,
} from '../services/emailService.js';
import mongoose from 'mongoose';

// ─── AUTO-ACTIVATE HELPER ────────────────────────────────────────────────────
// Exported so schedulerService can call it on a cron schedule
export const autoActivateScheduledAssessments = async () => {
  const now = new Date();
  const result = await Assessment.updateMany(
    { status: 'SCHEDULED', startDate: { $lte: now } },
    { $set: { status: 'ACTIVE' } }
  );
  return result.modifiedCount || 0;
};

// ─── AUTO-COMPLETE HELPER ────────────────────────────────────────────────────
// Exported so schedulerService can call it on a cron schedule
export const autoCompleteExpiredAssessments = async () => {
  const now = new Date();
  const result = await Assessment.updateMany(
    { status: 'ACTIVE', endDate: { $lte: now } },
    { $set: { status: 'COMPLETED' } }
  );
  return result.modifiedCount || 0;
};

// ─── RESOLVE EMPLOYEES HELPER ────────────────────────────────────────────────
const resolveEmployees = async (assessment) => {
  const base = { status: 'ACTIVE' };
  const ta = assessment.targetAudience || {};
  const taType = ta.type;

  if (taType === 'ALL_DEPARTMENTS') return User.find(base).lean();
  if (taType === 'DEPARTMENT_ALL' && ta.departments?.length)
    return User.find({ ...base, department: { $in: ta.departments } }).lean();
  if (taType === 'SPECIFIC_EMPLOYEES' && ta.employeeIds?.length)
    return User.find({ ...base, _id: { $in: ta.employeeIds } }).lean();

  const filter = { ...base };
  if (assessment.target?.department) filter.department = assessment.target.department;
  if (assessment.target?.position)   filter.position   = assessment.target.position;
  return User.find(filter).lean();
};

// ─── VALIDATE TARGET AUDIENCE ────────────────────────────────────────────────
const validateTargetAudience = (targetAudience, next) => {
  if (!targetAudience || !targetAudience.type) return true;
  if (targetAudience.type === 'DEPARTMENT_ALL' && (!targetAudience.departments || targetAudience.departments.length === 0)) {
    next(new AppError('Please select at least one department for DEPARTMENT_ALL target audience.', 400));
    return false;
  }
  if (targetAudience.type === 'SPECIFIC_EMPLOYEES' && (!targetAudience.employeeIds || targetAudience.employeeIds.length === 0)) {
    next(new AppError('Please select at least one employee for SPECIFIC_EMPLOYEES target audience.', 400));
    return false;
  }
  return true;
};

const deriveLegacyTarget = (targetAudience) => {
  if (!targetAudience) return { department: null, position: null };
  if (targetAudience.type === 'DEPARTMENT_ALL' && targetAudience.departments?.length)
    return { department: targetAudience.departments[0], position: null };
  return { department: null, position: null };
};

// ─── CREATE ──────────────────────────────────────────────────────────────────
export const createAssessment = asyncHandler(async (req, res, next) => {
  const { competencyId, targetGroup, purpose, description, targetAudience, reminderDaysBefore, questionIds, startDate, endDate, timeLimit, type, weight } = req.body;

  if (!targetGroup) return next(new AppError('Target group is required.', 400));
  if (!purpose)     return next(new AppError('Purpose is required.', 400));
  if (!validateTargetAudience(targetAudience, next)) return;

  const legacyTarget = deriveLegacyTarget(targetAudience);

  const assessment = await Assessment.create({
    competencyId, targetGroup, purpose, description,
    targetAudience: targetAudience || { type: 'ALL_DEPARTMENTS', departments: [], employeeIds: [] },
    reminderDaysBefore: reminderDaysBefore ? Number(reminderDaysBefore) : null,
    target: legacyTarget, questionIds, startDate, endDate,
    timeLimit: timeLimit || null, type,
    weight: type === 'Combined'
      ? { selfAssessment: weight?.selfAssessment || 20, supervisor: weight?.supervisor || 80 }
      : { selfAssessment: 0, supervisor: 0 },
    status: 'DRAFT',
    createdBy: req.user.id,
  });

  res.status(201).json({ status: 'success', data: { assessment } });
});

// ─── LIST ─────────────────────────────────────────────────────────────────────
export const getAssessments = asyncHandler(async (req, res) => {
  await autoActivateScheduledAssessments();
  await autoCompleteExpiredAssessments();

  const { status, competencyId, page = 1, limit = 6 } = req.query;

  const filter = {};
  if (status)       filter.status       = status;
  if (competencyId) filter.competencyId = competencyId;

  if (req.user.role !== 'HR_ADMIN') {
    const me = await User.findById(req.user.id).lean();
    filter.$or = [
      { 'targetAudience.type': 'ALL_DEPARTMENTS' },
      { 'targetAudience.type': 'DEPARTMENT_ALL', 'targetAudience.departments': me.department },
      { 'targetAudience.type': 'SPECIFIC_EMPLOYEES', 'targetAudience.employeeIds': me._id },
      { 'target.department': me.department },
      { 'target.department': null, 'target.position': null },
    ];
  }

  const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);

  const [assessments, total] = await Promise.all([
    Assessment.find(filter)
      .populate('competencyId', 'name category')
      .populate('createdBy', 'name email')
      .skip(skip).limit(parseInt(limit, 10))
      .sort({ startDate: -1 }).lean(),
    Assessment.countDocuments(filter),
  ]);

  res.status(200).json({ status: 'success', data: { assessments, pagination: { total, page: parseInt(page, 10), limit: parseInt(limit, 10) } } });
});

// ─── GET ONE ─────────────────────────────────────────────────────────────────
export const getAssessment = asyncHandler(async (req, res, next) => {
  await autoActivateScheduledAssessments();
  await autoCompleteExpiredAssessments();

  const raw = await Assessment.findById(req.params.id);
  if (!raw) return next(new AppError('Assessment not found.', 404));

  if (raw.status === 'SCHEDULED' && new Date(raw.startDate) <= new Date()) {
    raw.status = 'ACTIVE';
    await raw.save({ validateBeforeSave: false });
  }

  const assessment = await Assessment.findById(req.params.id)
    .populate('competencyId', 'name category targetGroups')
    .populate('createdBy', 'name email')
    .populate('questionIds', '-correctAnswer')
    .populate('targetAudience.employeeIds', 'name email department position')
    .lean();

  res.status(200).json({ status: 'success', data: { assessment } });
});

// ─── UPDATE (DRAFT only) ─────────────────────────────────────────────────────
export const updateAssessment = asyncHandler(async (req, res, next) => {
  const assessment = await Assessment.findById(req.params.id);
  if (!assessment) return next(new AppError('Assessment not found.', 404));

  if (assessment.status !== 'DRAFT') {
    return next(new AppError('Only DRAFT assessments can be updated.', 400));
  }

  if (req.body.targetAudience && !validateTargetAudience(req.body.targetAudience, next)) return;

  const allowedFields = ['description', 'target', 'questionIds', 'startDate', 'endDate', 'timeLimit', 'type', 'weight', 'targetGroup', 'purpose', 'targetAudience', 'reminderDaysBefore'];
  allowedFields.forEach((f) => { if (req.body[f] !== undefined) assessment[f] = req.body[f]; });

  if (req.body.targetAudience) assessment.target = deriveLegacyTarget(req.body.targetAudience);
  if (req.body.reminderDaysBefore !== undefined) {
    assessment.reminderDaysBefore = req.body.reminderDaysBefore ? Number(req.body.reminderDaysBefore) : null;
    assessment.reminderSent = false;
  }

  await assessment.save();
  res.status(200).json({ status: 'success', data: { assessment } });
});

// ─── TRANSITION STATUS ────────────────────────────────────────────────────────
export const updateStatus = asyncHandler(async (req, res, next) => {
  const { status } = req.body;
  const assessment = await Assessment.findById(req.params.id);
  if (!assessment) return next(new AppError('Assessment not found.', 404));

  const transitions = { DRAFT: ['SCHEDULED'], ACTIVE: ['COMPLETED'], COMPLETED: ['ARCHIVED'] };
  const allowed = transitions[assessment.status] || [];
  if (!allowed.includes(status)) {
    return next(new AppError(`Cannot transition from ${assessment.status} to ${status}.`, 400));
  }

  assessment.status = status;

  if (status === 'SCHEDULED' && (assessment.type === 'Combined' || assessment.type === 'SupervisorOnly')) {
    const employees = await resolveEmployees(assessment);
    assessment.supervisorEvaluations = employees
      .filter(emp => emp.supervisorId)
      .map(emp => ({ employeeId: emp._id, supervisorId: emp.supervisorId, status: 'PENDING' }));
  }

  await assessment.save({ validateBeforeSave: false });

  if (status === 'SCHEDULED') {
    const employees = await resolveEmployees(assessment);
    employees.forEach((emp) => sendAssessmentNotification(emp, assessment));

    if (assessment.type === 'Combined' || assessment.type === 'SupervisorOnly') {
      const supervisorIds = [...new Set(employees.map((e) => e.supervisorId).filter(Boolean))];
      const supervisors = await User.find({ _id: { $in: supervisorIds } }).lean();
      supervisors.forEach((sup) => {
        const supEmployees = employees.filter((e) => e.supervisorId?.toString() === sup._id.toString());
        supEmployees.forEach((emp) => sendSupervisorReminder(sup, emp.name, assessment));
      });
    }
  }

  res.status(200).json({ status: 'success', data: { assessment } });
});

// ─── GET ACTIVE ASSESSMENTS FOR CURRENT USER ─────────────────────────────────
export const getActiveAssessments = asyncHandler(async (req, res) => {
  await autoActivateScheduledAssessments();
  await autoCompleteExpiredAssessments();

  const me = await User.findById(req.user.id).lean();
  if (!me) return res.status(404).json({ status: 'fail', message: 'User not found' });

  const userId = typeof me._id === 'string' ? new mongoose.Types.ObjectId(me._id) : me._id;

  // FIX A09: replaced console.log with logger.debug
  logger.debug({ event: 'active_assessments_query', userId: userId.toString(), department: me.department });

  const filter = {
    status: { $in: ['SCHEDULED', 'ACTIVE'] },
    $or: [
      { 'targetAudience.type': 'ALL_DEPARTMENTS' },
      { 'targetAudience.type': 'DEPARTMENT_ALL', 'targetAudience.departments': me.department },
      { 'targetAudience.type': 'SPECIFIC_EMPLOYEES', 'targetAudience.employeeIds': userId },
    ],
  };

  const assessments = await Assessment.find(filter)
    .populate('competencyId', 'name category')
    .populate('questionIds', '-correctAnswer')
    .sort({ startDate: 1 }).lean();

  logger.debug({ event: 'active_assessments_found', count: assessments.length, userId: userId.toString() });

  res.status(200).json({ status: 'success', results: assessments.length, data: { assessments } });
});

// ─── DELETE ───────────────────────────────────────────────────────────────────
export const deleteAssessments = asyncHandler(async (req, res, next) => {
  const assessment = await Assessment.findByIdAndDelete(req.params.id);
  if (!assessment) return next(new AppError('Assessment not found.', 404));
  res.status(200).json({ status: 'success', message: 'Assessment deleted.' });
});

// ─── SEARCH EMPLOYEES ─────────────────────────────────────────────────────────
// FIX A03: escapeRegex applied to name and position search inputs
export const searchEmployees = asyncHandler(async (req, res) => {
  const { name, department, position } = req.query;
  const filter = { status: 'ACTIVE' };
  if (name)       filter.name     = { $regex: escapeRegex(name), $options: 'i' };
  if (department) filter.department = department;
  if (position)   filter.position = { $regex: escapeRegex(position), $options: 'i' };

  const employees = await User.find(filter)
    .select('name email department position employeeId')
    .limit(50).lean();

  res.status(200).json({ status: 'success', data: { employees } });
});

// ─── GET ALL DEPARTMENTS ──────────────────────────────────────────────────────
export const getDepartments = asyncHandler(async (req, res) => {
  const departments = await User.distinct('department', { status: 'ACTIVE', department: { $ne: null, $ne: '' } });
  res.status(200).json({ status: 'success', data: { departments: departments.filter(Boolean).sort() } });
});

// ─── SEND REMINDER EMAILS ─────────────────────────────────────────────────────
// ─── PROCESS REMINDERS (called by scheduler AND HTTP endpoint) ──────────────
export const processPendingReminders = async () => {
  const now = new Date();
  const assessments = await Assessment.find({ status: 'ACTIVE', reminderDaysBefore: { $ne: null }, reminderSent: false }).lean();
  let processedCount = 0;

  for (const assessment of assessments) {
    const deadline = new Date(assessment.endDate);
    const daysLeft = Math.ceil((deadline - now) / (1000 * 60 * 60 * 24));
    if (daysLeft <= assessment.reminderDaysBefore) {
      const employees = await resolveEmployees(assessment);
      employees.forEach(emp => sendAssessmentReminderEmail(emp, assessment));
      await Assessment.findByIdAndUpdate(assessment._id, { reminderSent: true });
      processedCount++;
    }
  }
  return processedCount;
};

export const sendReminderEmails = asyncHandler(async (req, res) => {
  const processedCount = await processPendingReminders();
  res.status(200).json({ status: 'success', message: `Reminders processed for ${processedCount} assessment(s).` });
});