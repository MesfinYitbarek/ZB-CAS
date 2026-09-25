import logger from '../utils/logger.js';
/* controllers/responseController.js */
import prisma from '../config/prisma.js';
import AppError from '../utils/AppError.js';
import asyncHandler from '../utils/asyncHandler.js';
import {
  scoreIndividual,
  getActiveQuestionPool,
  getGrantBalance,
  consumeGrantedAttempt,
} from '../services/scoringService.js';
import { sendResultsEmail } from '../services/emailService.js';
import {
  notifyResultReady,
  notifySecurityAlert,
  notifyRetakeGranted,
} from '../services/notificationService.js';
import { logActivity } from '../services/activityService.js';

// ─── Security enforcement tuning ─────────────────────────────────────────────
// First offense auto-submits: a single tab-switch or fullscreen exit ends
// the attempt immediately.
const TAB_SWITCH_AUTO_SUBMIT_LIMIT = 1;
const FULLSCREEN_EXIT_AUTO_SUBMIT_LIMIT = 1;
const MAX_DEVICE_ENTRIES = 10;
const VELOCITY_GAP_MS = 3000;      // saves faster than this count as "rapid"
const VELOCITY_FLAG_COUNT = 10;    // consecutive rapid saves flag an anomaly
const MAX_ATTEMPT_ARCHIVES = 10;

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
    include: { assessmentQuestions: { select: { questionId: true, pool: true } } },
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

/**
 * Best-effort security audit entry — never throws, never blocks the request.
 */
const logSecurityEvent = (payload) => {
  logActivity({ entity: 'SecurityViolation', ...payload }).catch(() => {});
};

/**
 * Device tracking + answer-velocity anomaly detection.
 * Reads the existing SecurityViolation row (may be null) and returns a Prisma
 * data patch plus a list of newly detected anomaly events.
 */
const buildDevicePatch = (sec, req, { answerSave = false } = {}) => {
  const ip = req.ip || null;
  const ua = req.headers?.['user-agent'] || '';
  const patch = {};
  const prev = sec?.anomalies && typeof sec.anomalies === 'object' ? sec.anomalies : {};
  const anomalies = { ...prev };
  let anomaliesChanged = false;
  const events = [];

  const ips = Array.isArray(sec?.ipAddresses) ? [...sec.ipAddresses] : [];
  if (ip && !ips.includes(ip)) {
    if (ips.length > 0) {
      anomalies.ipChanged = true;
      anomalies.ipChangedAt = new Date().toISOString();
      anomaliesChanged = true;
      events.push('ipChanged');
    }
    ips.push(ip);
    patch.ipAddresses = ips.slice(-MAX_DEVICE_ENTRIES);
  }

  const uas = Array.isArray(sec?.userAgents) ? [...sec.userAgents] : [];
  if (ua && !uas.includes(ua)) {
    if (uas.length > 0) {
      anomalies.deviceChanged = true;
      anomalies.deviceChangedAt = new Date().toISOString();
      anomaliesChanged = true;
      events.push('deviceChanged');
    }
    uas.push(ua);
    patch.userAgents = uas.slice(-MAX_DEVICE_ENTRIES);
  }

  if (answerSave) {
    const now = Date.now();
    const lastAt = anomalies.lastAnswerAt ? new Date(anomalies.lastAnswerAt).getTime() : 0;
    if (lastAt && now - lastAt < VELOCITY_GAP_MS) {
      anomalies.rapidCount = (anomalies.rapidCount || 0) + 1;
      if (anomalies.rapidCount >= VELOCITY_FLAG_COUNT && !anomalies.answerVelocity) {
        anomalies.answerVelocity = true;
        anomalies.answerVelocityAt = new Date().toISOString();
        events.push('answerVelocity');
      }
    } else {
      anomalies.rapidCount = 0;
    }
    anomalies.lastAnswerAt = new Date().toISOString();
    if (ip) anomalies.lastAnswerIp = ip;
    anomaliesChanged = true;
  }

  if (anomaliesChanged) patch.anomalies = anomalies;
  return { patch, events };
};

/** Apply a device patch: update the row, or create a minimal baseline row. */
const persistDevicePatch = async (assessmentId, userId, sec, patch) => {
  if (!Object.keys(patch).length) return sec;
  if (sec) {
    return prisma.securityViolation.update({ where: { id: sec.id }, data: patch });
  }
  return prisma.securityViolation.create({ data: { assessmentId, userId, ...patch } });
};

