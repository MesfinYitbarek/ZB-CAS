/* controllers/assessmentController.js
 * Assessment lifecycle management.
 *
 * POST   /assessments            – create (HR_ADMIN)
 * GET    /assessments            – list (HR_ADMIN sees all; others see relevant)
 * GET    /assessments/:id        – single
 * PUT    /assessments/:id        – update (HR_ADMIN, DRAFT only)
 * PATCH  /assessments/:id/status – transition status (HR_ADMIN)
 * GET    /assessments/active     – currently active assessments for the caller
 *
 * Status flow: DRAFT → SCHEDULED (sends notifications) → ACTIVE → COMPLETED
 *
 * When status moves to SCHEDULED, all target employees (and supervisors for
 * Combined/SupervisorOnly) are notified via email.
 */
const Assessment     = require('../models/Assessment');
const User           = require('../models/User');
const AppError       = require('../utils/AppError');
const asyncHandler   = require('../utils/asyncHandler');
const { sendAssessmentNotification, sendSupervisorReminder } = require('../services/emailService');

// ─── CREATE ──────────────────────────────────────────────────────────────────
exports.createAssessment = asyncHandler(async (req, res, next) => {
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
    status:    'DRAFT',
    createdBy: req.user.id,
  });

  res.status(201).json({ status: 'success', data: { assessment } });
});

// ─── LIST ─────────────────────────────────────────────────────────────────────
exports.getAssessments = asyncHandler(async (req, res) => {
  const { status, competencyId, page = 1, limit = 6 } = req.query;

  const filter = {};
  if (status)       filter.status       = status;
  if (competencyId) filter.competencyId = competencyId;

  // Non-admin users only see assessments that target their dept/position
  if (req.user.role !== 'HR_ADMIN') {
    const me = await User.findById(req.user.id).lean();
    filter.$or = [
      { 'target.department': me.department },
      { 'target.position':   me.position },
      { 'target.department': null, 'target.position': null }, // global assessments
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
exports.getAssessment = asyncHandler(async (req, res, next) => {
  const assessment = await Assessment.findById(req.params.id)
    .populate('competencyId', 'name category')
    .populate('createdBy', 'name email')
    .populate('questionIds', ' -correctAnswer')   // never leak answers
    .lean();

  if (!assessment) return next(new AppError('Assessment not found.', 404));

  res.status(200).json({ status: 'success', data: { assessment } });
});

// ─── UPDATE (DRAFT only) ─────────────────────────────────────────────────────
exports.updateAssessment = asyncHandler(async (req, res, next) => {
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
exports.updateStatus = asyncHandler(async (req, res, next) => {
  const { status } = req.body;
  const assessment = await Assessment.findById(req.params.id);

  if (!assessment) return next(new AppError('Assessment not found.', 404));

  // Valid transitions
  const transitions = {
    DRAFT:      ['SCHEDULED'],
    SCHEDULED:  ['ACTIVE'],
    ACTIVE:     ['COMPLETED'],
    COMPLETED:  ['ARCHIVED'],
  };

  const allowed = transitions[assessment.status] || [];
  if (!allowed.includes(status)) {
    return next(new AppError(`Cannot transition from ${assessment.status} to ${status}.`, 400));
  }

  assessment.status = status;
  await assessment.save({ validateBeforeSave: false });

  // ── Notify participants when moving to SCHEDULED ────────────────────────
  if (status === 'SCHEDULED') {
    // Find target employees
    const userFilter = { status: 'ACTIVE' };
    if (assessment.target?.department) userFilter.department = assessment.target.department;
    if (assessment.target?.position)   userFilter.position   = assessment.target.position;

    const employees = await User.find(userFilter).lean();

    // Send notifications (fire-and-forget; won't block the response)
    employees.forEach((emp) => sendAssessmentNotification(emp, assessment));

    // For Combined / SupervisorOnly, also notify supervisors
    if (assessment.type === 'Combined' || assessment.type === 'SupervisorOnly') {
      const supervisorIds = [...new Set(employees.map((e) => e.supervisorId).filter(Boolean))];
      const supervisors   = await User.find({ _id: { $in: supervisorIds } }).lean();
      supervisors.forEach((sup) => {
        const supEmployees = employees.filter((e) => e.supervisorId?.toString() === sup._id.toString());
        supEmployees.forEach((emp) => sendSupervisorReminder(sup, emp.name, assessment));
      });
    }
  }

  res.status(200).json({ status: 'success', data: { assessment } });
});

// ─── GET ACTIVE ASSESSMENTS FOR CURRENT USER ────────────────────────────────
exports.getActiveAssessments = asyncHandler(async (req, res) => {
  const me = await User.findById(req.user.id).lean();

  const filter = {
    status: 'ACTIVE',
    $or: [
      { 'target.department': me.department },
      { 'target.position':   me.position },
      { 'target.department': null, 'target.position': null },
    ],
  };

  const assessments = await Assessment.find(filter)
    .populate('competencyId', 'name category')
    .populate('questionIds', ' -correctAnswer')
    .sort({ endDate: 1 })
    .lean();

  res.status(200).json({ status: 'success', data: { assessments } });
});

// ─── DELETE ───────────────────────────────────────────────────────────────────
exports.deleteAssessments = asyncHandler(async (req, res, next) => {
  const assessment = await Assessment.findByIdAndDelete(req.params.id);
  if (!assessment) return next(new AppError('Assessment not found.', 404));

  res.status(200).json({ status: 'success', message: 'Assessment deleted.' });
});