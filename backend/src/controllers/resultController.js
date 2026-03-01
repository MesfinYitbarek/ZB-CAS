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
    // Handle missing/null competencyId or assessmentId
    const competencyId = result.competencyId?._id || result.competencyId;
    const assessmentId = result.assessmentId?._id || result.assessmentId;
    
    if (!competencyId || !assessmentId) {
      // Skip results with missing references
      return acc;
    }
    
    const key = `${competencyId}-${assessmentId}`;

    if (!acc[key]) {
      acc[key] = {
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
        hasQuestionDetails: true, // NEW
        date: result.createdAt,
        formattedDate: new Date(result.createdAt).toLocaleDateString(),
        hasBoth: result.scoreDetails?.selfScore !== null && result.scoreDetails?.supervisorScore !== null,
        isCombined: result.assessmentId?.type === 'Combined'
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
