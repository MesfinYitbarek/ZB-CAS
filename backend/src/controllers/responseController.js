import Assessment from '../models/Assessment.js';
import Question from '../models/Question.js';
import Response from '../models/Response.js';
import User from '../models/User.js';
import AppError from '../utils/AppError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { scoreIndividual } from '../services/scoringService.js';
import { sendResultsEmail } from '../services/emailService.js';

/**
 * Helper: Validate access permissions for assessments
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

// ─── AUTO-SAVE (Single Answer) ───────────────────────────────────────────────
export const saveAnswer = asyncHandler(async (req, res, next) => {
  const { assessmentId, questionId, selectedAnswer, employeeId } = req.body;
  const empId = employeeId || req.user.id;

  const assessment = await validateAccess(assessmentId, req.user.id, empId, 'self');

  if (!assessment.questionIds.some(q => q.toString() === questionId)) {
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
  const responseCount = await Response.countDocuments({ assessmentId, employeeId, respondentType: 'self' });
  if (responseCount < assessment.questionIds.length) {
    return next(new AppError('Please answer all questions before submitting.', 400));
  }

  // Mark all responses as submitted
  const now = new Date();
  await Response.updateMany(
    { assessmentId, employeeId, respondentType: 'self' },
    { $set: { submittedAt: now } }
  );

  // TRIGGER AUTO-SCORING for SelfAssessment
  if (assessment.type === 'SelfAssessment') {
    const result = await scoreIndividual(assessmentId, employeeId);
    
    // Notify Employee
    const employee = await User.findById(employeeId).lean();
    if (employee?.email) {
      sendResultsEmail({ name: employee.name, email: employee.email }, [{
        competencyName: assessment.competencyId?.name || 'Competency',
        finalScore: result.finalScore,
        level: result.level,
        assessmentType: assessment.type
      }]).catch(e => console.error('Email failed:', e.message));
    }

    return res.status(200).json({
      status: 'success',
      message: 'Assessment submitted and scored.',
      data: { result }
    });
  }

  res.status(200).json({ status: 'success', message: 'Assessment submitted successfully.' });
});

// ─── SUBMIT SUPERVISOR EVALUATION ────────────────────────────────────────────
export const submitSupervisorEvaluation = asyncHandler(async (req, res, next) => {
  const { assessmentId, employeeId, score, comments } = req.body;
  const supervisorId = req.user.id;

  const assessment = await Assessment.findById(assessmentId);
  if (!assessment) return next(new AppError('Assessment not found', 404));

  // 1. Finalize the Response
  const evaluation = await Response.findOneAndUpdate(
    { assessmentId, employeeId, userId: supervisorId, respondentType: 'supervisor' },
    { 
      score: Number(score), 
      comments: comments || '', 
      isSupervisorEvaluation: true, 
      submittedAt: new Date() 
    },
    { new: true, upsert: true }
  );

  // 2. Trigger Scoring Logic
  // If it's SupervisorOnly, we calculate the final result immediately.
  // If it's Combined, we just wait for HR to click "Score Results".
  let result = null;
  if (assessment.type === 'SupervisorOnly') {
    result = await scoreIndividual(assessmentId, employeeId);
    console.log(`[AUTO-SCORE] SupervisorOnly Assessment finalized for ${employeeId}`);
  }

  res.status(200).json({ 
    status: 'success', 
    message: 'Evaluation submitted successfully.', 
    data: { evaluation, result } 
  });
});

// ─── GET PROGRESS ────────────────────────────────────────────────────────────
export const getProgress = asyncHandler(async (req, res, next) => {
  const { assessmentId } = req.params;
  const assessment = await Assessment.findById(assessmentId).lean();
  if (!assessment) return next(new AppError('Assessment not found.', 404));

  const total = assessment.questionIds.length;
  const answeredCount = await Response.countDocuments({ assessmentId, userId: req.user.id, respondentType: 'self' });
  const submitted = await Response.findOne({ 
    assessmentId, 
    userId: req.user.id, 
    respondentType: 'self', 
    submittedAt: { $ne: null } 
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
    respondentType: 'supervisor' 
  }).lean();

  res.status(200).json({ status: 'success', data: { evaluation } });
});

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

  // Logic: Just upsert the response without setting submittedAt
  const evaluation = await Response.findOneAndUpdate(
    { assessmentId, employeeId, userId: supervisorId, respondentType: 'supervisor' },
    { 
      score: Number(score) || 0, 
      comments: comments || '', 
      isSupervisorEvaluation: true,
      submittedAt: null // Ensure it remains a draft
    },
    { new: true, upsert: true, runValidators: true }
  );

  res.status(200).json({ status: 'success', message: 'Evaluation draft saved.', data: { evaluation } });
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
  response.score = manualScore; // In ShortAnswer, score = manualScore
  await response.save();

  res.status(200).json({ status: 'success', data: { response } });
});