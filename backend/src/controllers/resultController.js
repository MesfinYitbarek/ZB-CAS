import mongoose from 'mongoose';
import Result from '../models/Result.js';
import User from '../models/User.js';
import Assessment from '../models/Assessment.js';
import Response from '../models/Response.js';
import asyncHandler from '../utils/asyncHandler.js';
import AppError from '../utils/AppError.js';
import { scoreFullAssessment, scoreIndividual } from '../services/scoringService.js';
import { sendResultsEmail } from '../services/emailService.js';

// Admin manually scores Combined Assessment
export const scoreAssessment = asyncHandler(async (req, res, next) => {
  const results = await scoreFullAssessment(req.params.assessmentId);

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
export const autoScoreEmployee = asyncHandler(async (req, res, next) => {
  const { assessmentId, employeeId } = req.body;
  const assessment = await Assessment.findById(assessmentId).lean();

  if (assessment.type === 'Combined') {
    return next(new AppError('Combined assessments must be scored by Admin.', 400));
  }

  const result = await scoreIndividual(assessmentId, employeeId);
  res.status(200).json({ status: 'success', data: { result } });
});

// Get available assessments for filtering
export const getAvailableAssessments = asyncHandler(async (req, res) => {
  let filter = {};

  // For employees, only show assessments they have results for
  if (req.user.role === 'EMPLOYEE') {
    const userResults = await Result.find({ userId: req.user.id })
      .distinct('assessmentId')
      .lean();
    filter._id = { $in: userResults };
  }

  // For supervisors, show assessments from their subordinates' results
  if (req.user.role === 'SUPERVISOR') {
    const subordinates = await User.find({ supervisorId: req.user.id }).select('_id').lean();
    const subordinateIds = subordinates.map(s => s._id);
    const assessmentIds = await Result.find({ userId: { $in: subordinateIds } })
      .distinct('assessmentId')
      .lean();
    filter._id = { $in: assessmentIds };
  }

  const assessments = await Assessment.find(filter)
    .select('_id title description type createdAt')
    .sort({ createdAt: -1 })
    .lean();

  res.status(200).json({
    status: 'success',
    data: { assessments }
  });
});

// ═══════════════════════════════════════════════════════════════
// NEW: Get per-question details for a specific result
// This is fetched on-demand when the detail modal is opened
// to avoid bloating the list API response
// ═══════════════════════════════════════════════════════════════
export const getResultQuestionDetails = asyncHandler(async (req, res, next) => {
  const { id } = req.params;

  const result = await Result.findById(id)
    .select('scoreDetails.questionDetails userId assessmentId')
    .lean();

  if (!result) {
    return next(new AppError('Result not found.', 404));
  }

  // Authorization: employees can only see their own results
  if (req.user.role === 'EMPLOYEE' && result.userId.toString() !== req.user.id) {
    return next(new AppError('Not authorized to view this result.', 403));
  }

  // For supervisors, verify the result belongs to one of their subordinates
  if (req.user.role === 'SUPERVISOR') {
    const subordinates = await User.find({ supervisorId: req.user.id }).select('_id').lean();
    const subordinateIds = subordinates.map(s => s._id.toString());
    if (!subordinateIds.includes(result.userId.toString())) {
      return next(new AppError('Not authorized to view this result.', 403));
    }
  }

  const questionDetails = result.scoreDetails?.questionDetails || [];

  // Compute summary statistics
  const summary = {
    totalQuestions: questionDetails.length,
    answered: questionDetails.filter(q => !q.isUnanswered).length,
    unanswered: questionDetails.filter(q => q.isUnanswered).length,
    fullyCorrect: questionDetails.filter(q => q.isCorrect).length,
    partialCredit: questionDetails.filter(q => q.isPartial).length,
    incorrect: questionDetails.filter(q => !q.isCorrect && !q.isPartial && !q.isUnanswered).length,
    totalScore: questionDetails.reduce((sum, q) => sum + q.scoreAwarded, 0),
    totalPossible: questionDetails.reduce((sum, q) => sum + q.maxScore, 0)
  };

  res.status(200).json({
    status: 'success',
    data: {
      questionDetails,
      summary
    }
  });
});

// Get results by assessment - FIXED for admin view
export const getResultsByAssessment = asyncHandler(async (req, res, next) => {
  const { assessmentId } = req.params;
  const { page = 1, limit = 20 } = req.query;

  if (!assessmentId) {
    return next(new AppError('Assessment ID is required', 400));
  }

  let filter = { assessmentId };

  // Apply role-based filtering
  if (req.user.role === 'EMPLOYEE') {
    filter.userId = req.user.id;
  }
  if (req.user.role === 'SUPERVISOR') {
    const subordinates = await User.find({ supervisorId: req.user.id }).select('_id').lean();
    filter.userId = { $in: subordinates.map(s => s._id) };
  }
  // ADMIN - no additional filter, see all users

  const skip = (parseInt(page) - 1) * parseInt(limit);

  const [results, total, assessment] = await Promise.all([
    Result.find(filter)
      .populate('userId', 'name email department position employeeId')
      .populate('competencyId', 'name category')
      .populate('assessmentId', 'description type title weight')
      // NOTE: We exclude questionDetails from the list view for performance
      // Question details are fetched on-demand via getResultQuestionDetails
      .select('-scoreDetails.questionDetails')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean(),
    Result.countDocuments(filter),
    Assessment.findById(assessmentId).select('title description type').lean()
  ]);

  // Process results differently based on role
  let processedResults;

  if (req.user.role === 'ADMIN' || req.user.role === 'HR_ADMIN') {
    // For admin: DON'T group by competency - show each result individually
    // This ensures all employees and all competencies appear
    processedResults = results.map(result => ({
      _id: result._id,
      competencyId: result.competencyId,
      competencyName: result.competencyId?.name || 'N/A',
      competencyCategory: result.competencyId?.category || 'N/A',
      assessmentId: result.assessmentId,
      assessmentDescription: result.assessmentId?.description || 'N/A',
      assessmentType: result.assessmentId?.type || 'N/A',
      userId: result.userId,
      userName: result.userId?.name || 'N/A',
      userEmail: result.userId?.email || 'N/A',
      userDepartment: result.userId?.department || 'N/A',
      userPosition: result.userId?.position || 'N/A',
      employeeId: result.userId?.employeeId || result.userId?._id || 'N/A',
      selfScore: result.scoreDetails?.selfScore || null,
      supervisorScore: result.scoreDetails?.supervisorScore || null,
      finalScore: result.finalScore,
      level: result.level,
      recommendation: result.recommendation,
      status: result.status || 'FINAL',
      weightUsed: result.scoreDetails?.weightUsed || null,
      calculation: result.scoreDetails?.calculation || null,
      // NEW: Flag indicating whether question details are available
      hasQuestionDetails: !!(result.scoreDetails?.questionDetails?.length > 0 ||
        // If we excluded questionDetails via .select(), check if scoreDetails exists
        result.scoreDetails),
      date: result.createdAt,
      formattedDate: new Date(result.createdAt).toLocaleDateString(),
      hasBoth: result.scoreDetails?.selfScore !== null && result.scoreDetails?.supervisorScore !== null,
      isCombined: result.assessmentId?.type === 'Combined'
    }));
  } else {
    // For employees and supervisors: group by competency to avoid duplicates
    processedResults = processResults(results);
  }

  res.status(200).json({
    status: 'success',
    data: {
      results: processedResults,
      assessment,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / parseInt(limit))
      }
    }
  });
});