/** Snapshot the current attempt into attemptArchives before any reset. */
const buildArchiveEntry = (sec) => ({
  archivedAt: new Date(),
  attempt: Math.max(sec?.attemptCount || 0, sec?.submittedAt ? 1 : 0),
  totalViolations: sec?.totalViolations || 0,
  counters: {
    tabSwitches: sec?.tabSwitches || 0,
    copyAttempts: sec?.copyAttempts || 0,
    pasteAttempts: sec?.pasteAttempts || 0,
    rightClickAttempts: sec?.rightClickAttempts || 0,
    fullscreenExits: sec?.fullscreenExits || 0,
    devToolsAttempts: sec?.devToolsAttempts || 0,
    windowBlurs: sec?.windowBlurs || 0,
    printAttempts: sec?.printAttempts || 0,
  },
  violations: Array.isArray(sec?.violations) ? sec.violations : [],
  securityLog: sec?.securityLog ?? null,
  ipAddresses: Array.isArray(sec?.ipAddresses) ? sec.ipAddresses : [],
  userAgents: Array.isArray(sec?.userAgents) ? sec.userAgents : [],
  anomalies: sec?.anomalies ?? null,
  autoSubmitted: !!sec?.autoSubmitted,
  isHighRisk: !!sec?.isHighRisk,
});

/** Per-attempt reset patch (keeps attemptCount + archives + device baseline). */
const attemptResetData = (sec) => ({
  violations: [],
  securityLog: null,
  totalViolations: 0,
  tabSwitches: 0,
  copyAttempts: 0,
  pasteAttempts: 0,
  rightClickAttempts: 0,
  fullscreenExits: 0,
  devToolsAttempts: 0,
  windowBlurs: 0,
  printAttempts: 0,
  isHighRisk: false,
  autoSubmitted: false,
  submittedAt: null,
  attemptArchives: [...(Array.isArray(sec?.attemptArchives) ? sec.attemptArchives : []), buildArchiveEntry(sec)].slice(-MAX_ATTEMPT_ARCHIVES),
});

/**
 * Attempts consumed incl. legacy rows; allowed = base maxAttempts + TOTAL
 * granted extras (null = unlimited). Consumed grants remain in the total so
 * stacking grants keeps working: used N of (base + all extras).
 */
const getAttemptUsage = async (assessment, employeeId) => {
  const sec = await prisma.securityViolation.findUnique({
    where: { assessmentId_userId: { assessmentId: assessment.id, userId: employeeId } },
  });
  const attemptsUsed = Math.max(sec?.attemptCount || 0, sec?.submittedAt ? 1 : 0);
  const grants = await getGrantBalance(assessment.id, employeeId);
  const grantedExtra = grants.total;
  const grantedRemaining = grants.remaining;
  const allowed = assessment.maxAttempts == null ? null : assessment.maxAttempts + grantedExtra;
  return { sec, attemptsUsed, grantedExtra, grantedRemaining, allowed };
};

/* ═══════════════════════════════════════════════════════════════════════════
   EMPLOYEE ACTIONS
   ═══════════════════════════════════════════════════════════════════════════ */

// ─── AUTO-SAVE (Single Answer) ───────────────────────────────────────────────
export const saveAnswer = asyncHandler(async (req, res, next) => {
  const { assessmentId, questionId, selectedAnswer, employeeId, securityLog } = req.body;
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

  // Persist the client's live violation snapshot + device/velocity tracking.
  // Best-effort: auto-save must never fail because of security bookkeeping.
  try {
    const sec = await prisma.securityViolation.findUnique({
      where: { assessmentId_userId: { assessmentId, userId: req.user.id } },
    });
    const { patch, events } = buildDevicePatch(sec, req, { answerSave: true });
    if (securityLog !== undefined) patch.securityLog = securityLog || null;
    await persistDevicePatch(assessmentId, req.user.id, sec, patch);
    for (const event of events) {
      logSecurityEvent({
        req,
        action: 'security_anomaly',
        entityId: assessmentId,
        description: `Anomaly detected during assessment (${event})`,
        metadata: { userId: req.user.id, assessmentId, event },
      });
    }
  } catch (secErr) {
    logger.error({ event: 'security_autosave_fail', message: secErr.message });
  }

  res.status(200).json({ status: 'success', data: { response: { ...response, _id: response.id } } });
});

