import Assessment from '../models/Assessment.js';
import User from '../models/User.js';
import AppError from '../utils/AppError.js';
import asyncHandler from '../utils/asyncHandler.js';
import {
  sendAssessmentNotification,
  sendSupervisorReminder,
  sendAssessmentReminderEmail,
} from '../services/emailService.js';
import mongoose from 'mongoose';
// ─── AUTO-ACTIVATE HELPER ────────────────────────────────────────────────────
const autoActivateScheduledAssessments = async () => {
  const now = new Date();
  const result = await Assessment.updateMany(
    { status: 'SCHEDULED', startDate: { $lte: now } },
    { $set: { status: 'ACTIVE' } }
  );
  return result.modifiedCount || 0;
};

// ─── AUTO-COMPLETE HELPER ────────────────────────────────────────────────────
const autoCompleteExpiredAssessments = async () => {
  const now = new Date();
  const result = await Assessment.updateMany(
    { status: 'ACTIVE', endDate: { $lte: now } },
    { $set: { status: 'COMPLETED' } }
  );
  return result.modifiedCount || 0;
};

// ─── RESOLVE EMPLOYEES HELPER ────────────────────────────────────────────────
// Resolves the list of active employees based on targetAudience,
// falling back to legacy target.department / target.position.
const resolveEmployees = async (assessment) => {
  const base = { status: 'ACTIVE' };
  const ta = assessment.targetAudience || {};
  const taType = ta.type;

  if (taType === 'ALL_DEPARTMENTS') {
    return User.find(base).lean();
  }

  if (taType === 'DEPARTMENT_ALL' && ta.departments?.length) {
    return User.find({ ...base, department: { $in: ta.departments } }).lean();
  }

  if (taType === 'SPECIFIC_EMPLOYEES' && ta.employeeIds?.length) {
    return User.find({ ...base, _id: { $in: ta.employeeIds } }).lean();
  }

  // Fallback: legacy target
  const filter = { ...base };
  if (assessment.target?.department) filter.department = assessment.target.department;
  if (assessment.target?.position) filter.position = assessment.target.position;
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

// ─── DERIVE LEGACY TARGET FROM targetAudience ────────────────────────────────
const deriveLegacyTarget = (targetAudience) => {
  if (!targetAudience) return { department: null, position: null };
  if (targetAudience.type === 'DEPARTMENT_ALL' && targetAudience.departments?.length) {
    return { department: targetAudience.departments[0], position: null };
  }
  return { department: null, position: null };
};

// ─── CREATE ──────────────────────────────────────────────────────────────────
export const createAssessment = asyncHandler(async (req, res, next) => {
  const {
    competencyId, targetGroup, purpose, description,
    targetAudience, reminderDaysBefore,
    questionIds, startDate, endDate, timeLimit, type, weight,
  } = req.body;

  if (!targetGroup) return next(new AppError('Target group is required.', 400));
  if (!purpose) return next(new AppError('Purpose is required.', 400));
  if (!validateTargetAudience(targetAudience, next)) return;

  const legacyTarget = deriveLegacyTarget(targetAudience);

  const assessment = await Assessment.create({
    competencyId,
    targetGroup,
    purpose,
    description,
    targetAudience: targetAudience || { type: 'ALL_DEPARTMENTS', departments: [], employeeIds: [] },
    reminderDaysBefore: reminderDaysBefore ? Number(reminderDaysBefore) : null,
    target: legacyTarget,
    questionIds,
    startDate,
    endDate,
    timeLimit: timeLimit || null,
    type,
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
  if (status) filter.status = status;
  if (competencyId) filter.competencyId = competencyId;

  if (req.user.role !== 'HR_ADMIN') {
    const me = await User.findById(req.user.id).lean();
    filter.$or = [
      // New targetAudience-based matching
      { 'targetAudience.type': 'ALL_DEPARTMENTS' },
      { 'targetAudience.type': 'DEPARTMENT_ALL', 'targetAudience.departments': me.department },
      { 'targetAudience.type': 'SPECIFIC_EMPLOYEES', 'targetAudience.employeeIds': me._id },
      // Legacy fallback
      { 'target.department': me.department },
      { 'target.department': null, 'target.position': null },
    ];
  }

  const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);

  const [assessments, total] = await Promise.all([
    Assessment.find(filter)
      .populate('competencyId', 'name category')
      .populate('createdBy', 'name email')
      .skip(skip)
      .limit(parseInt(limit, 10))
      .sort({ startDate: -1 })
      .lean(),
    Assessment.countDocuments(filter),
  ]);

  res.status(200).json({
    status: 'success',
    data: {
      assessments,
      pagination: { total, page: parseInt(page, 10), limit: parseInt(limit, 10) },
    },
  });
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
    .populate('questionIds', ' -correctAnswer')
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

  // Validate new fields if provided
  if (req.body.targetAudience && !validateTargetAudience(req.body.targetAudience, next)) return;

  const allowedFields = [
    'description', 'target', 'questionIds', 'startDate',
    'endDate', 'timeLimit', 'type', 'weight',
    // New fields
    'targetGroup', 'purpose', 'targetAudience', 'reminderDaysBefore',
  ];

  allowedFields.forEach((f) => {
    if (req.body[f] !== undefined) assessment[f] = req.body[f];
  });

  // Keep legacy target in sync with targetAudience
  if (req.body.targetAudience) {
    assessment.target = deriveLegacyTarget(req.body.targetAudience);
  }

  if (req.body.reminderDaysBefore !== undefined) {
    assessment.reminderDaysBefore = req.body.reminderDaysBefore ? Number(req.body.reminderDaysBefore) : null;
    // Reset reminderSent if reminder config changed
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

  const transitions = {
    DRAFT: ['SCHEDULED'],
    ACTIVE: ['COMPLETED'],
    COMPLETED: ['ARCHIVED'],
  };

  const allowed = transitions[assessment.status] || [];
  if (!allowed.includes(status)) {
    return next(new AppError(`Cannot transition from ${assessment.status} to ${status}.`, 400));
  }

  assessment.status = status;

  if (status === 'SCHEDULED' && (assessment.type === 'Combined' || assessment.type === 'SupervisorOnly')) {
    const employees = await resolveEmployees(assessment);

    assessment.supervisorEvaluations = employees
      .filter(emp => emp.supervisorId)
      .map(emp => ({
        employeeId: emp._id,
        supervisorId: emp.supervisorId,
        status: 'PENDING'
      }));
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

// ─── GET SCHEDULED + ACTIVE ASSESSMENTS FOR CURRENT USER ────────────────────
// controllers/assessment.controller.js

export const getActiveAssessments = asyncHandler(async (req, res) => {
  // Auto status updates
  await autoActivateScheduledAssessments();
  await autoCompleteExpiredAssessments();

  // Get logged-in user
  const me = await User.findById(req.user.id).lean();

  if (!me) {
    return res.status(404).json({
      status: 'fail',
      message: 'User not found',
    });
  }

  // ✅ IMPORTANT: normalize ObjectId
  const userId =
    typeof me._id === 'string'
      ? new mongoose.Types.ObjectId(me._id)
      : me._id;

  console.log('Current user:', {
    id: userId.toString(),
    department: me.department,
    position: me.position,
  });

  /**
   * Audience matching rules:
   * 1. ALL_DEPARTMENTS → everyone
   * 2. DEPARTMENT_ALL → matching department
   * 3. SPECIFIC_EMPLOYEES → listed employee only
   */

  const filter = {
    status: { $in: ['SCHEDULED', 'ACTIVE'] },

    $or: [
      // Everyone
      {
        'targetAudience.type': 'ALL_DEPARTMENTS',
      },

      // Department audience
      {
        'targetAudience.type': 'DEPARTMENT_ALL',
        'targetAudience.departments': me.department,
      },

      // Specific employees
      {
        'targetAudience.type': 'SPECIFIC_EMPLOYEES',
        'targetAudience.employeeIds': userId,
      },
    ],
  };

  console.log('Query filter:', JSON.stringify(filter, null, 2));

  // Fetch assessments
  const assessments = await Assessment.find(filter)
    .populate('competencyId', 'name category')
    .populate('questionIds', '-correctAnswer')
    .sort({ startDate: 1 })
    .lean();

  console.log(
    `Found ${assessments.length} assessments for user ${userId}`
  );

  // Debug matching
  assessments.forEach((a) => {
    console.log(`Assessment ${a._id}:`, {
      audienceType: a.targetAudience?.type,
      employees: a.targetAudience?.employeeIds?.map((id) =>
        id.toString()
      ),
      matchesSpecific:
        a.targetAudience?.type === 'SPECIFIC_EMPLOYEES'
          ? a.targetAudience.employeeIds?.some(
              (id) => id.toString() === userId.toString()
            )
          : 'N/A',
    });
  });

  res.status(200).json({
    status: 'success',
    results: assessments.length,
    data: { assessments },
  });
});

// ─── DELETE ───────────────────────────────────────────────────────────────────
export const deleteAssessments = asyncHandler(async (req, res, next) => {
  const assessment = await Assessment.findByIdAndDelete(req.params.id);
  if (!assessment) return next(new AppError('Assessment not found.', 404));

  res.status(200).json({ status: 'success', message: 'Assessment deleted.' });
});

// ─── SEARCH EMPLOYEES (for target audience picker) ───────────────────────────
export const searchEmployees = asyncHandler(async (req, res) => {
  const { name, department, position } = req.query;
  const filter = { status: 'ACTIVE' };
  if (name) filter.name = { $regex: name, $options: 'i' };
  if (department) filter.department = department;
  if (position) filter.position = { $regex: position, $options: 'i' };

  const employees = await User.find(filter)
    .select('name email department position employeeId')
    .limit(50)
    .lean();

  res.status(200).json({ status: 'success', data: { employees } });
});

// ─── GET ALL DEPARTMENTS ──────────────────────────────────────────────────────
export const getDepartments = asyncHandler(async (req, res) => {
  const departments = await User.distinct('department', {
    status: 'ACTIVE',
    department: { $ne: null, $ne: '' },
  });
  res.status(200).json({ status: 'success', data: { departments: departments.filter(Boolean).sort() } });
});

// ─── SEND REMINDER EMAILS ─────────────────────────────────────────────────────
export const sendReminderEmails = asyncHandler(async (req, res) => {
  const now = new Date();

  const assessments = await Assessment.find({
    status: 'ACTIVE',
    reminderDaysBefore: { $ne: null },
    reminderSent: false,
  }).lean();

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

  res.status(200).json({
    status: 'success',
    message: `Reminders processed for ${processedCount} assessment(s).`,
  });
});