// Helper function for non-admin users (group by competency)
const processResults = (results) => {
  const grouped = results.reduce((acc, result) => {
    const key = `${result.competencyId._id}-${result.assessmentId._id}`;

    if (!acc[key]) {
      acc[key] = {
        _id: result._id,
        competencyId: result.competencyId,
        competencyName: result.competencyId.name,
        competencyCategory: result.competencyId.category,
        assessmentId: result.assessmentId,
        assessmentDescription: result.assessmentId.description,
        assessmentType: result.assessmentId.type,
        userId: result.userId,
        userName: result.userId?.name || 'N/A',
        userEmail: result.userId?.email || 'N/A',
        userDepartment: result.userId?.department || 'N/A',
        userPosition: result.userId?.position || 'N/A',
        employeeId: result.userId?.employeeId || result.userId?._id || 'N/A',
        selfScore: result.scoreDetails?.selfScore || null,
        supervisorScore: result.scoreDetails?.supervisorScore || null,
        finalScore: result.finalScore,
        level: result.level,
        recommendation: result.recommendation,
        status: result.status || 'FINAL',
        weightUsed: result.scoreDetails?.weightUsed || null,
        calculation: result.scoreDetails?.calculation || null,
        hasQuestionDetails: true, // NEW
        date: result.createdAt,
        formattedDate: new Date(result.createdAt).toLocaleDateString(),
        hasBoth: result.scoreDetails?.selfScore !== null && result.scoreDetails?.supervisorScore !== null,
        isCombined: result.assessmentId.type === 'Combined'
      };
    }

    return acc;
  }, {});

  return Object.values(grouped);
};