// ─── SUBMIT FULL ASSESSMENT (Employee Side) ──────────────────────────────────
export const submitAssessment = asyncHandler(async (req, res, next) => {
  const { assessmentId, employeeId: empId, autoSubmit } = req.body;
  const employeeId = empId || req.user.id;

  const assessment = await validateAccess(assessmentId, req.user.id, employeeId, 'self');

  // ─── Enforce max attempts (incl. HR-granted extras) ─────────────────────
  // attemptCount tracks submits; pre-feature submissions (submittedAt set but
  // attemptCount 0) count as one used attempt.
  const { sec: existingSec, attemptsUsed, grantedExtra, grantedRemaining, allowed } = await getAttemptUsage(assessment, employeeId);
  if (allowed != null && attemptsUsed >= allowed) {
    return next(new AppError(
      `Maximum attempts reached (used ${attemptsUsed} of ${allowed} allowed` +
      `${grantedExtra > 0 ? `, including ${grantedExtra} HR-granted extra attempt(s)` : ', no HR retake grant found for this user'}.` +
      `${grantedRemaining === 0 ? ' Ask HR to grant a retake from the result page.' : ''}`,
      403
    ));
  }

  // Resolve the question pool BEFORE the attempt counter increments: the
  // first attempt scores MAIN, any later attempt scores REEXAM (when defined).
  const activePool = await getActiveQuestionPool(assessmentId, employeeId);

  // Mark all responses as submitted
  const now = new Date();
  await prisma.response.updateMany({
    where: { assessmentId, employeeId, respondentType: 'self' },
    data: { submittedAt: now },
  });

  // ─── Persist final security data ────────────────────────────────────────
  const { securityLog, totalViolations } = req.body;
  try {
    const device = buildDevicePatch(existingSec, req);
    const secData = {
      securityLog: securityLog || null,
      submittedAt: now,
      attemptCount: attemptsUsed + 1,
      ...device.patch,
    };
    if (autoSubmit === true) secData.autoSubmitted = true;
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
    for (const event of device.events) {
      logSecurityEvent({
        req,
        action: 'security_anomaly',
        entityId: assessmentId,
        description: `Anomaly detected on submit (${event})`,
        metadata: { userId: employeeId, assessmentId, event },
      });
    }
    if (autoSubmit === true) {
      logSecurityEvent({
        req,
        action: 'auto_submitted',
        entityId: assessmentId,
        description: `Assessment auto-submitted after repeated violations by "${employeeId}"`,
        metadata: { userId: employeeId, assessmentId, totalViolations: secData.totalViolations ?? totalViolations ?? null },
      });
    }
  } catch (secErr) {
    logger.error({ event: 'security_log_fail', message: secErr.message });
  }

  // Consume one HR-granted attempt when submitting beyond the base allowance.
  if (assessment.maxAttempts != null && attemptsUsed >= assessment.maxAttempts) {
    consumeGrantedAttempt(assessmentId, employeeId).catch(() => {});
  }

  // ─── TRIGGER AUTO-SCORING ───────────────────────────────────────────────
  // Every self submit scores immediately. Combined rows are stored as partial
  // until BOTH sides have submitted, then recalculated in place — the stored
  // row is always one combined calculation, never a single-side duplicate.
  const shouldScoreSelfSubmit = assessment.type !== 'SupervisorOnly';

  if (shouldScoreSelfSubmit) {
    const result = await scoreIndividual(assessmentId, employeeId, activePool);

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
      message: autoSubmit === true
        ? 'Assessment auto-submitted due to repeated violations.'
        : 'Assessment submitted and scored.',
      data: {
        result: result && { ...result, _id: result.id },
        attempts: { used: attemptsUsed + 1, maxAttempts: assessment.maxAttempts ?? null },
      },
    });
  }

  res.status(200).json({
    status: 'success',
    message: autoSubmit === true
      ? 'Assessment auto-submitted due to repeated violations.'
      : 'Assessment submitted successfully.',
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

  // Complete mapping of every event the useAssessmentSecurity hook emits.
  // Ungrouped recon/capture attempts share the closest counter so per-type
  // dashboards stay accurate; TIME_EXPIRED/FULLSCREEN_DENIED/UNKNOWN only
  // count toward the total.
  const FIELD_MAP = {
    TAB_SWITCH: 'tabSwitches',
    COPY_ATTEMPT: 'copyAttempts',
    CUT_ATTEMPT: 'copyAttempts',
    PASTE_ATTEMPT: 'pasteAttempts',
    RIGHT_CLICK: 'rightClickAttempts',
    FULLSCREEN_EXIT: 'fullscreenExits',
    DEVTOOLS: 'devToolsAttempts',
    DEVTOOLS_ATTEMPT: 'devToolsAttempts',
    VIEW_SOURCE_ATTEMPT: 'devToolsAttempts',
    SAVE_ATTEMPT: 'copyAttempts',
    WINDOW_BLUR: 'windowBlurs',
    PRINT_ATTEMPT: 'printAttempts',
    SCREENSHOT_ATTEMPT: 'printAttempts',
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

  // Device tracking (best-effort).
  try {
    const device = buildDevicePatch(doc, req);
    if (Object.keys(device.patch).length) {
      doc = await prisma.securityViolation.update({ where: { id: doc.id }, data: device.patch });
    }
    for (const event of device.events) {
      logSecurityEvent({
        req,
        action: 'security_anomaly',
        entityId: assessmentId,
        description: `Anomaly detected during assessment (${event})`,
        metadata: { userId, assessmentId, event },
      });
    }
  } catch (devErr) {
    logger.error({ event: 'security_device_fail', message: devErr.message });
  }

  // Audit the high-risk flip exactly once.
  if (!existing?.isHighRisk && doc.isHighRisk) {
    logSecurityEvent({
      req,
      action: 'high_risk_flagged',
      entityId: assessmentId,
      description: `User flagged high-risk (${doc.totalViolations} violations)`,
      metadata: { userId, assessmentId, totalViolations: doc.totalViolations },
    });
  }

  // Enforce auto-submit on the first tab-switch / fullscreen-exit offense.
  let autoSubmit = false;
  let autoSubmitReason = null;
  if ((doc.tabSwitches || 0) >= TAB_SWITCH_AUTO_SUBMIT_LIMIT) {
    autoSubmit = true;
    autoSubmitReason = 'Tab switching is not allowed during the assessment';
  } else if ((doc.fullscreenExits || 0) >= FULLSCREEN_EXIT_AUTO_SUBMIT_LIMIT) {
    autoSubmit = true;
    autoSubmitReason = 'Leaving fullscreen mode is not allowed during the assessment';
  }
  if (autoSubmit) {
    logSecurityEvent({
      req,
      action: 'auto_submit_triggered',
      entityId: assessmentId,
      description: `Auto-submit triggered: ${autoSubmitReason}`,
      metadata: { userId, assessmentId, reason: autoSubmitReason },
    });
    notifySecurityAlert(
      userId,
      'Assessment auto-submitted',
      `Your assessment was submitted automatically: ${autoSubmitReason}. Contact HR if you need a retake.`,
      assessmentId
    ).catch(() => {});
  }

  res.status(200).json({
    status: 'success',
    data: {
      totalViolations: doc.totalViolations,
      isHighRisk: doc.isHighRisk,
      tabSwitches: doc.tabSwitches,
      fullscreenExits: doc.fullscreenExits,
      autoSubmit,
      autoSubmitReason,
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

  const [record, retakeGrants] = await Promise.all([
    prisma.securityViolation.findUnique({
      where: { assessmentId_userId: { assessmentId, userId } },
      include: { user: { select: { id: true, name: true, email: true } } },
    }),
    prisma.retakeGrant.findMany({
      where: { assessmentId, userId },
      include: { granter: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
    }),
  ]);
  const grants = retakeGrants.map((g) => ({
    _id: g.id,
    extraAttempts: g.extraAttempts,
    usedAttempts: g.usedAttempts,
    remaining: Math.max((g.extraAttempts || 0) - (g.usedAttempts || 0), 0),
    reason: g.reason,
    grantedBy: g.granter,
    createdAt: g.createdAt,
  }));

  const emptySummary = {
    totalViolations: 0,
    tabSwitches: 0,
    copyAttempts: 0,
    pasteAttempts: 0,
    rightClickAttempts: 0,
    fullscreenExits: 0,
    devToolsAttempts: 0,
    windowBlurs: 0,
    printAttempts: 0,
    isHighRisk: false,
    autoSubmitted: false,
  };

  res.status(200).json({
    status: 'success',
    data: {
      securityRecord: record
        ? {
            ...record,
            _id: record.id,
            userId: record.user,
            retakeGrants: grants,
            summary: {
              totalViolations: record.totalViolations,
              tabSwitches: record.tabSwitches,
              copyAttempts: record.copyAttempts,
              pasteAttempts: record.pasteAttempts,
              rightClickAttempts: record.rightClickAttempts,
              fullscreenExits: record.fullscreenExits,
              devToolsAttempts: record.devToolsAttempts,
              windowBlurs: record.windowBlurs,
              printAttempts: record.printAttempts,
              isHighRisk: record.isHighRisk,
              autoSubmitted: record.autoSubmitted,
            },
          }
        : {
            summary: emptySummary,
            violations: [],
            attemptArchives: [],
            retakeGrants: grants,
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
      pasteAttempts: r.pasteAttempts,
      rightClickAttempts: r.rightClickAttempts,
      fullscreenExits: r.fullscreenExits,
      devToolsAttempts: r.devToolsAttempts,
      windowBlurs: r.windowBlurs,
      printAttempts: r.printAttempts,
      isHighRisk: r.isHighRisk,
      autoSubmitted: r.autoSubmitted,
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

  const assessment = await validateAccess(assessmentId, req.user.id, employeeId, 'supervisor');

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
  // Every supervisor submit scores immediately (partial until both sides
  // exist for Combined — recalculated in place on later submits).
  const shouldScoreSupervisorSubmit = true;

  if (shouldScoreSupervisorSubmit) {
    const activePool = await getActiveQuestionPool(assessmentId, employeeId);
    result = await scoreIndividual(assessmentId, employeeId, activePool);
    logger.info({ event: 'auto_score_supervisor_submit', assessmentId, employeeId, type: assessment.type });
  }

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
    include: { assessmentQuestions: { select: { questionId: true, pool: true } } },
  });
  if (!assessment) return next(new AppError('Assessment not found.', 404));

  // Pool-aware totals: retakes run on the REEXAM pool when one is defined.
  const activePool = await getActiveQuestionPool(assessmentId, req.user.id);
  const poolQuestionIds = (assessment.assessmentQuestions || [])
    .filter((j) => (j.pool || 'MAIN') === activePool)
    .map((j) => j.questionId);
  const hasReexamPool = (assessment.assessmentQuestions || []).some((j) => (j.pool || 'MAIN') === 'REEXAM');

  const total = poolQuestionIds.length;
  const answeredCount = await prisma.response.count({
    where: {
      assessmentId,
      userId: req.user.id,
      respondentType: 'self',
      questionId: { in: poolQuestionIds },
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
      status: 'FINAL',
    },
    select: { id: true },
  });

  const attemptsUsed = Math.max(
    securityRecord?.attemptCount || 0,
    securityRecord?.submittedAt ? 1 : 0,
  );
  const maxAttempts = assessment.maxAttempts ?? null;
  const grantBalance = await getGrantBalance(assessmentId, req.user.id);
  const grantedExtra = grantBalance.total;
  const allowed = maxAttempts == null ? null : maxAttempts + grantedExtra;

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
      attemptsRemaining: allowed == null ? null : Math.max(allowed - attemptsUsed, 0),
      grantedExtra,
      activePool,
      hasReexamPool,
    },
  });
});

// ─── START NEW ATTEMPT (Retake) ─────────────────────────────────────────────
// Clears the employee's prior self answers and resets the per-attempt security
// record (keeping the consumed-attempt counter). The prior attempt's violation
// history is frozen into attemptArchives first — retakes never erase evidence.
// The attempt itself is only consumed when the employee submits again.
export const startAttempt = asyncHandler(async (req, res, next) => {
  const { assessmentId } = req.body;
  if (!assessmentId) return next(new AppError('assessmentId is required.', 400));

  const assessment = await validateAccess(assessmentId, req.user.id, req.user.id, 'self');

  const { sec, attemptsUsed, grantedExtra, grantedRemaining, allowed } = await getAttemptUsage(assessment, req.user.id);
  if (allowed != null && attemptsUsed >= allowed) {
    return next(new AppError(
      `Maximum attempts reached (used ${attemptsUsed} of ${allowed} allowed` +
      `${grantedExtra > 0 ? `, including ${grantedExtra} HR-granted extra attempt(s)` : ', no HR retake grant found for you'}.` +
      `${grantedRemaining === 0 ? ' Ask HR to grant a retake from your result page.' : ''}`,
      403
    ));
  }

  await prisma.response.deleteMany({
    where: { assessmentId, userId: req.user.id, respondentType: 'self' },
  });

  if (sec) {
    await prisma.securityViolation.update({
      where: { id: sec.id },
      data: attemptResetData(sec),
    });
    logSecurityEvent({
      req,
      action: 'attempt_archived',
      entityId: assessmentId,
      description: `Prior attempt violations archived for retake`,
      metadata: { userId: req.user.id, assessmentId, archivedAttempt: Math.max(sec.attemptCount || 0, sec.submittedAt ? 1 : 0) },
    });
  }

  const maxAttempts = assessment.maxAttempts ?? null;
  res.status(200).json({
    status: 'success',
    message: 'New attempt started.',
    data: {
      maxAttempts,
      attemptsUsed,
      attemptsRemaining: allowed == null ? null : Math.max(allowed - attemptsUsed, 0),
    },
  });
});

// ─── HR_ADMIN: GRANT RETAKE ──────────────────────────────────────────────────
// Gives one user extra consumable attempts (via RetakeGrant) and immediately
// resets their in-flight attempt state (archiving violations, clearing answers)
// so they can start fresh — typically on the REEXAM question pool.
export const grantRetake = asyncHandler(async (req, res, next) => {
  const { assessmentId, userId, reason = '', extraAttempts = 1 } = req.body;
  if (!assessmentId) return next(new AppError('assessmentId is required.', 400));
  if (!userId) return next(new AppError('userId is required.', 400));

  const assessment = await prisma.assessment.findUnique({ where: { id: assessmentId } });
  if (!assessment) return next(new AppError('Assessment not found.', 404));
  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target) return next(new AppError('User not found.', 404));

  const extra = Math.min(Math.max(parseInt(extraAttempts, 10) || 1, 1), 10);

  const grant = await prisma.retakeGrant.create({
    data: {
      assessmentId,
      userId,
      grantedBy: req.user.id,
      reason: String(reason || ''),
      extraAttempts: extra,
    },
  });

  // Reset the in-flight attempt so the user can start fresh right away.
  await prisma.response.deleteMany({
    where: { assessmentId, userId, respondentType: 'self' },
  });
  const sec = await prisma.securityViolation.findUnique({
    where: { assessmentId_userId: { assessmentId, userId } },
  });
  if (sec) {
    await prisma.securityViolation.update({
      where: { id: sec.id },
      data: attemptResetData(sec),
    });
  }

  await logActivity({
    req,
    action: 'retake_granted',
    entity: 'Assessment',
    entityId: assessmentId,
    description: `Retake granted to "${target.name}" for "${assessment.description || assessment.purpose}"`,
    metadata: { userId, assessmentId, extraAttempts: extra, reason: String(reason || '') },
  });

  notifyRetakeGranted(userId, assessment.description, assessmentId).catch(() => {});

  const { allowed } = await getAttemptUsage(assessment, userId);
  res.status(201).json({
    status: 'success',
    message: `Retake granted to ${target.name}.`,
    data: { grant: { ...grant, _id: grant.id }, attemptsAllowed: allowed },
  });
});

// ─── GET SUPERVISOR EVALUATION (Draft or Submitted) ────────────────────────
export const getSupervisorEvaluation = asyncHandler(async (req, res, next) => {
  const { assessmentId, employeeId } = req.params;

  const employee = await prisma.user.findUnique({
    where: { id: employeeId },
    select: { id: true, supervisorId: true },
  });
  if (!employee || employee.supervisorId !== req.user.id) {
    return next(new AppError('You can only view evaluations for your direct reports.', 403));
  }

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

  await validateAccess(assessmentId, req.user.id, employeeId, 'supervisor');

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
