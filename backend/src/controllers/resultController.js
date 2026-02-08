/* controllers/resultController.js - Updated */
const mongoose = require('mongoose');
const Result       = require('../models/Result');
const User         = require('../models/User');
const Assessment   = require('../models/Assessment');
const Response     = require('../models/Response');
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
          [{ 
            competencyName: r.competencyName, 
            finalScore: r.finalScore, 
            level: r.level,
            assessmentType: r.assessmentType 
          }]
        );
      } catch (e) {
        console.error('[ResultCtrl] Email send failed:', e.message);
      }
    });

  res.status(200).json({ status: 'success', data: { results } });
});

// ─── AUTO-SCORE WHEN SUPERVISOR SUBMITS EVALUATION ──────────────────────────
exports.autoScoreEmployee = asyncHandler(async (req, res, next) => {
  const { assessmentId, employeeId } = req.body;

  const assessment = await Assessment.findById(assessmentId);
  if (!assessment) {
    return next(new AppError('Assessment not found.', 404));
  }

  // Get all responses for this employee
  const responses = await Response.find({
    assessmentId,
    employeeId
  });

  // For SelfAssessment or SupervisorOnly, we can score immediately
  if (assessment.type === 'SelfAssessment' || assessment.type === 'SupervisorOnly') {
    // Check if all required responses are submitted
    const submittedResponses = responses.filter(r => r.submittedAt);
    
    if (assessment.type === 'SelfAssessment') {
      // Need self-assessment responses
      const selfResponses = submittedResponses.filter(r => r.respondentType === 'self');
      if (selfResponses.length === 0) {
        return next(new AppError('Self-assessment not completed.', 400));
      }
    } else if (assessment.type === 'SupervisorOnly') {
      // Need supervisor response
      const supervisorResponse = submittedResponses.find(r => r.respondentType === 'supervisor');
      if (!supervisorResponse) {
        return next(new AppError('Supervisor evaluation not completed.', 400));
      }
    }
  }
  
  // For Combined, need both self and supervisor
  else if (assessment.type === 'Combined') {
    const selfSubmitted = responses.some(r => 
      r.respondentType === 'self' && r.submittedAt
    );
    const supervisorSubmitted = responses.some(r => 
      r.respondentType === 'supervisor' && r.submittedAt
    );
    
    if (!selfSubmitted || !supervisorSubmitted) {
      return next(new AppError('Both self-assessment and supervisor evaluation are required.', 400));
    }
  }

  // Trigger scoring for this specific employee
  const questions = await Question.find({ _id: { $in: assessment.questionIds } })
    .select('+correctAnswer')
    .lean();

  const selfResponses = responses.filter(r => r.respondentType === 'self');
  const supervisorResponses = responses.filter(r => r.respondentType === 'supervisor');

  let finalScore = 0;
  
  if (assessment.type === 'SelfAssessment') {
    const { percentage } = computeRawScore(questions, selfResponses);
    finalScore = percentage;
  } 
  else if (assessment.type === 'SupervisorOnly') {
    // Supervisor gives a single score
    const supervisorResponse = supervisorResponses[0];
    finalScore = supervisorResponse?.score || 0;
  } 
  else if (assessment.type === 'Combined') {
    const selfResult = computeRawScore(questions, selfResponses);
    const selfPercentage = selfResult.percentage;
    
    const supervisorResponse = supervisorResponses[0];
    const supervisorPercentage = supervisorResponse?.score || 0;
    
    finalScore = computeWeightedScore(
      selfPercentage,
      supervisorPercentage,
      assessment.weight
    );
  }

  const level = assignLevel(finalScore);

  // Lookup recommendation
  const rec = await Recommendation.findOne({
    competencyId: assessment.competencyId,
    level,
  }).lean();

  // Create or update result
  const existingResult = await Result.findOne({
    userId: employeeId,
    assessmentId,
    competencyId: assessment.competencyId,
  });

  let result;
  
  if (existingResult) {
    existingResult.finalScore = finalScore;
    existingResult.level = level;
    existingResult.recommendation = rec ? rec.recommendation : '';
    existingResult.status = 'FINAL';
    await existingResult.save();
    result = existingResult;
  } else {
    result = await Result.create({
      userId: employeeId,
      assessmentId,
      competencyId: assessment.competencyId,
      finalScore,
      level,
      recommendation: rec ? rec.recommendation : '',
      status: 'FINAL',
    });
  }

  // Send notification to employee
  const employee = await User.findById(employeeId);
  if (employee && employee.email) {
    try {
      await sendResultsEmail(
        { name: employee.name, email: employee.email },
        [{ 
          competencyName: assessment.competencyId?.name || 'Competency',
          finalScore,
          level,
          assessmentType: assessment.type
        }]
      );
    } catch (e) {
      console.error('Failed to send results email:', e.message);
    }
  }

  res.status(200).json({
    status: 'success',
    message: 'Assessment scored successfully.',
    data: { result }
  });
});

