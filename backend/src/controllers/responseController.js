/* controllers/responseController.js
 * Manages employee / supervisor answers during an active assessment.
 *
 * POST   /responses/save          – auto-save a single answer (upsert)
 * POST   /responses/submit        – submit entire assessment (validates completeness)
 * GET    /responses/progress/:aid – get progress for current user on an assessment
 * GET    /responses/:aid/all      – HR_ADMIN: all responses for an assessment
 * PATCH  /responses/:id/manual    – HR_ADMIN: set manual score on a ShortAnswer response
 *
 * OWASP:
 *   – Employees can only save/submit answers for themselves.
 *   – Supervisors can only submit for employees assigned to them.
 *   – Assessment must be ACTIVE; otherwise the request is rejected.
 */
const Assessment   = require('../models/Assessment');
const Question     = require('../models/Question');
const Response     = require('../models/Response');
const User         = require('../models/User');
const AppError     = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');
const { scoreSingleResponse } = require('../utils/scoring');

// ─── helper: validate that the assessment is active and the user is allowed ──
const validateAccess = async (assessmentId, userId, employeeId, respondentType) => {
  const assessment = await Assessment.findById(assessmentId);
  if (!assessment) throw new AppError('Assessment not found.', 404);
  if (assessment.status !== 'ACTIVE') {
    throw new AppError('Assessment is not active.', 400);
  }

  if (respondentType === 'self' && userId.toString() !== employeeId.toString()) {
    throw new AppError('You can only submit self-assessments for yourself.', 403);
  }

  if (respondentType === 'supervisor') {
    const employee = await User.findById(employeeId);
    if (!employee || employee.supervisorId?.toString() !== userId.toString()) {
      throw new AppError('You can only evaluate your direct reports.', 403);
    }
  }

  return assessment;
};


// ─── AUTO-SAVE (upsert one answer) ───────────────────────────────────────────
exports.saveAnswer = asyncHandler(async (req, res, next) => {
  const {
    assessmentId,
    questionId,
    selectedAnswer,
    employeeId,
  } = req.body;

  const empId = employeeId || req.user.id;

  const assessment = await validateAccess(
    assessmentId,
    req.user.id,
    empId,
    'self'
  );

  if (!assessment.questionIds.some(q => q.toString() === questionId)) {
    return next(new AppError('Question does not belong to this assessment.', 400));
  }

  const response = await Response.findOneAndUpdate(
    {
      assessmentId,
      questionId,
      userId: req.user.id,
      employeeId: empId,
      respondentType: 'self',
    },
    {
      selectedAnswer,
      respondentType: 'self',
    },
    {
      new: true,
      upsert: true,
      runValidators: true,
    }
  );

  res.status(200).json({ status: 'success', data: { response } });
});


// ─── SUBMIT FULL ASSESSMENT ──────────────────────────────────────────────────
exports.submitAssessment = asyncHandler(async (req, res, next) => {
  const { assessmentId } = req.body;
  const userId = req.user.id;

  const assessment = await validateAccess(
    assessmentId,
    userId,
    userId,
    'self'
  );

  const responses = await Response.find({
    assessmentId,
    userId,
    respondentType: 'self',
  });

  const answered = new Set(responses.map(r => r.questionId.toString()));
  const missing = assessment.questionIds.filter(
    q => !answered.has(q.toString())
  );

  if (missing.length) {
    return next(
      new AppError(`${missing.length} questions are unanswered.`, 400)
    );
  }

  const questions = await Question.find({
    _id: { $in: assessment.questionIds },
  }).select('+correctAnswer');

  const now = new Date();

  for (const resp of responses) {
    const question = questions.find(
      q => q._id.toString() === resp.questionId.toString()
    );
    if (question) {
      resp.score = scoreSingleResponse(question, resp);
      resp.submittedAt = now;
      await resp.save();
    }
  }

  res.status(200).json({
    status: 'success',
    message: 'Assessment submitted successfully.',
  });
});


// ─── GET PROGRESS ────────────────────────────────────────────────────────────
exports.getProgress = asyncHandler(async (req, res, next) => {
  const { assessmentId } = req.params;

  const assessment = await Assessment.findById(assessmentId).lean();
  if (!assessment) return next(new AppError('Assessment not found.', 404));

  const totalQuestions = assessment.questionIds.length;

  // Count answered questions for current user
  const answeredCount = await Response.countDocuments({
    assessmentId,
    userId: req.user.id,
  });

  const submitted = await Response.findOne({
    assessmentId,
    userId:     req.user.id,
    submittedAt: { $ne: null },
  }).lean();

  res.status(200).json({
    status: 'success',
    data: {
      totalQuestions,
      answeredCount,
      percentage: totalQuestions > 0
        ? parseFloat(((answeredCount / totalQuestions) * 100).toFixed(1))
        : 0,
      isSubmitted: !!submitted,
    },
  });
});