// Paginated and Filtered Reads (keep original for backward compatibility)
export const getResults = asyncHandler(async (req, res) => {
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
      .select('-scoreDetails.questionDetails') // Exclude question details from list
      .sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit)).lean(),
    Result.countDocuments(filter)
  ]);

  const processedResults = processResults(results);

  res.status(200).json({
    status: 'success',
    data: {
      results: processedResults,
      pagination: { total, page: parseInt(page), limit: parseInt(limit) }
    }
  });
});

export const getResult = asyncHandler(async (req, res, next) => {
  const result = await Result.findById(req.params.id)
    .populate('userId', 'name email department position')
    .populate('competencyId', 'name category')
    .populate('assessmentId', 'description type weight')
    .lean();

  if (!result) return next(new AppError('Result not found.', 404));

  // Include question details in single result fetch
  res.status(200).json({
    status: 'success',
    data: {
      result,
      // NEW: Include question details summary
      questionDetails: result.scoreDetails?.questionDetails || [],
      questionSummary: {
        totalQuestions: (result.scoreDetails?.questionDetails || []).length,
        answered: (result.scoreDetails?.questionDetails || []).filter(q => !q.isUnanswered).length,
        fullyCorrect: (result.scoreDetails?.questionDetails || []).filter(q => q.isCorrect).length,
        partialCredit: (result.scoreDetails?.questionDetails || []).filter(q => q.isPartial).length
      }
    }
  });
});

// Finalise a result
export const finaliseResult = asyncHandler(async (req, res, next) => {
  const result = await Result.findById(req.params.id);
  if (!result) return next(new AppError('Result not found.', 404));

  result.status = 'FINAL';
  await result.save();

  res.status(200).json({ status: 'success', data: { result } });
});

