import logger from '../utils/logger.js';
/* controllers/responseController.js */
import Assessment from '../models/Assessment.js';
import Question from '../models/Question.js';
import Response from '../models/Response.js';
import SecurityViolation from '../models/SecurityViolation.js';
import User from '../models/User.js';
import AppError from '../utils/AppError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { scoreIndividual } from '../services/scoringService.js';
import { sendResultsEmail } from '../services/emailService.js';
import { notifyResultReady } from '../services/notificationService.js';

/* ═══════════════════════════════════════════════════════════════════════════
   HELPERS
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Validate access permissions for assessments
 */
const validateAccess = async (assessmentId, userId, employeeId, respondentType) => {
  const assessment = await Assessment.findById(assessmentId);
  if (!assessment) throw new AppError('Assessment not found.', 404);
  if (assessment.status !== 'ACTIVE') throw new AppError('Assessment is not active.', 400);

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

/**
 * Normalize violation type to a consistent UPPER_SNAKE_CASE format
 */
const normalizeViolationType = (type) => {
  if (!type) return 'UNKNOWN';
  return type.toUpperCase().replace(/[-\s]/g, '_');
};

/**
 * Map violation types → summary counter field names
 */
const VIOLATION_FIELD_MAP = {
  TAB_SWITCH: 'tabSwitches',
  COPY_ATTEMPT: 'copyAttempts',
  RIGHT_CLICK: 'rightClickAttempts',
  FULLSCREEN_EXIT: 'fullscreenExits',
  DEVTOOLS: 'devToolsAttempts',
  WINDOW_BLUR: 'windowBlurs',
  PRINT_ATTEMPT: 'printAttempts',
};

/** Number of violations before a record is automatically flagged high-risk */
const HIGH_RISK_THRESHOLD = 5;

/* ═══════════════════════════════════════════════════════════════════════════
   EMPLOYEE ACTIONS
   ═══════════════════════════════════════════════════════════════════════════ */

// ─── AUTO-SAVE (Single Answer) ───────────────────────────────────────────────
export const saveAnswer = asyncHandler(async (req, res, next) => {
  const { assessmentId, questionId, selectedAnswer, employeeId } = req.body;
  const empId = employeeId || req.user.id;

  const assessment = await validateAccess(assessmentId, req.user.id, empId, 'self');

  if (!assessment.questionIds.some((q) => q.toString() === questionId)) {
    return next(new AppError('Question does not belong to this assessment.', 400));
  }

  const response = await Response.findOneAndUpdate(
    { assessmentId, questionId, userId: req.user.id, employeeId: empId, respondentType: 'self' },
    { selectedAnswer, respondentType: 'self' },
    { new: true, upsert: true, runValidators: true }
  );

  res.status(200).json({ status: 'success', data: { response } });
});

// ─── SUBMIT FULL ASSESSMENT (Employee Side) ──────────────────────────────────
export const submitAssessment = asyncHandler(async (req, res, next) => {
  const { assessmentId, employeeId: empId } = req.body;
  const employeeId = empId || req.user.id;

  const assessment = await validateAccess(assessmentId, req.user.id, employeeId, 'self');

  // Check if all questions are answered
  // const responseCount = await Response.countDocuments({
  //   assessmentId,
  //   employeeId,
  //   respondentType: 'self',
  // });
  // if (responseCount < assessment.questionIds.length) {
  //   return next(new AppError('Please answer all questions before submitting.', 400));
  // }

  // Mark all responses as submitted
  const now = new Date();
  await Response.updateMany(
    { assessmentId, employeeId, respondentType: 'self' },
    { $set: { submittedAt: now } }
  );

  // ─── Persist final security data ────────────────────────────────────────
  const { securityLog, totalViolations } = req.body;
  try {
    await SecurityViolation.findOneAndUpdate(
      { assessmentId, userId: employeeId },
      {
        $set: {
          securityLog: securityLog || null,
          submittedAt: now,
        },
        ...(totalViolations != null && {
          $max: { 'summary.totalViolations': totalViolations },
        }),
      },
      { upsert: true }
    );
  } catch (secErr) {
    logger.error({ event: 'security_log_fail', message: secErr.message });
  }

  // ─── TRIGGER AUTO-SCORING for SelfAssessment ───────────────────────────
  if (assessment.type === 'SelfAssessment') {
    const result = await scoreIndividual(assessmentId, employeeId);

    // Notify Employee
    const employee = await User.findById(employeeId).lean();
    if (employee?.email) {
      sendResultsEmail(
        { name: employee.name, email: employee.email },
        [
          {
            competencyName: assessment.competencyId?.name || 'Competency',
            finalScore: result.finalScore,
            level: result.level,
            assessmentType: assessment.type,
          },
        ]
      ).catch((e) => console.error('Email failed:', e.message));
      notifyResultReady(
        employeeId,
        assessment.competencyId?.name || 'Competency',
        result.finalScore,
        result.level,
        result._id
      );
    }

    return res.status(200).json({
      status: 'success',
      message: 'Assessment submitted and scored.',
      data: { result },
    });
  }

  res.status(200).json({ status: 'success', message: 'Assessment submitted successfully.' });
});

/* ═══════════════════════════════════════════════════════════════════════════
   SECURITY VIOLATION TRACKING
   ═══════════════════════════════════════════════════════════════════════════ */

// ─── RECORD A SINGLE SECURITY VIOLATION ──────────────────────────────────────
export const recordSecurityViolation = asyncHandler(async (req, res, next) => {
  const { assessmentId, violation } = req.body;
  const userId = req.user.id;

  if (!assessmentId) {
    return next(new AppError('assessmentId is required.', 400));
  }

  const violationType = normalizeViolationType(violation?.type);
  const violationDetails = typeof violation?.details === 'string' ? violation.details : '';

  const incFields = { 'summary.totalViolations': 1 };
  const summaryField = VIOLATION_FIELD_MAP[violationType];
  if (summaryField) {
    incFields[`summary.${summaryField}`] = 1;
  }

  const doc = await SecurityViolation.findOneAndUpdate(
    { assessmentId, userId },
    {
      $push: {
        violations: {
          type: violationType,
          timestamp: new Date(),
          details: violationDetails,
        },
      },
      $inc: incFields,
    },
    { upsert: true, new: true }
  );

  if (!doc.summary.isHighRisk && doc.summary.totalViolations >= HIGH_RISK_THRESHOLD) {
    doc.summary.isHighRisk = true;
    await doc.save();
  }

  res.status(200).json({
    status: 'success',
    data: {
      totalViolations: doc.summary.totalViolations,
      isHighRisk: doc.summary.isHighRisk,
    },
  });
});

// ─── GET SECURITY VIOLATIONS FOR A SPECIFIC USER + ASSESSMENT ────────────────
export const getSecurityViolations = asyncHandler(async (req, res, next) => {
  const { assessmentId, userId } = req.params;
  const requesterId = req.user.id;
  const requesterRole = req.user.role;

  if (requesterId !== userId && requesterRole !== 'HR_ADMIN') {
    if (requesterRole === 'SUPERVISOR') {
      const employee = await User.findById(userId).lean();
      if (!employee || employee.supervisorId?.toString() !== requesterId) {
        return next(new AppError('Not authorised to view these security records.', 403));
      }
    } else {
      return next(new AppError('Not authorised to view these security records.', 403));
    }
  }

  const record = await SecurityViolation.findOne({ assessmentId, userId })
    .populate('userId', 'name email')
    .lean();

  res.status(200).json({
    status: 'success',
    data: {
      securityRecord: record || {
        summary: {
          totalViolations: 0,
          tabSwitches: 0,
          copyAttempts: 0,
          rightClickAttempts: 0,
          fullscreenExits: 0,
          devToolsAttempts: 0,
          windowBlurs: 0,
          printAttempts: 0,
          isHighRisk: false,
        },
        violations: [],
      },
    },
  });
});

// ─── HR_ADMIN: SECURITY SUMMARY FOR AN ENTIRE ASSESSMENT ────────────────────
export const getAssessmentSecuritySummary = asyncHandler(async (req, res, next) => {
  const { assessmentId } = req.params;

  const records = await SecurityViolation.find({ assessmentId })
    .populate('userId', 'name email department')
    .sort({ 'summary.totalViolations': -1 })
    .lean();

  const aggregated = {
    totalRecords: records.length,
    highRiskCount: records.filter((r) => r.summary.isHighRisk).length,
    totalViolations: records.reduce((sum, r) => sum + (r.summary?.totalViolations || 0), 0),
    records,
  };

  res.status(200).json({ status: 'success', data: { summary: aggregated } });
});

/* ═══════════════════════════════════════════════════════════════════════════
   SUPERVISOR ACTIONS
   ═══════════════════════════════════════════════════════════════════════════ */

// ─── SUBMIT SUPERVISOR EVALUATION ────────────────────────────────────────────
export const submitSupervisorEvaluation = asyncHandler(async (req, res, next) => {
  const { assessmentId, employeeId, score, comments } = req.body;
  const supervisorId = req.user.id;

  const assessment = await Assessment.findById(assessmentId);
  if (!assessment) return next(new AppError('Assessment not found', 404));

  const evaluation = await Response.findOneAndUpdate(
    { assessmentId, employeeId, userId: supervisorId, respondentType: 'supervisor' },
    {
      score: Number(score),
      comments: comments || '',
      isSupervisorEvaluation: true,
      submittedAt: new Date(),
    },
    { new: true, upsert: true }
  );

  let result = null;
  if (assessment.type === 'SupervisorOnly') {
    result = await scoreIndividual(assessmentId, employeeId);
    logger.info({ event: 'auto_score_supervisor_only', employeeId });
  }

  res.status(200).json({
    status: 'success',
    message: 'Evaluation submitted successfully.',
    data: { evaluation, result },
  });
});

// ─── GET PROGRESS ────────────────────────────────────────────────────────────
export const getProgress = asyncHandler(async (req, res, next) => {
  const { assessmentId } = req.params;
  const assessment = await Assessment.findById(assessmentId).lean();
  if (!assessment) return next(new AppError('Assessment not found.', 404));

  const total = assessment.questionIds.length;
  const answeredCount = await Response.countDocuments({
    assessmentId,
    userId: req.user.id,
    respondentType: 'self',
  });
  const submitted = await Response.findOne({
    assessmentId,
    userId: req.user.id,
    respondentType: 'self',
    submittedAt: { $ne: null },
  }).lean();

  res.status(200).json({
    status: 'success',
    data: {
      totalQuestions: total,
      answeredCount,
      percentage: total > 0 ? parseFloat(((answeredCount / total) * 100).toFixed(1)) : 0,
      isSubmitted: !!submitted,
    },
  });
});

// ─── GET SUPERVISOR EVALUATION (Draft or Submitted) ────────────────────────
export const getSupervisorEvaluation = asyncHandler(async (req, res, next) => {
  const { assessmentId, employeeId } = req.params;
  const evaluation = await Response.findOne({
    assessmentId,
    employeeId,
    respondentType: 'supervisor',
  }).lean();

  res.status(200).json({ status: 'success', data: { evaluation } });
});

/* ═══════════════════════════════════════════════════════════════════════════
   HR_ADMIN ACTIONS
   ═══════════════════════════════════════════════════════════════════════════ */

// ─── HR_ADMIN: GET ALL RESPONSES ─────────────────────────────────────────────
export const getAllResponses = asyncHandler(async (req, res, next) => {
  const responses = await Response.find({ assessmentId: req.params.assessmentId })
    .populate('userId', 'name email')
    .populate('employeeId', 'name email department')
    .populate('questionId', 'text type')
    .lean();
  res.status(200).json({ status: 'success', data: { responses } });
});

// ─── SAVE SUPERVISOR EVALUATION DRAFT ──────────────────────────────────────
export const saveSupervisorEvaluation = asyncHandler(async (req, res, next) => {
  const { assessmentId, employeeId, score, comments } = req.body;
  const supervisorId = req.user.id;

  const evaluation = await Response.findOneAndUpdate(
    { assessmentId, employeeId, userId: supervisorId, respondentType: 'supervisor' },
    {
      score: Number(score) || 0,
      comments: comments || '',
      isSupervisorEvaluation: true,
      submittedAt: null,
    },
    { new: true, upsert: true, runValidators: true }
  );

  res.status(200).json({
    status: 'success',
    message: 'Evaluation draft saved.',
    data: { evaluation },
  });
});

// ─── SET MANUAL SCORE (HR_ADMIN, ShortAnswer only) ───────────────────────────
export const setManualScore = asyncHandler(async (req, res, next) => {
  const { manualScore } = req.body;
  const response = await Response.findById(req.params.id).populate('questionId');

  if (!response) return next(new AppError('Response not found.', 404));
  if (response.questionId.type !== 'ShortAnswer') {
    return next(new AppError('Manual scoring is only for ShortAnswer questions.', 400));
  }

  response.manualScore = manualScore;
  response.score = manualScore;
  await response.save();

  res.status(200).json({ status: 'success', data: { response } });
});