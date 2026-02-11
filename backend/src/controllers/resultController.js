const mongoose = require('mongoose');
const Result = require('../models/Result');
const User = require('../models/User');
const Assessment = require('../models/Assessment');
const asyncHandler = require('../utils/asyncHandler');
const AppError = require('../utils/AppError');
const scoringService = require('../services/scoringService');
const { sendResultsEmail } = require('../services/emailService');

// Admin manually scores Combined Assessment
exports.scoreAssessment = asyncHandler(async (req, res, next) => {
  const results = await scoringService.scoreFullAssessment(req.params.assessmentId);

  // Async email notifications
  results.forEach(async (r) => {
    const employee = await User.findById(r.userId).lean();
    if (employee?.email) {
      sendResultsEmail({ name: employee.name, email: employee.email }, [{
        competencyName: 'Competency', // Can be populated if needed
        finalScore: r.finalScore,
        level: r.level,
        assessmentType: 'Combined'
      }]).catch(e => console.error('Email Fail:', e.message));
    }
  });

  res.status(200).json({ status: 'success', message: `Processed ${results.length} results.`, data: { results } });
});

// Auto-score (SelfAssessment/SupervisorOnly)
exports.autoScoreEmployee = asyncHandler(async (req, res, next) => {
  const { assessmentId, employeeId } = req.body;
  const assessment = await Assessment.findById(assessmentId).lean();

  if (assessment.type === 'Combined') {
    return next(new AppError('Combined assessments must be scored by Admin.', 400));
  }

  const result = await scoringService.scoreIndividual(assessmentId, employeeId);
  res.status(200).json({ status: 'success', data: { result } });
});

// Paginated and Filtered Reads
exports.getResults = asyncHandler(async (req, res) => {
  const { userId, competencyId, assessmentId, status, page = 1, limit = 20 } = req.query;
  const filter = {};
  if (userId) filter.userId = userId;
  if (competencyId) filter.competencyId = competencyId;
  if (assessmentId) filter.assessmentId = assessmentId;
  if (status) filter.status = status;

  if (req.user.role === 'EMPLOYEE') filter.userId = req.user.id;
  if (req.user.role === 'SUPERVISOR') {
    const subordinates = await User.find({ supervisorId: req.user.id }).select('_id').lean();
    filter.userId = { $in: subordinates.map(s => s._id) };
  }

  const skip = (parseInt(page) - 1) * parseInt(limit);
  const [results, total] = await Promise.all([
    Result.find(filter)
      .populate('userId', 'name email department position')
      .populate('competencyId', 'name category')
      .populate('assessmentId', 'description type')
      .sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit)).lean(),
    Result.countDocuments(filter)
  ]);

  res.status(200).json({ status: 'success', data: { results, pagination: { total, page, limit } } });
});

exports.getResult = asyncHandler(async (req, res, next) => {
  const result = await Result.findById(req.params.id)
    .populate('userId', 'name email department position')
    .populate('competencyId', 'name category')
    .populate('assessmentId', 'description type weight')
    .lean();

  if (!result) return next(new AppError('Result not found.', 404));
  res.status(200).json({ status: 'success', data: { result } });
});

exports.getPDP = asyncHandler(async (req, res) => {
  const pdp = await Result.aggregate([
    {
      $match: {
        userId: new mongoose.Types.ObjectId(req.params.userId),
        status: 'FINAL'
      }
    },
    { $sort: { createdAt: -1 } },
    { $group: { _id: '$competencyId', latestResult: { $first: '$$ROOT' } } },
    { $replaceRoot: { newRoot: '$latestResult' } }
  ]);

  const populated = await Result.populate(pdp, [
    { path: 'competencyId', select: 'name category' },
    { path: 'assessmentId', select: 'description type' }
  ]);

  res.status(200).json({ status: 'success', data: { pdp: populated } });
});

exports.getSupervisorEvaluationScores = asyncHandler(async (req, res) => {
  const { assessmentId, employeeId } = req.params;
  const resp = await Response.findOne({ assessmentId, employeeId, respondentType: 'supervisor' }).lean();
  res.status(200).json({
    status: 'success',
    data: { supervisorScore: resp?.score || null, comments: resp?.comments || '' }
  });
});