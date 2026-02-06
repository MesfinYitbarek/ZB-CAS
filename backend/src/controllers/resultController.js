/* controllers/resultController.js
 * Result & scoring endpoints.
 *
 * POST   /results/score/:assessmentId   – trigger scoring (HR_ADMIN)
 * GET    /results                       – list results (filterable)
 * GET    /results/user/:userId         – all results for a user
 * GET    /results/:id                   – single result
 * PATCH  /results/:id/finalise          – finalise a PENDING result (HR_ADMIN)
 * GET    /results/pdp/:userId          – generate PDP summary for a user
 */
const mongoose = require('mongoose');
const Result       = require('../models/Result');
const User         = require('../models/User');
const AppError     = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');
const { scoreAssessment, finaliseResult } = require('../services/scoringService');
const { sendResultsEmail } = require('../services/emailService');

// ─── TRIGGER SCORING ─────────────────────────────────────────────────────────
exports.scoreAssessment = asyncHandler(async (req, res, next) => {
  const { assessmentId } = req.params;

  const results = await scoreAssessment(assessmentId);

  // Notify each employee whose results are FINAL
  results
    .filter((r) => r.resultStatus === 'FINAL')
    .forEach(async (r) => {
      try {
        await sendResultsEmail(
          { name: r.employeeName, email: r.employeeEmail },
          [{ competencyName: r.competencyName, finalScore: r.finalScore, level: r.level }]
        );
      } catch (e) {
        console.error('[ResultCtrl] Email send failed:', e.message);
      }
    });

  res.status(200).json({ status: 'success', data: { results } });
});

// ─── LIST RESULTS ─────────────────────────────────────────────────────────────
exports.getResults = asyncHandler(async (req, res) => {
  const { userId, competencyId, assessmentId, status, page = 1, limit = 20 } = req.query;

  const filter = {};
  if (userId)       filter.userId       = userId;
  if (competencyId)  filter.competencyId  = competencyId;
  if (assessmentId)  filter.assessmentId  = assessmentId;
  if (status)        filter.status        = status;

  // Employees can only see their own results
  if (req.user.role === 'EMPLOYEE') {
    filter.userId = req.user.id;
  }
  // Supervisors can see results of their direct reports
  if (req.user.role === 'SUPERVISOR') {
    const subordinates = await User.find({ supervisorId: req.user.id }).select('_id').lean();
    filter.userId = { $in: subordinates.map((s) => s._id) };
  }

  const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);

  const [results, total] = await Promise.all([
    Result.find(filter)
      .populate('userId',       'name email department position')
      .populate('competencyId',  'name category')
      .populate('assessmentId',  'description type startDate endDate')
      .skip(skip)
      .limit(parseInt(limit, 10))
      .sort({ createdAt: -1 })
      .lean(),
    Result.countDocuments(filter),
  ]);

  res.status(200).json({
    status: 'success',
    data: {
      results,
      pagination: { total, page: parseInt(page, 10), limit: parseInt(limit, 10) },
    },
  });
});

// ─── RESULTS FOR A SPECIFIC USER ─────────────────────────────────────────────
exports.getUserResults = asyncHandler(async (req, res, next) => {
  const { userId } = req.params;

  // Access control
  if (req.user.role === 'EMPLOYEE' && req.user.id !== userId) {
    return next(new AppError('Access denied.', 403));
  }
  if (req.user.role === 'SUPERVISOR') {
    const emp = await User.findById(userId).lean();
    if (!emp || emp.supervisorId?.toString() !== req.user.id) {
      return next(new AppError('Access denied.', 403));
    }
  }

  const results = await Result.find({ userId })
    .populate('competencyId',  'name category')
    .populate('assessmentId',  'description type startDate endDate')
    .sort({ createdAt: -1 })
    .lean();

  res.status(200).json({ status: 'success', data: { results } });
});

// ─── SINGLE RESULT ───────────────────────────────────────────────────────────
exports.getResult = asyncHandler(async (req, res, next) => {
  const result = await Result.findById(req.params.id)
    .populate('userId',       'name email department position')
    .populate('competencyId',  'name category')
    .populate('assessmentId',  'description type startDate endDate')
    .lean();

  if (!result) return next(new AppError('Result not found.', 404));

  res.status(200).json({ status: 'success', data: { result } });
});

// ─── FINALISE A PENDING RESULT ───────────────────────────────────────────────
exports.finaliseResult = asyncHandler(async (req, res, next) => {
  const result = await finaliseResult(req.params.id);

  res.status(200).json({ status: 'success', data: { result } });
});

// ─── PERSONAL DEVELOPMENT PLAN (PDP) ─────────────────────────────────────────
// Returns the latest result per competency for the user, forming the PDP.
exports.getPDP = asyncHandler(async (req, res, next) => {
  const { userId } = req.params;

  // Access control (same as getUserResults)
  if (req.user.role === 'EMPLOYEE' && req.user.id !== userId) {
    return next(new AppError('Access denied.', 403));
  }
  if (req.user.role === 'SUPERVISOR') {
    const emp = await User.findById(userId).lean();
    if (!emp || emp.supervisorId?.toString() !== req.user.id) {
      return next(new AppError('Access denied.', 403));
    }
  }

  // Get the most recent FINAL result per competency
  const pdp = await Result.aggregate([
    { $match:   { userId: new mongoose.Types.ObjectId(userId), status: 'FINAL' } },
    { $sort:    { createdAt: -1 } },
    { $group:   { _id: '$competencyId', latestResult: { $first: '$$ROOT' } } },
    { $replaceRoot: { newRoot: '$latestResult' } },
  ]);

  // Populate
  const populated = await Result.populate(pdp, [
    { path: 'competencyId', select: 'name category' },
    { path: 'assessmentId', select: 'description' },
  ]);

  res.status(200).json({ status: 'success', data: { pdp: populated } });
});