export const getPDP = asyncHandler(async (req, res) => {
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

export const getSupervisorEvaluationScores = asyncHandler(async (req, res) => {
  const { assessmentId, employeeId } = req.params;
  const resp = await Response.findOne({
    assessmentId,
    employeeId,
    respondentType: 'supervisor'
  }).lean();

  res.status(200).json({
    status: 'success',
    data: { supervisorScore: resp?.score || null, comments: resp?.comments || '' }
  });
});

// ─── RICH FILTERED RESULTS (for the new Results page) ────────────────────────
// Supports filtering by: assessment, competency, department, position,
// targetGroup, purpose, level, status, assessmentType, dateFrom, dateTo, search
export const getFilteredResults = asyncHandler(async (req, res) => {
  const {
    assessmentId, competencyId, department, position,
    targetGroup, purpose, level, status, assessmentType,
    dateFrom, dateTo, search, gender,
    page = 1, limit = 20, sortBy = 'createdAt', sortDir = 'desc',
  } = req.query;

  let filter = {};

  // Assessment filter
  if (assessmentId) filter.assessmentId = assessmentId;
  if (competencyId) filter.competencyId = competencyId;
  if (level) filter.level = level;
  if (status) filter.status = status;

  // Date range
  if (dateFrom || dateTo) {
    filter.createdAt = {};
    if (dateFrom) filter.createdAt.$gte = new Date(dateFrom);
    if (dateTo) {
      const end = new Date(dateTo);
      end.setHours(23, 59, 59, 999);
      filter.createdAt.$lte = end;
    }
  }

  // Role-based scoping
  if (req.user.role === 'EMPLOYEE') {
    filter.userId = req.user.id;
  } else if (req.user.role === 'SUPERVISOR') {
    const subordinates = await User.find({ supervisorId: req.user.id }).select('_id').lean();
    filter.userId = { $in: subordinates.map(s => s._id) };
  }

  const skip = (parseInt(page) - 1) * parseInt(limit);
  const sortObj = { [sortBy === 'score' ? 'finalScore' : sortBy]: sortDir === 'asc' ? 1 : -1 };

  let query = Result.find(filter)
    .populate('userId', 'name email department position employeeId gender')
    .populate('competencyId', 'name category targetGroups')
    .populate({
      path: 'assessmentId',
      select: 'description type title weight targetGroup purpose targetAudience status',
    })
    .select('-scoreDetails.questionDetails')
    .sort(sortObj)
    .skip(skip)
    .limit(parseInt(limit));

  const [results, total] = await Promise.all([
    query.lean(),
    Result.countDocuments(filter),
  ]);

  // Post-populate filters (for fields on joined docs)
  let filtered = results;

  if (department) {
    filtered = filtered.filter(r => r.userId?.department === department);
  }
  if (position) {
    filtered = filtered.filter(r =>
      r.userId?.position?.toLowerCase().includes(position.toLowerCase())
    );
  }
  if (gender) {
    filtered = filtered.filter(r => r.userId?.gender === gender);
  }
  if (targetGroup) {
    filtered = filtered.filter(r => r.assessmentId?.targetGroup === targetGroup);
  }
  if (purpose) {
    filtered = filtered.filter(r => r.assessmentId?.purpose === purpose);
  }
  if (assessmentType) {
    filtered = filtered.filter(r => r.assessmentId?.type === assessmentType);
  }
  if (search) {
    const s = search.toLowerCase();
    filtered = filtered.filter(r =>
      r.userId?.name?.toLowerCase().includes(s) ||
      r.userId?.email?.toLowerCase().includes(s) ||
      r.userId?.employeeId?.toLowerCase().includes(s) ||
      r.competencyId?.name?.toLowerCase().includes(s) ||
      r.assessmentId?.description?.toLowerCase().includes(s)
    );
  }

  // Map to rich response shape
  const mapped = filtered.map(r => ({
    _id: r._id,
    userId: r.userId,
    userName: r.userId?.name || 'N/A',
    userEmail: r.userId?.email || 'N/A',
    userDepartment: r.userId?.department || 'N/A',
    userPosition: r.userId?.position || 'N/A',
    userGender: r.userId?.gender || 'N/A',
    employeeId: r.userId?.employeeId || 'N/A',
    competencyId: r.competencyId,
    competencyName: r.competencyId?.name || 'N/A',
    competencyCategory: r.competencyId?.category || 'N/A',
    assessmentId: r.assessmentId,
    assessmentDescription: r.assessmentId?.description || 'N/A',
    assessmentType: r.assessmentId?.type || 'N/A',
    targetGroup: r.assessmentId?.targetGroup || 'N/A',
    purpose: r.assessmentId?.purpose || 'N/A',
    selfScore: r.scoreDetails?.selfScore ?? null,
    supervisorScore: r.scoreDetails?.supervisorScore ?? null,
    finalScore: r.finalScore,
    level: r.level,
    recommendation: r.recommendation,
    status: r.status || 'FINAL',
    weightUsed: r.scoreDetails?.weightUsed || null,
    calculation: r.scoreDetails?.calculation || null,
    isCombined: r.assessmentId?.type === 'Combined',
    hasBoth: r.scoreDetails?.selfScore !== null && r.scoreDetails?.supervisorScore !== null,
    date: r.createdAt,
    formattedDate: new Date(r.createdAt).toLocaleDateString(),
  }));

  // Aggregate stats over full filtered set (for summary cards)
  const stats = {
    total: mapped.length,
    avgScore: mapped.length ? parseFloat((mapped.reduce((s, r) => s + r.finalScore, 0) / mapped.length).toFixed(1)) : 0,
    levelDist: { Basic: 0, Intermediate: 0, Advanced: 0, Expert: 0 },
    byDept: {},
  };
  mapped.forEach(r => {
    if (stats.levelDist[r.level] !== undefined) stats.levelDist[r.level]++;
    if (r.userDepartment) {
      if (!stats.byDept[r.userDepartment]) stats.byDept[r.userDepartment] = 0;
      stats.byDept[r.userDepartment]++;
    }
  });

  res.status(200).json({
    status: 'success',
    data: {
      results: mapped,
      stats,
      pagination: {
        total,
        filteredTotal: filtered.length,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / parseInt(limit)),
      },
    },
  });
});

// ─── GET FILTER OPTIONS (distinct values for dropdown population) ─────────────
export const getResultFilterOptions = asyncHandler(async (req, res) => {
  const [departments, positions, competencies, assessments] = await Promise.all([
    User.distinct('department', { status: 'ACTIVE', department: { $ne: null } }),
    User.distinct('position', { status: 'ACTIVE', position: { $ne: null } }),
    Result.distinct('competencyId').then(ids =>
      mongoose.model('Competency').find({ _id: { $in: ids } }).select('name category').lean()
    ),
    Result.distinct('assessmentId').then(ids =>
      Assessment.find({ _id: { $in: ids } }).select('description type status targetGroup purpose').lean()
    ),
  ]);

  res.status(200).json({
    status: 'success',
    data: {
      departments: departments.filter(Boolean).sort(),
      positions: positions.filter(Boolean).sort(),
      competencies,
      assessments,
      levels: ['Basic', 'Intermediate', 'Advanced', 'Expert'],
      assessmentTypes: ['SelfAssessment', 'SupervisorOnly', 'Combined'],
      targetGroups: ['managerial', 'non-managerial', 'common'],
      purposes: ['Career Development', 'Succession Planning', 'Performance Improvement', 'Training Needs Analysis', 'Promotion Readiness', 'Other'],
    },
  });
});
