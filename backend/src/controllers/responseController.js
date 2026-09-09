import logger from '../utils/logger.js';
/* controllers/responseController.js */
import prisma from '../config/prisma.js';
import AppError from '../utils/AppError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { scoreIndividual } from '../services/scoringService.js';
import { sendResultsEmail } from '../services/emailService.js';
import { notifyResultReady } from '../services/notificationService.js';
import { logActivity } from '../services/activityService.js';

const withAssessmentQuestions = (assessment) => ({
  ...assessment,
  questionIds: (assessment.assessmentQuestions || []).map(aq => aq.questionId),
});

/* ═══════════════════════════════════════════════════════════════════════════
   HELPERS
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Validate access permissions for assessments
 */
const validateAccess = async (assessmentId, userId, employeeId, respondentType) => {
  const assessment = await prisma.assessment.findUnique({
    where: { id: assessmentId },
    include: { assessmentQuestions: { select: { questionId: true } } },
  });
  if (!assessment) throw new AppError('Assessment not found.', 404);
  if (assessment.status !== 'ACTIVE') throw new AppError('Assessment is not active.', 400);

  if (respondentType === 'self' && userId !== employeeId) {
    throw new AppError('You can only submit self-assessments for yourself.', 403);
  }

  if (respondentType === 'supervisor') {
    const employee = await prisma.user.findUnique({ where: { id: employeeId } });
    if (!employee || employee.supervisorId !== userId) {
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

/* ═══════════════════════════════════════════════════════════════════════════
   EMPLOYEE ACTIONS
   ═══════════════════════════════════════════════════════════════════════════ */

// ─── AUTO-SAVE (Single Answer) ───────────────────────────────────────────────
export const saveAnswer = asyncHandler(async (req, res, next) => {
  const { assessmentId, questionId, selectedAnswer, employeeId } = req.body;
  const empId = employeeId || req.user.id;

  const assessment = await validateAccess(assessmentId, req.user.id, empId, 'self');

  const questionIds = (assessment.assessmentQuestions || []).map(aq => aq.questionId);
  if (!questionIds.some((q) => q === questionId)) {
    return next(new AppError('Question does not belong to this assessment.', 400));
  }

  const existing = await prisma.response.findFirst({
    where: { assessmentId, questionId, userId: req.user.id, employeeId: empId, respondentType: 'self' },
  });

  let response;
  if (existing) {
    response = await prisma.response.update({
      where: { id: existing.id },
      data: { selectedAnswer },
    });
  } else {
    response = await prisma.response.create({
      data: {
        assessmentId,
        questionId,
        userId: req.user.id,
        employeeId: empId,
        respondentType: 'self',
        selectedAnswer,
      },
    });
  }

  res.status(200).json({ status: 'success', data: { response: { ...response, _id: response.id } } });
});

// ─── SUBMIT FULL ASSESSMENT (Employee Side) ──────────────────────────────────
export const submitAssessment = asyncHandler(async (req, res, next) => {
  const { assessmentId, employeeId: empId } = req.body;
  const employeeId = empId || req.user.id;

  const assessment = await validateAccess(assessmentId, req.user.id, employeeId, 'self');

  // ─── Enforce max attempts ───────────────────────────────────────────────
  // attemptCount tracks submits; pre-feature submissions (submittedAt set but
  // attemptCount 0) count as one used attempt.
  const existingSec = await prisma.securityViolation.findUnique({
    where: { assessmentId_userId: { assessmentId, userId: employeeId } },
  });
  const attemptsUsed = Math.max(existingSec?.attemptCount || 0, existingSec?.submittedAt ? 1 : 0);
  if (assessment.maxAttempts != null && attemptsUsed >= assessment.maxAttempts) {
    return next(new AppError(`Maximum attempts reached (${assessment.maxAttempts}).`, 403));
  }

  // Mark all responses as submitted
  const now = new Date();
  await prisma.response.updateMany({
    where: { assessmentId, employeeId, respondentType: 'self' },
    data: { submittedAt: now },
  });

  // ─── Persist final security data ────────────────────────────────────────
  const { securityLog, totalViolations } = req.body;
  try {
    const secData = {
      securityLog: securityLog || null,
      submittedAt: now,
      attemptCount: Math.max(existingSec?.attemptCount || 0, existingSec?.submittedAt ? 1 : 0) + 1,
    };
    if (totalViolations != null) {
      secData.totalViolations = Math.max(existingSec?.totalViolations || 0, totalViolations);
      secData.isHighRisk = existingSec?.isHighRisk || totalViolations >= 5 || false;
    }
    if (existingSec) {
      await prisma.securityViolation.update({
        where: { id: existingSec.id },
        data: secData,
      });
    } else {
      await prisma.securityViolation.create({
        data: { assessmentId, userId: employeeId, ...secData },
      });
    }
  } catch (secErr) {
    logger.error({ event: 'security_log_fail', message: secErr.message });
  }

  // ─── TRIGGER AUTO-SCORING for SelfAssessment ───────────────────────────
  await logActivity({
    req,
    action: 'submitted',
    entity: 'Response',
    entityId: employeeId,
    description: `Assessment "${assessment.description || assessment.purpose}" submitted`,
    metadata: { assessmentId, employeeId, type: assessment.type, self: true },
  });

  if (assessment.type === 'SelfAssessment') {
    const result = await scoreIndividual(assessmentId, employeeId);

    // Notify Employee
    const employee = await prisma.user.findUnique({ where: { id: employeeId } });
    if (employee?.email) {
      sendResultsEmail(
        { name: employee.name, email: employee.email },
        [
          {
            competencyName: 'Competency',
            finalScore: result?.finalScore,
            level: result?.level,
            assessmentType: assessment.type,
          },
        ]
      ).catch((e) => console.error('Email failed:', e.message));
      notifyResultReady(
        employeeId,
        'Competency',
        result?.finalScore,
        result?.level,
        result?.id
      );
    }

    return res.status(200).json({
      status: 'success',
      message: 'Assessment submitted and scored.',
      data: {
        result: result && { ...result, _id: result.id },
        attempts: { used: attemptsUsed + 1, maxAttempts: assessment.maxAttempts ?? null },
      },
    });
  }

  res.status(200).json({
    status: 'success',
    message: 'Assessment submitted successfully.',
    data: { attempts: { used: attemptsUsed + 1, maxAttempts: assessment.maxAttempts ?? null } },
  });
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

  const FIELD_MAP = {
    TAB_SWITCH: 'tabSwitches',
    COPY_ATTEMPT: 'copyAttempts',
    RIGHT_CLICK: 'rightClickAttempts',
    FULLSCREEN_EXIT: 'fullscreenExits',
    DEVTOOLS: 'devToolsAttempts',
    WINDOW_BLUR: 'windowBlurs',
    PRINT_ATTEMPT: 'printAttempts',
  };
  const summaryField = FIELD_MAP[violationType] || null;

  const existing = await prisma.securityViolation.findUnique({
    where: { assessmentId_userId: { assessmentId, userId } },
  });

  const newEntry = { type: violationType, timestamp: new Date(), details: violationDetails };
  const totalViolations = (existing?.totalViolations || 0) + 1;
  const isHighRisk = existing?.isHighRisk || totalViolations >= 5;

  const data = {
    totalViolations,
    isHighRisk,
  };
  if (summaryField) data[summaryField] = (existing?.[summaryField] || 0) + 1;

  let doc;
  if (existing) {
    const violations = Array.isArray(existing.violations) ? existing.violations : [];
    doc = await prisma.securityViolation.update({
      where: { id: existing.id },
      data: { ...data, violations: [...violations, newEntry] },
    });
  } else {
    try {
      doc = await prisma.securityViolation.create({
        data: { assessmentId, userId, ...data, violations: [newEntry] },
      });
    } catch (err) {
      // Race: two violations recorded back-to-back before the first create
      // committed (P2002 on @@unique([assessmentId, userId])). Retry as an
      // update so the violation is never silently dropped.
      if (err?.code === 'P2002') {
        const raced = await prisma.securityViolation.findUnique({
          where: { assessmentId_userId: { assessmentId, userId } },
        });
        if (raced) {
          const violations = Array.isArray(raced.violations) ? raced.violations : [];
          doc = await prisma.securityViolation.update({
            where: { id: raced.id },
            data: {
              totalViolations: (raced.totalViolations || 0) + 1,
              isHighRisk: raced.isHighRisk || (raced.totalViolations || 0) + 1 >= 5,
              ...(summaryField ? { [summaryField]: (raced[summaryField] || 0) + 1 } : {}),
              violations: [...violations, newEntry],
            },
          });
        } else {
          throw err;
        }
      } else {
        throw err;
      }
    }
  }

  res.status(200).json({
    status: 'success',
    data: {
      totalViolations: doc.totalViolations,
      isHighRisk: doc.isHighRisk,
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
      const employee = await prisma.user.findUnique({ where: { id: userId } });
      if (!employee || employee.supervisorId !== requesterId) {
        return next(new AppError('Not authorised to view these security records.', 403));
      }
    } else {
      return next(new AppError('Not authorised to view these security records.', 403));
    }
  }

  const record = await prisma.securityViolation.findUnique({
    where: { assessmentId_userId: { assessmentId, userId } },
    include: { user: { select: { id: true, name: true, email: true } } },
  });

  res.status(200).json({
    status: 'success',
    data: {
      securityRecord: record
        ? {
            ...record,
            _id: record.id,
            userId: record.user,
            summary: {
              totalViolations: record.totalViolations,
              tabSwitches: record.tabSwitches,
              copyAttempts: record.copyAttempts,
              rightClickAttempts: record.rightClickAttempts,
              fullscreenExits: record.fullscreenExits,
              devToolsAttempts: record.devToolsAttempts,
              windowBlurs: record.windowBlurs,
              printAttempts: record.printAttempts,
              isHighRisk: record.isHighRisk,
            },
          }
        : {
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

  const records = await prisma.securityViolation.findMany({
    where: { assessmentId },
    include: { user: { select: { id: true, name: true, email: true, department: true } } },
    orderBy: { totalViolations: 'desc' },
  });

  const mapped = records.map((r) => ({
    ...r,
    _id: r.id,
    userId: r.user,
    summary: {
      totalViolations: r.totalViolations,
      tabSwitches: r.tabSwitches,
      copyAttempts: r.copyAttempts,
      rightClickAttempts: r.rightClickAttempts,
      fullscreenExits: r.fullscreenExits,
      devToolsAttempts: r.devToolsAttempts,
      windowBlurs: r.windowBlurs,
      printAttempts: r.printAttempts,
      isHighRisk: r.isHighRisk,
    },
  }));

  const aggregated = {
    totalRecords: mapped.length,
    highRiskCount: mapped.filter((r) => r.summary.isHighRisk).length,
    totalViolations: mapped.reduce((sum, r) => sum + (r.summary?.totalViolations || 0), 0),
    records: mapped,
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

  const assessment = await prisma.assessment.findUnique({ where: { id: assessmentId } });
  if (!assessment) return next(new AppError('Assessment not found', 404));

  const existing = await prisma.response.findFirst({
    where: { assessmentId, employeeId, userId: supervisorId, respondentType: 'supervisor' },
  });

  const evalData = {
    score: Number(score),
    comments: comments || '',
    isSupervisorEvaluation: true,
    submittedAt: new Date(),
  };

  const evaluation = existing
    ? await prisma.response.update({ where: { id: existing.id }, data: evalData })
    : await prisma.response.create({
        data: {
          assessmentId,
          employeeId,
          userId: supervisorId,
          respondentType: 'supervisor',
          ...evalData,
        },
      });

  let result = null;
  if (assessment.type === 'SupervisorOnly') {
    result = await scoreIndividual(assessmentId, employeeId);
    logger.info({ event: 'auto_score_supervisor_only', employeeId });
  }

  await logActivity({
    req,
    action: 'evaluation_submitted',
    entity: 'SupervisorEvaluation',
    entityId: evaluation.id,
    description: `Supervisor evaluation submitted for assessment "${assessment.description || assessment.purpose}"`,
    metadata: { assessmentId, employeeId, score: Number(score) },
  });

  res.status(200).json({
    status: 'success',
    message: 'Evaluation submitted successfully.',
    data: {
      evaluation: { ...evaluation, _id: evaluation.id },
      result: result && { ...result, _id: result.id },
    },
  });
});

// ─── GET PROGRESS ────────────────────────────────────────────────────────────
export const getProgress = asyncHandler(async (req, res, next) => {
  const { assessmentId } = req.params;
  const assessment = await prisma.assessment.findUnique({
    where: { id: assessmentId },
    include: { assessmentQuestions: { select: { questionId: true } } },
  });
  if (!assessment) return next(new AppError('Assessment not found.', 404));

  const total = assessment.assessmentQuestions.length;
  const answeredCount = await prisma.response.count({
    where: {
      assessmentId,
      userId: req.user.id,
      respondentType: 'self',
    },
  });
  const submittedResponse = await prisma.response.findFirst({
    where: {
      assessmentId,
      userId: req.user.id,
      respondentType: 'self',
      submittedAt: { not: null },
    },
    select: { id: true },
  });

  // A 0% submission (all questions unanswered + "Submit Anyway") leaves no
  // response row with a submittedAt, so also trust the persisted security log
  // (written on every submit) or an existing result as proof of completion.
  const securityRecord = await prisma.securityViolation.findFirst({
    where: {
      assessmentId,
      userId: req.user.id,
    },
    select: { id: true, attemptCount: true, submittedAt: true },
  });
  const resultExists = await prisma.result.findFirst({
    where: {
      assessmentId,
      userId: req.user.id,
    },
    select: { id: true },
  });

  const attemptsUsed = Math.max(
    securityRecord?.attemptCount || 0,
    securityRecord?.submittedAt ? 1 : 0,
  );
  const maxAttempts = assessment.maxAttempts ?? null;

  // A result left over from a previous attempt must not mark a fresh retake
  // (security record reset, attempts consumed) as submitted.
  const retakeInProgress = !!(
    securityRecord && !securityRecord.submittedAt && (securityRecord.attemptCount || 0) > 0
  );

  res.status(200).json({
    status: 'success',
    data: {
      totalQuestions: total,
      answeredCount,
      percentage: total > 0 ? parseFloat(((answeredCount / total) * 100).toFixed(1)) : 0,
      isSubmitted: !!(submittedResponse || securityRecord?.submittedAt || (resultExists && !retakeInProgress)),
      maxAttempts,
      attemptsUsed,
      attemptsRemaining: maxAttempts == null ? null : Math.max(maxAttempts - attemptsUsed, 0),
    },
  });
});

// ─── START NEW ATTEMPT (Retake) ─────────────────────────────────────────────
// Clears the employee's prior self answers and resets the per-attempt security
// record (keeping the consumed-attempt counter). The attempt itself is only
// consumed when the employee submits again.
export const startAttempt = asyncHandler(async (req, res, next) => {
  const { assessmentId } = req.body;
  if (!assessmentId) return next(new AppError('assessmentId is required.', 400));

  const assessment = await validateAccess(assessmentId, req.user.id, req.user.id, 'self');

  const sec = await prisma.securityViolation.findUnique({
    where: { assessmentId_userId: { assessmentId, userId: req.user.id } },
  });
  const attemptsUsed = Math.max(sec?.attemptCount || 0, sec?.submittedAt ? 1 : 0);
  if (assessment.maxAttempts != null && attemptsUsed >= assessment.maxAttempts) {
    return next(new AppError(`Maximum attempts reached (${assessment.maxAttempts}).`, 403));
  }

  await prisma.response.deleteMany({
    where: { assessmentId, userId: req.user.id, respondentType: 'self' },
  });

  if (sec) {
    await prisma.securityViolation.update({
      where: { id: sec.id },
      data: {
        violations: [],
        securityLog: null,
        totalViolations: 0,
        tabSwitches: 0,
        copyAttempts: 0,
        rightClickAttempts: 0,
        fullscreenExits: 0,
        devToolsAttempts: 0,
        windowBlurs: 0,
        printAttempts: 0,
        isHighRisk: false,
        submittedAt: null,
      },
    });
  }

  const maxAttempts = assessment.maxAttempts ?? null;
  res.status(200).json({
    status: 'success',
    message: 'New attempt started.',
    data: {
      maxAttempts,
      attemptsUsed,
      attemptsRemaining: maxAttempts == null ? null : Math.max(maxAttempts - attemptsUsed, 0),
    },
  });
});

// ─── GET SUPERVISOR EVALUATION (Draft or Submitted) ────────────────────────
export const getSupervisorEvaluation = asyncHandler(async (req, res, next) => {
  const { assessmentId, employeeId } = req.params;
  const evaluation = await prisma.response.findFirst({
    where: { assessmentId, employeeId, respondentType: 'supervisor' },
  });

  res.status(200).json({ status: 'success', data: { evaluation: evaluation && { ...evaluation, _id: evaluation.id } } });
});

/* ═══════════════════════════════════════════════════════════════════════════
   HR_ADMIN ACTIONS
   ═══════════════════════════════════════════════════════════════════════════ */

// ─── HR_ADMIN: GET ALL RESPONSES ─────────────────────────────────────────────
export const getAllResponses = asyncHandler(async (req, res, next) => {
  const responses = await prisma.response.findMany({
    where: { assessmentId: req.params.assessmentId },
    include: {
      user: { select: { id: true, name: true, email: true } },
      employee: { select: { id: true, name: true, email: true, department: true } },
      question: { select: { id: true, text: true, type: true } },
    },
  });

  res.status(200).json({
    status: 'success',
    data: {
      responses: responses.map((r) => ({
        ...r,
        _id: r.id,
        userId: r.user,
        employeeId: r.employee,
        questionId: r.question,
      })),
    },
  });
});

// ─── SAVE SUPERVISOR EVALUATION DRAFT ──────────────────────────────────────
export const saveSupervisorEvaluation = asyncHandler(async (req, res, next) => {
  const { assessmentId, employeeId, score, comments } = req.body;
  const supervisorId = req.user.id;

  const existing = await prisma.response.findFirst({
    where: { assessmentId, employeeId, userId: supervisorId, respondentType: 'supervisor' },
  });

  const evalData = {
    score: Number(score) || 0,
    comments: comments || '',
    isSupervisorEvaluation: true,
    submittedAt: null,
  };

  const evaluation = existing
    ? await prisma.response.update({ where: { id: existing.id }, data: evalData })
    : await prisma.response.create({
        data: {
          assessmentId,
          employeeId,
          userId: supervisorId,
          respondentType: 'supervisor',
          ...evalData,
        },
      });

  res.status(200).json({
    status: 'success',
    message: 'Evaluation draft saved.',
    data: { evaluation: { ...evaluation, _id: evaluation.id } },
  });
});

// ─── SET MANUAL SCORE (HR_ADMIN, ShortAnswer only) ───────────────────────────
export const setManualScore = asyncHandler(async (req, res, next) => {
  const { manualScore } = req.body;
  const response = await prisma.response.findUnique({
    where: { id: req.params.id },
    include: { question: true },
  });

  if (!response) return next(new AppError('Response not found.', 404));
  if (response.question?.type !== 'ShortAnswer') {
    return next(new AppError('Manual scoring is only for ShortAnswer questions.', 400));
  }

  const updated = await prisma.response.update({
    where: { id: response.id },
    data: { manualScore, score: manualScore },
    include: { question: true },
  });

  res.status(200).json({ status: 'success', data: { response: { ...updated, _id: updated.id } } });
});
