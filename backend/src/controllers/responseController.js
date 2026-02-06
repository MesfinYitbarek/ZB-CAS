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
  const assessment = await Assessment.findById(assessmentId).lean();
  if (!assessment) throw new AppError('Assessment not found.', 404);
  if (assessment.status !== 'ACTIVE') {
    throw new AppError('Assessment is not active.', 400);
  }

  // For self: userId must equal employeeId
  if (respondentType === 'self' && userId.toString() !== employeeId.toString()) {
    throw new AppError('You can only submit self-assessments for yourself.', 403);
  }

  // For supervisor: the employee must be assigned to this supervisor
  if (respondentType === 'supervisor') {
    const employee = await User.findById(employeeId).lean();
    if (!employee || employee.supervisorId?.toString() !== userId.toString()) {
      throw new AppError('You can only evaluate your direct reports.', 403);
    }
  }

  return assessment;
};

// ─── AUTO-SAVE (upsert one answer) ───────────────────────────────────────────
exports.saveAnswer = asyncHandler(async (req, res, next) => {
  const { assessmentId, questionId, selectedAnswer, employeeId, respondentType } = req.body;

  const assessment = await validateAccess(
    assessmentId,
    req.user.id,
    employeeId || req.user.id,
    respondentType || 'self'
  );

  // Verify the question belongs to this assessment
  if (!assessment.questionIds.some((qId) => qId.toString() === questionId)) {
    return next(new AppError('Question does not belong to this assessment.', 400));
  }

  // Upsert
  const response = await Response.findOneAndUpdate(
    {
      assessmentId,
      questionId,
      userId:     req.user.id,
      employeeId:  employeeId || req.user.id,
    },
    {
      selectedAnswer,
      respondentType: respondentType || 'self',
      $setOnInsert: { score: 0 },
    },
    { new: true, upsert: true, runValidators: true }
  );

  res.status(200).json({ status: 'success', data: { response } });
});

// ─── SUBMIT FULL ASSESSMENT ──────────────────────────────────────────────────
exports.submitAssessment = asyncHandler(async (req, res, next) => {
  const { assessmentId, employeeId, respondentType } = req.body;
  const empId = employeeId || req.user.id;
  const rType = respondentType || 'self';

  const assessment = await validateAccess(assessmentId, req.user.id, empId, rType);

  // Check all questions are answered
  const responses = await Response.find({
    assessmentId,
    userId:        req.user.id,
    employeeId:     empId,
    respondentType: rType,
  }).lean();

  const answeredIds = new Set(responses.map((r) => r.questionId.toString()));
  const missing     = assessment.questionIds.filter(
    (qId) => !answeredIds.has(qId.toString())
  );

  if (missing.length > 0) {
    return next(new AppError(`${missing.length} question(s) are unanswered. Please complete all questions.`, 400));
  }

  // Score each response using the scoring engine
  const questions = await Question.find({ _id: { $in: assessment.questionIds } })
    .select('+correctAnswer').lean();

  const now = new Date();

  for (const resp of responses) {
    const question = questions.find((q) => q._id.toString() === resp.questionId.toString());
    if (question) {
      const score = scoreSingleResponse(question, resp);
      await Response.findByIdAndUpdate(resp._id, { score, submittedAt: now });
    }
  }

  res.status(200).json({
    status:  'success',
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