// ─── GET ALL RESPONSES (HR_ADMIN) ────────────────────────────────────────────
exports.getAllResponses = asyncHandler(async (req, res, next) => {
  const { assessmentId } = req.params;

  const assessment = await Assessment.findById(assessmentId).lean();
  if (!assessment) return next(new AppError('Assessment not found.', 404));

  const responses = await Response.find({ assessmentId })
    .populate('userId',     'name email role')
    .populate('employeeId',  'name email department position')
    .populate('questionId',  'text type')
    .sort({ employeeId: 1, createdAt: 1 })
    .lean();

  res.status(200).json({ status: 'success', data: { responses } });
});

// ─── SET MANUAL SCORE (HR_ADMIN, ShortAnswer only) ───────────────────────────
exports.setManualScore = asyncHandler(async (req, res, next) => {
  const { manualScore } = req.body;
  const response        = await Response.findById(req.params.id).populate('questionId');

  if (!response) return next(new AppError('Response not found.', 404));

  // Only ShortAnswer questions can be manually scored
  if (response.questionId.type !== 'ShortAnswer') {
    return next(new AppError('Manual scoring is only for ShortAnswer questions.', 400));
  }

  if (typeof manualScore !== 'number' || manualScore < 0 || manualScore > 5) {
    return next(new AppError('Manual score must be a number between 0 and 5.', 400));
  }

  response.manualScore = manualScore;
  response.score       = manualScore;
  await response.save();

  res.status(200).json({ status: 'success', data: { response } });
});

// ─── SAVE SUPERVISOR EVALUATION DRAFT ──────────────────────────────────────
exports.saveSupervisorEvaluation = asyncHandler(async (req, res, next) => {
  const { assessmentId, employeeId, score, comments } = req.body;
  const supervisorId = req.user.id;

  await validateAccess(
    assessmentId,
    supervisorId,
    employeeId,
    'supervisor'
  );

  const parsedScore = Number(score);
  if (isNaN(parsedScore) || parsedScore < 0 || parsedScore > 100) {
    return next(new AppError('Score must be 0–100.', 400));
  }

  const evaluation = await Response.findOneAndUpdate(
    {
      assessmentId,
      employeeId,
      userId: supervisorId,
      respondentType: 'supervisor',
    },
    {
      score: parsedScore,
      comments: comments || '',
      isSupervisorEvaluation: true,
    },
    {
      new: true,
      upsert: true,
      runValidators: true,
    }
  );

  res.status(200).json({
    status: 'success',
    message: 'Supervisor evaluation draft saved.',
    data: { evaluation },
  });
});


// ─── SUBMIT SUPERVISOR EVALUATION ──────────────────────────────────────────
exports.submitSupervisorEvaluation = asyncHandler(async (req, res, next) => {
  const { assessmentId, employeeId, score, comments } = req.body;
  const supervisorId = req.user.id;

  const assessment = await validateAccess(
    assessmentId,
    supervisorId,
    employeeId,
    'supervisor'
  );

  const parsedScore = Number(score);
  if (isNaN(parsedScore) || parsedScore < 0 || parsedScore > 100) {
    return next(new AppError('Score must be 0–100.', 400));
  }

  const now = new Date();

  const evaluation = await Response.findOneAndUpdate(
    {
      assessmentId,
      employeeId,
      userId: supervisorId,
      respondentType: 'supervisor',
    },
    {
      score: parsedScore,
      comments: comments || '',
      isSupervisorEvaluation: true,
      submittedAt: now,
    },
    {
      new: true,
      upsert: true,
      runValidators: true,
    }
  );

  // Update Assessment supervisorEvaluations
  const existing = assessment.supervisorEvaluations.find(
    e =>
      e.employeeId.toString() === employeeId &&
      e.supervisorId.toString() === supervisorId
  );

  if (existing) {
    existing.status = 'COMPLETED';
    existing.completedAt = now;
    existing.finalScore = parsedScore;
  } else {
    assessment.supervisorEvaluations.push({
      employeeId,
      supervisorId,
      status: 'COMPLETED',
      completedAt: now,
      finalScore: parsedScore,
    });
  }

  await assessment.save();

  res.status(200).json({
    status: 'success',
    message: 'Supervisor evaluation submitted successfully.',
    data: { evaluation },
  });
});


// ─── GET SUPERVISOR EVALUATION ─────────────────────────────────────────────
exports.getSupervisorEvaluation = asyncHandler(async (req, res, next) => {
  const { assessmentId, employeeId } = req.params;
  const supervisorId = req.user.id;

  // Verify access
  const employee = await User.findById(employeeId);
  if (!employee || employee.supervisorId?.toString() !== supervisorId) {
    return next(new AppError('Access denied.', 403));
  }

  const evaluation = await Response.findOne({
    assessmentId,
    employeeId,
    userId: supervisorId,
    respondentType: 'supervisor',
  }).lean();

  res.status(200).json({
    status: 'success',
    data: { evaluation }
  });
});