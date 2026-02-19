import Assessment from '../models/Assessment.js';
import User from '../models/User.js';
import AppError from '../utils/AppError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { sendAssessmentNotification, sendSupervisorReminder } from '../services/emailService.js';

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

// ─── CREATE ──────────────────────────────────────────────────────────────────
export const createAssessment = asyncHandler(async (req, res, next) => {
  const {
    competencyId, description, target, questionIds,
    startDate, endDate, timeLimit, type, weight,
  } = req.body;

  const assessment = await Assessment.create({
    competencyId,
    description,
    target,
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
      { 'target.department': me.department },
      { 'target.position': me.position },
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
    .populate('competencyId', 'name category')
    .populate('createdBy', 'name email')
    .populate('questionIds', ' -correctAnswer')
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

  const allowedFields = [
    'description', 'target', 'questionIds', 'startDate',
    'endDate', 'timeLimit', 'type', 'weight',
  ];
  allowedFields.forEach((f) => {
    if (req.body[f] !== undefined) assessment[f] = req.body[f];
  });

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
    const userFilter = { status: 'ACTIVE' };
    if (assessment.target?.department) userFilter.department = assessment.target.department;
    if (assessment.target?.position) userFilter.position = assessment.target.position;

    const employees = await User.find(userFilter).lean();

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
    const userFilter = { status: 'ACTIVE' };
    if (assessment.target?.department) userFilter.department = assessment.target.department;
    if (assessment.target?.position) userFilter.position = assessment.target.position;

    const employees = await User.find(userFilter).lean();

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
export const getActiveAssessments = asyncHandler(async (req, res) => {
  await autoActivateScheduledAssessments();
  await autoCompleteExpiredAssessments();

  const me = await User.findById(req.user.id).lean();

  const filter = {
    status: { $in: ['SCHEDULED', 'ACTIVE'] },
    $or: [
      { 'target.department': me.department },
      { 'target.position': me.position },
      { 'target.department': null, 'target.position': null },
    ],
  };

  const assessments = await Assessment.find(filter)
    .populate('competencyId', 'name category')
    .populate('questionIds', ' -correctAnswer')
    .sort({ startDate: 1 })
    .lean();

  res.status(200).json({ status: 'success', data: { assessments } });
});

// ─── DELETE ───────────────────────────────────────────────────────────────────
export const deleteAssessments = asyncHandler(async (req, res, next) => {
  const assessment = await Assessment.findByIdAndDelete(req.params.id);
  if (!assessment) return next(new AppError('Assessment not found.', 404));

  res.status(200).json({ status: 'success', message: 'Assessment deleted.' });
});