// ─── LIST RESULTS ─────────────────────────────────────────────────────────────
exports.getResults = asyncHandler(async (req, res) => {
  const { userId, competencyId, assessmentId, status, type, page = 1, limit = 20 } = req.query;

  const filter = {};
  if (userId) filter.userId = userId;
  if (competencyId) filter.competencyId = competencyId;
  if (assessmentId) filter.assessmentId = assessmentId;
  if (status) filter.status = status;

  // Filter by assessment type through population
  if (type) {
    // We'll filter after populating
  }

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
      .populate('userId', 'name email department position')
      .populate('competencyId', 'name category')
      .populate('assessmentId', 'description type startDate endDate weight')
      .skip(skip)
      .limit(parseInt(limit, 10))
      .sort({ createdAt: -1 })
      .lean(),
    Result.countDocuments(filter),
  ]);

  // Filter by assessment type if needed
  let filteredResults = results;
  if (type) {
    filteredResults = results.filter(result => 
      result.assessmentId && result.assessmentId.type === type
    );
  }

  res.status(200).json({
    status: 'success',
    data: {
      results: filteredResults,
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
    .populate('competencyId', 'name category')
    .populate('assessmentId', 'description type startDate endDate weight')
    .sort({ createdAt: -1 })
    .lean();

  // Add breakdown for combined assessments
  const enhancedResults = await Promise.all(results.map(async (result) => {
    if (result.assessmentId?.type === 'Combined') {
      // If we have scoreDetails stored, use that
      if (!result.scoreDetails) {
        // Calculate score details if not stored
        const responses = await Response.find({
          assessmentId: result.assessmentId._id,
          employeeId: userId
        }).lean();

        const selfResponses = responses.filter(r => r.respondentType === 'self');
        const supervisorResponses = responses.filter(r => r.respondentType === 'supervisor');

        if (selfResponses.length > 0 && supervisorResponses.length > 0) {
          const questions = await Question.find({ 
            _id: { $in: result.assessmentId.questionIds } 
          }).select('+correctAnswer').lean();

          const selfResult = computeRawScore(questions, selfResponses);
          const supervisorResult = computeRawScore(questions, supervisorResponses);

          result.scoreDetails = {
            selfScore: selfResult.percentage,
            supervisorScore: supervisorResult.percentage,
            weightUsed: result.assessmentId.weight || { selfAssessment: 20, supervisor: 80 },
            calculation: `(${selfResult.percentage} × ${result.assessmentId.weight?.selfAssessment || 20}%) + (${supervisorResult.percentage} × ${result.assessmentId.weight?.supervisor || 80}%) = ${result.finalScore}`
          };
        }
      }
    }
    return result;
  }));

  res.status(200).json({ status: 'success', data: { results: enhancedResults } });
});

// ─── SINGLE RESULT ───────────────────────────────────────────────────────────
exports.getResult = asyncHandler(async (req, res, next) => {
  const result = await Result.findById(req.params.id)
    .populate('userId', 'name email department position')
    .populate('competencyId', 'name category')
    .populate('assessmentId', 'description type startDate endDate weight')
    .lean();

  if (!result) return next(new AppError('Result not found.', 404));

  // Add detailed breakdown for combined assessments
  if (result.assessmentId?.type === 'Combined') {
    // If we have scoreDetails stored, use that
    if (!result.scoreDetails) {
      // Calculate score details if not stored
      const responses = await Response.find({
        assessmentId: result.assessmentId._id,
        employeeId: result.userId._id
      }).lean();

      const selfResponses = responses.filter(r => r.respondentType === 'self');
      const supervisorResponses = responses.filter(r => r.respondentType === 'supervisor');

      if (selfResponses.length > 0 && supervisorResponses.length > 0) {
        const questions = await Question.find({ 
          _id: { $in: result.assessmentId.questionIds } 
        }).select('+correctAnswer').lean();

        const selfResult = computeRawScore(questions, selfResponses);
        const supervisorResult = computeRawScore(questions, supervisorResponses);

        result.scoreDetails = {
          selfScore: selfResult.percentage,
          supervisorScore: supervisorResult.percentage,
          weightUsed: result.assessmentId.weight || { selfAssessment: 20, supervisor: 80 },
          calculation: `(${selfResult.percentage} × ${result.assessmentId.weight?.selfAssessment || 20}%) + (${supervisorResult.percentage} × ${result.assessmentId.weight?.supervisor || 80}%) = ${result.finalScore}`
        };
      }
    }
  }

  res.status(200).json({ status: 'success', data: { result } });
});

// ─── FINALISE A PENDING RESULT ───────────────────────────────────────────────
exports.finaliseResult = asyncHandler(async (req, res, next) => {
  const result = await finaliseResult(req.params.id);

  res.status(200).json({ status: 'success', data: { result } });
});

// ─── PERSONAL DEVELOPMENT PLAN (PDP) ─────────────────────────────────────────
exports.getPDP = asyncHandler(async (req, res, next) => {
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

  // Get the most recent FINAL result per competency
  const pdp = await Result.aggregate([
    { $match: { userId: new mongoose.Types.ObjectId(userId), status: 'FINAL' } },
    { $sort: { createdAt: -1 } },
    { $group: { _id: '$competencyId', latestResult: { $first: '$$ROOT' } } },
    { $replaceRoot: { newRoot: '$latestResult' } },
  ]);

  // Populate and enhance
  const populated = await Result.populate(pdp, [
    { path: 'competencyId', select: 'name category' },
    { path: 'assessmentId', select: 'description type' },
  ]);

  // Add assessment type and date info
  const enhancedPDP = populated.map(item => ({
    ...item,
    assessmentDate: item.createdAt,
    assessmentType: item.assessmentId?.type || 'Unknown'
  }));

  res.status(200).json({ status: 'success', data: { pdp: enhancedPDP } });
});

// ─── GET SUPERVISOR EVALUATION SCORES ───────────────────────────────────────
exports.getSupervisorEvaluationScores = asyncHandler(async (req, res, next) => {
  const { assessmentId, employeeId } = req.params;

  // Verify access
  const employee = await User.findById(employeeId);
  if (req.user.role === 'SUPERVISOR' && 
      (!employee || employee.supervisorId?.toString() !== req.user.id)) {
    return next(new AppError('Access denied.', 403));
  }

  const supervisorResponses = await Response.find({
    assessmentId,
    employeeId,
    respondentType: 'supervisor'
  }).sort({ createdAt: -1 }).limit(1).lean();

  if (supervisorResponses.length === 0) {
    return res.status(200).json({
      status: 'success',
      data: { supervisorScore: null, comments: '' }
    });
  }

  const latest = supervisorResponses[0];
  
  res.status(200).json({
    status: 'success',
    data: {
      supervisorScore: latest.score || 0,
      comments: latest.comments || '',
      submittedAt: latest.submittedAt,
      evaluatorId: latest.userId
    }
  });
});

// Import scoring utilities
const { computeRawScore, assignLevel } = require('../utils/scoring');
const Question = require('../models/Question');
const Recommendation = require('../models/Recommendation');