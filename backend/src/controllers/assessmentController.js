/* controllers/assessmentController.js
 * SECURITY FIXES:
 *  A03 – escapeRegex applied to all regex search fields
 *  A09 – All console.log replaced with structured logger
 */
import prisma from '../config/prisma.js';
import AppError from '../utils/AppError.js';
import asyncHandler from '../utils/asyncHandler.js';
import logger from '../utils/logger.js';
import {
  sendAssessmentNotification,
  sendSupervisorReminder,
  sendAssessmentReminderEmail,
} from '../services/emailService.js';
import {
  notifyAssessmentAssigned,
  notifySupervisorReminder,
  notifyDeadlineReminder,
} from '../services/notificationService.js';
import { scheduleAssessmentTimers, clearAssessmentTimers } from '../services/schedulerService.js';
import { autoScoreOnCompletion } from '../services/scoringService.js';
import { logActivity } from '../services/activityService.js';
import { normalizeTargetGroup, denormalizeTargetGroup } from '../utils/targetGroup.js';

// ─── AUTO-ACTIVATE HELPER ────────────────────────────────────────────────────
// Exported so schedulerService can call it on a cron schedule
export const autoActivateScheduledAssessments = async () => {
  const now = new Date();
  const result = await prisma.assessment.updateMany({
    where: { status: 'SCHEDULED', startDate: { lte: now } },
    data: { status: 'ACTIVE' },
  });
  return result.count || 0;
};

// ─── AUTO-COMPLETE HELPER ────────────────────────────────────────────────────
// Exported so schedulerService can call it on a cron schedule
export const autoCompleteExpiredAssessments = async () => {
  const now = new Date();
  const expired = await prisma.assessment.findMany({
    where: { status: 'ACTIVE', endDate: { lte: now } },
    select: { id: true, type: true },
  });
  const result = await prisma.assessment.updateMany({
    where: { id: { in: expired.map(a => a.id) }, status: 'ACTIVE', endDate: { lte: now } },
    data: { status: 'COMPLETED' },
  });

  // Update pending supervisor evaluations to prevent them from showing in 'pending' queues
  await prisma.supervisorEvaluation.updateMany({
    where: { assessmentId: { in: expired.map(a => a.id) }, status: 'PENDING' },
    data: { status: 'COMPLETED' },
  });

  // Combined assessments are scored the moment they complete (self + supervisor)
  expired
    .filter(a => a.type === 'Combined')
    .forEach(a => void autoScoreOnCompletion(a.id));

  return result.count || 0;
};

// ─── SELECT include (competency + creator + target audience) ─────────────────
const assessmentInclude = {
  competency: { select: { id: true, name: true, category: true, targetGroups: true } },
  creator: { select: { id: true, name: true, email: true } },
  audienceDepartments: { select: { department: true } },
  audienceEmployees: { select: { employeeId: true, employee: { select: { id: true, name: true, email: true, department: true, position: true } } } },
  assessmentQuestions: { select: { order: true, pool: true, question: true } },
  supervisorEvaluations: { select: { id: true, employeeId: true, supervisorId: true, status: true, completedAt: true } },
};

const ANSWER_KEYS = ['correctAnswer', 'correctAnswers', 'matchingPairs', 'correctOrder', 'categories'];

// Strip answer-key material from a Question row unless the caller is HR_ADMIN.
const withSafeQuestion = (question, isAdmin) => {
  if (!question) return question;
  if (isAdmin) return question;
  const safe = { ...question };
  for (const key of ANSWER_KEYS) delete safe[key];
  return safe;
};

const toLegacy = (a, isAdmin = false) => ({
  _id:             a.id,
  id:              a.id,
  competencyId:    a.competency || a.competencyId,
  targetGroup:     denormalizeTargetGroup(a.targetGroup),
  purpose:         a.purpose,
  description:     a.description,
  reminderMinutesBefore: a.reminderMinutesBefore,
  reminderSent:    a.reminderSent,
  targetAudience: {
    type:         a.audienceType,
    departments:  a.audienceDepartments.map(d => d.department),
    employeeIds:  isAdmin
      ? a.audienceEmployees.map(e => e.employee)
      : a.audienceEmployees.map(e => ({ _id: e.employeeId, id: e.employeeId })),
  },
  target: {
    department: a.legacyDepartment,
    position:   a.legacyPosition,
  },
  questionIds: a.assessmentQuestions
    ? a.assessmentQuestions
        .filter(q => (q.pool || 'MAIN') === 'MAIN')
        .map(q => ({ ...withSafeQuestion(q.question, isAdmin), _id: q.question.id, targetGroup: denormalizeTargetGroup(q.question.targetGroup) }))
    : [],
  // Second question set served to retaking users (attempt ≥ 2). Empty = retakes reuse MAIN.
  reexamQuestionIds: a.assessmentQuestions
    ? a.assessmentQuestions
        .filter(q => (q.pool || 'MAIN') === 'REEXAM')
        .map(q => ({ ...withSafeQuestion(q.question, isAdmin), _id: q.question.id, targetGroup: denormalizeTargetGroup(q.question.targetGroup) }))
    : [],
  startDate:     a.startDate,
  endDate:       a.endDate,
  timeLimit:     a.timeLimit,
  maxAttempts:   a.maxAttempts ?? null,
  type:          a.type,
  weight: {
    selfAssessment: a.selfWeight,
    supervisor:     a.supervisorWeight,
  },
  status:              a.status,
  createdBy:           a.creator || a.createdById,
  createdAt:           a.createdAt,
  updatedAt:           a.updatedAt,
  supervisorEvaluations: a.supervisorEvaluations.map(e => ({
    _id:          e.id,
    employeeId:   e.employeeId,
    supervisorId: e.supervisorId,
    status:       e.status,
    completedAt:  e.completedAt,
  })),
});

// ─── RESOLVE EMPLOYEES HELPER ────────────────────────────────────────────────
const resolveEmployees = async (assessment) => {
  const base = { status: 'ACTIVE' };
  const taType = assessment.audienceType;

  if (taType === 'ALL_DEPARTMENTS') {
    return prisma.user.findMany({ where: base });
  }
  if (taType === 'DEPARTMENT_ALL' && assessment.audienceDepartments?.length) {
    return prisma.user.findMany({
      where: { ...base, department: { in: assessment.audienceDepartments.map(d => d.department) } },
    });
  }
  if (taType === 'SPECIFIC_EMPLOYEES' && assessment.audienceEmployees?.length) {
    return prisma.user.findMany({
      where: { ...base, id: { in: assessment.audienceEmployees.map(e => e.employeeId) } },
    });
  }

  const filter = { ...base };
  if (assessment.legacyDepartment) filter.department = assessment.legacyDepartment;
  if (assessment.legacyPosition)   filter.position   = assessment.legacyPosition;
  return prisma.user.findMany({ where: filter });
};

// ─── VALIDATE TARGET AUDIENCE ────────────────────────────────────────────────
const validateTargetAudience = (targetAudience, next) => {
  if (!targetAudience || !targetAudience.type) return true;
  if (targetAudience.type === 'DEPARTMENT_ALL' && (!targetAudience.departments || targetAudience.departments.length === 0)) {
    next(new AppError('Please select at least one department for DEPARTMENT_ALL target audience.', 400));
    return false;
  }
  if (targetAudience.type === 'SPECIFIC_EMPLOYEES' && (!targetAudience.employeeIds || targetAudience.employeeIds.length === 0)) {
    next(new AppError('Please select at least one employee for SPECIFIC_EMPLOYEES target audience.', 400));
    return false;
  }
  return true;
};

const deriveLegacyTarget = (targetAudience) => {
  if (!targetAudience) return { department: null, position: null };
  if (targetAudience.type === 'DEPARTMENT_ALL' && targetAudience.departments?.length)
    return { department: targetAudience.departments[0], position: null };
  return { department: null, position: null };
};

// ─── CREATE ──────────────────────────────────────────────────────────────────
export const createAssessment = asyncHandler(async (req, res, next) => {
  const { competencyId, targetGroup, purpose, description, targetAudience, reminderMinutesBefore, questionIds, reexamQuestionIds, startDate, endDate, timeLimit, type, weight, maxAttempts: rawMaxAttempts } = req.body;

  if (!targetGroup) return next(new AppError('Target group is required.', 400));
  if (!purpose)     return next(new AppError('Purpose is required.', 400));
  if (!validateTargetAudience(targetAudience, next)) return;

  // A question cannot live in both pools (junction is unique per question).
  const mainIds = questionIds || [];
  const reexamIds = reexamQuestionIds || [];
  if (reexamIds.some((id) => mainIds.includes(id))) {
    return next(new AppError('A question cannot be in both the main and re-exam pools.', 400));
  }

  const normalizedTG = normalizeTargetGroup(targetGroup);

  const maxAttempts = rawMaxAttempts === undefined || rawMaxAttempts === null || rawMaxAttempts === ''
    ? null
    : parseInt(rawMaxAttempts, 10);
  if (maxAttempts !== null && (!Number.isInteger(maxAttempts) || maxAttempts < 1)) {
    return next(new AppError('maxAttempts must be a positive integer or empty for unlimited.', 400));
  }

  const reminderMinutes = reminderMinutesBefore ? Number(reminderMinutesBefore) : null;
  if (reminderMinutes !== null && (!Number.isInteger(reminderMinutes) || reminderMinutes < 1 || reminderMinutes > 43200)) {
    return next(new AppError('Reminder lead time must be between 1 minute and 30 days (43200 minutes).', 400));
  }

  const legacyTarget = deriveLegacyTarget(targetAudience);
  const ta = targetAudience || { type: 'ALL_DEPARTMENTS', departments: [], employeeIds: [] };

  const assessment = await prisma.assessment.create({
    data: {
      competencyId,
      targetGroup: normalizedTG,
      purpose,
      description,
      legacyDepartment: legacyTarget.department,
      legacyPosition:   legacyTarget.position,
      reminderMinutesBefore: reminderMinutes,
      audienceType:     ta.type || 'ALL_DEPARTMENTS',
      targetAudience:  { create: { type: ta.type || 'ALL_DEPARTMENTS' } },
      audienceDepartments: { create: (ta.departments || []).map(d => ({ department: d })) },
      audienceEmployees:   { create: (ta.employeeIds || []).map(id => ({ employeeId: id })) },
      assessmentQuestions: {
        create: [
          ...(questionIds || []).map((qid, idx) => ({ questionId: qid, order: idx, pool: 'MAIN' })),
          ...(reexamQuestionIds || []).map((qid, idx) => ({ questionId: qid, order: idx, pool: 'REEXAM' })),
        ],
      },
      startDate: new Date(startDate),
      endDate:   new Date(endDate),
      timeLimit: timeLimit || null,
      maxAttempts,
      type,
      selfWeight: type === 'Combined'
        ? (weight?.selfAssessment || 20)
        : 0,
      supervisorWeight: type === 'Combined'
        ? (weight?.supervisor || 80)
        : 0,
      status: 'DRAFT',
      createdBy: req.user.id,
    },
    include: assessmentInclude,
  });

  await logActivity({
    req,
    action: 'created',
    entity: 'Assessment',
    entityId: assessment.id,
    description: `Assessment "${assessment.description || assessment.purpose}" created`,
    metadata: { type: assessment.type, targetGroup: assessment.targetGroup, status: assessment.status },
  });

  res.status(201).json({ status: 'success', data: { assessment: toLegacy(assessment, req.user.role === 'HR_ADMIN') } });
});

// ─── LIST ─────────────────────────────────────────────────────────────────────
// Whitelisted server-side sorting (`competency` sorts by related name)
const ASSESSMENT_SORTABLE_FIELDS = new Set(['status', 'type', 'startDate', 'endDate', 'createdAt', 'updatedAt']);

function resolveAssessmentOrderBy(sortBy, sortDir, fallbackDir = 'desc') {
  const order = sortDir === 'asc' ? 'asc' : sortDir === 'desc' ? 'desc' : fallbackDir;
  if (sortBy === 'competency') return { competency: { name: order } };
  return { [ASSESSMENT_SORTABLE_FIELDS.has(sortBy) ? sortBy : 'startDate']: order };
}

export const getAssessments = asyncHandler(async (req, res) => {
  await autoActivateScheduledAssessments();
  await autoCompleteExpiredAssessments();

  const { status, competencyId, page = 1, limit = 6, sortBy, sortDir } = req.query;

  const where = {};
  if (status)       where.status       = status;
  if (competencyId) where.competencyId = competencyId;

  if (req.user.role !== 'HR_ADMIN') {
    const me = await prisma.user.findUnique({ where: { id: req.user.id } });
    where.OR = [
      { audienceType: 'ALL_DEPARTMENTS' },
      { audienceDepartments: { some: { department: me.department } } },
      { audienceEmployees: { some: { employeeId: me.id } } },
      { legacyDepartment: me.department, legacyPosition: { not: null } },
      { legacyDepartment: null, legacyPosition: null },
    ];
  }

  const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);

  const [assessments, total] = await Promise.all([
    prisma.assessment.findMany({
      where,
      include: assessmentInclude,
      skip,
      take: parseInt(limit, 10),
      orderBy: resolveAssessmentOrderBy(sortBy, sortDir, 'desc'),
    }),
    prisma.assessment.count({ where }),
  ]);

  res.status(200).json({
    status: 'success',
    data: {
      assessments: assessments.map(a => toLegacy(a, req.user.role === 'HR_ADMIN')),
      pagination: { total, page: parseInt(page, 10), limit: parseInt(limit, 10) },
    },
  });
});

// ─── GET ONE ─────────────────────────────────────────────────────────────────
export const getAssessment = asyncHandler(async (req, res, next) => {
  await autoActivateScheduledAssessments();
  await autoCompleteExpiredAssessments();

  let assessment = await prisma.assessment.findUnique({
    where: { id: req.params.id },
    include: assessmentInclude,
  });
  if (!assessment) return next(new AppError('Assessment not found.', 404));

  if (assessment.status === 'SCHEDULED' && new Date(assessment.startDate) <= new Date()) {
    assessment = await prisma.assessment.update({
      where: { id: assessment.id },
      data: { status: 'ACTIVE' },
      include: assessmentInclude,
    });
  }

  res.status(200).json({ status: 'success', data: { assessment: toLegacy(assessment, req.user.role === 'HR_ADMIN') } });
});

// ─── UPDATE (DRAFT only) ─────────────────────────────────────────────────────
export const updateAssessment = asyncHandler(async (req, res, next) => {
  const assessment = await prisma.assessment.findUnique({
    where: { id: req.params.id },
    include: assessmentInclude,
  });
  if (!assessment) return next(new AppError('Assessment not found.', 404));

  if (assessment.status !== 'DRAFT') {
    return next(new AppError('Only DRAFT assessments can be updated.', 400));
  }

  if (req.body.targetAudience && !validateTargetAudience(req.body.targetAudience, next)) return;

  const data = {};
  ['description', 'startDate', 'endDate', 'timeLimit', 'purpose'].forEach((f) => {
    if (req.body[f] !== undefined) {
      data[f] = req.body[f] instanceof Date ? req.body[f] : req.body[f];
    }
  });

  if (req.body.targetGroup !== undefined) {
    data.targetGroup = normalizeTargetGroup(req.body.targetGroup);
  }

  if (req.body.maxAttempts !== undefined) {
    const n = req.body.maxAttempts === null || req.body.maxAttempts === ''
      ? null
      : parseInt(req.body.maxAttempts, 10);
    if (n !== null && (!Number.isInteger(n) || n < 1)) {
      return next(new AppError('maxAttempts must be a positive integer or empty for unlimited.', 400));
    }
    data.maxAttempts = n;
  }

  if (req.body.startDate !== undefined) data.startDate = new Date(req.body.startDate);
  if (req.body.endDate !== undefined)   data.endDate   = new Date(req.body.endDate);

  if (req.body.type !== undefined) {
    data.type = req.body.type;
    const weight = req.body.weight || {};
    if (req.body.type === 'Combined') {
      data.selfWeight = weight.selfAssessment || 20;
      data.supervisorWeight = weight.supervisor || 80;
    } else {
      data.selfWeight = weight.selfAssessment || 0;
      data.supervisorWeight = weight.supervisor || 0;
    }
  }

  if (req.body.targetAudience) {
    const legacyTarget = deriveLegacyTarget(req.body.targetAudience);
    data.legacyDepartment = legacyTarget.department;
    data.legacyPosition   = legacyTarget.position;
  }

  if (req.body.reminderMinutesBefore !== undefined) {
    const mins = req.body.reminderMinutesBefore ? Number(req.body.reminderMinutesBefore) : null;
    if (mins !== null && (!Number.isInteger(mins) || mins < 1 || mins > 43200)) {
      return next(new AppError('Reminder lead time must be between 1 minute and 30 days (43200 minutes).', 400));
    }
    data.reminderMinutesBefore = mins;
    data.reminderSent = false;
  }

  const tx = [];
  if (Object.keys(data).length > 0) {
    tx.push(prisma.assessment.update({ where: { id: assessment.id }, data }));
  }

  // Replace MAIN-pool questionIds (REEXAM pool untouched unless provided)
  if (req.body.questionIds !== undefined) {
    tx.push(prisma.assessmentQuestion.deleteMany({ where: { assessmentId: assessment.id, pool: 'MAIN' } }));
    tx.push(prisma.assessmentQuestion.createMany({
      data: (req.body.questionIds || []).map((qid, idx) => ({ assessmentId: assessment.id, questionId: qid, order: idx, pool: 'MAIN' })),
    }));
  }

  // Replace REEXAM-pool questions (retake set). Must not overlap MAIN.
  if (req.body.reexamQuestionIds !== undefined) {
    const mainIds = req.body.questionIds !== undefined
      ? (req.body.questionIds || [])
      : (await prisma.assessmentQuestion.findMany({
          where: { assessmentId: assessment.id, pool: 'MAIN' },
          select: { questionId: true },
        })).map((j) => j.questionId);
    if ((req.body.reexamQuestionIds || []).some((id) => mainIds.includes(id))) {
      return next(new AppError('A question cannot be in both the main and re-exam pools.', 400));
    }
    tx.push(prisma.assessmentQuestion.deleteMany({ where: { assessmentId: assessment.id, pool: 'REEXAM' } }));
    tx.push(prisma.assessmentQuestion.createMany({
      data: (req.body.reexamQuestionIds || []).map((qid, idx) => ({ assessmentId: assessment.id, questionId: qid, order: idx, pool: 'REEXAM' })),
    }));
  }

  // Replace target audience (depts + employees)
  if (req.body.targetAudience) {
    const ta = req.body.targetAudience;
    tx.push(prisma.assessmentTargetAudienceDepartment.deleteMany({ where: { assessmentId: assessment.id } }));
    tx.push(prisma.assessmentTargetAudienceEmployee.deleteMany({ where: { assessmentId: assessment.id } }));
    const createDept = { data: (ta.departments || []).map(d => ({ assessmentId: assessment.id, department: d })) };
    tx.push(prisma.assessmentTargetAudienceDepartment.createMany(createDept));
    const createEmp = { data: (ta.employeeIds || []).map(id => ({ assessmentId: assessment.id, employeeId: id })) };
    tx.push(prisma.assessmentTargetAudienceEmployee.createMany(createEmp));
    tx.push(prisma.assessTargetAudience.upsert({
      where: { assessmentId: assessment.id },
      create: { assessmentId: assessment.id, type: ta.type || 'ALL_DEPARTMENTS' },
      update: { type: ta.type || 'ALL_DEPARTMENTS' },
    }));
  }

  if (tx.length > 0) await prisma.$transaction(tx);

  const updated = await prisma.assessment.findUnique({
    where: { id: assessment.id },
    include: assessmentInclude,
  });

  await logActivity({
    req,
    action: 'updated',
    entity: 'Assessment',
    entityId: updated.id,
    description: `Assessment "${updated.description || updated.purpose}" updated`,
  });

  res.status(200).json({ status: 'success', data: { assessment: toLegacy(updated, req.user.role === 'HR_ADMIN') } });
});

// ─── TRANSITION STATUS ────────────────────────────────────────────────────────
export const updateStatus = asyncHandler(async (req, res, next) => {
  const { status } = req.body;
  const assessment = await prisma.assessment.findUnique({
    where: { id: req.params.id },
    include: assessmentInclude,
  });
  if (!assessment) return next(new AppError('Assessment not found.', 404));

  const transitions = { DRAFT: ['SCHEDULED'], ACTIVE: ['COMPLETED'] };
  const allowed = transitions[assessment.status] || [];
  if (!allowed.includes(status)) {
    return next(new AppError(`Cannot transition from ${assessment.status} to ${status}.`, 400));
  }

  let newStatus = status;

  if (status === 'SCHEDULED' && (assessment.type === 'Combined' || assessment.type === 'SupervisorOnly')) {
    const employees = await resolveEmployees(assessment);
    // Rebuild supervisor evaluations
    const evals = employees
      .filter(emp => emp.supervisorId)
      .map(emp => ({ assessmentId: assessment.id, employeeId: emp.id, supervisorId: emp.supervisorId }));
    await prisma.supervisorEvaluation.deleteMany({ where: { assessmentId: assessment.id } });
    if (evals.length > 0) {
      await prisma.supervisorEvaluation.createMany({ data: evals });
    }
  }

  const saved = await prisma.assessment.update({
    where: { id: assessment.id },
    data: { status: newStatus },
    include: assessmentInclude,
  });

  // Arm / cancel real-time timers
  if (newStatus === 'SCHEDULED') {
    scheduleAssessmentTimers(saved);
  } else {
    clearAssessmentTimers(assessment.id);
  }

  // Combined assessments are scored automatically on completion
  if (newStatus === 'COMPLETED' && saved.type === 'Combined') {
    void autoScoreOnCompletion(saved.id);
  }

  if (newStatus === 'SCHEDULED') {
    const employees = await resolveEmployees(saved);
    employees.forEach((emp) => {
      sendAssessmentNotification(emp, saved);
      notifyAssessmentAssigned(emp.id, saved.description, saved.id);
    });

    if (saved.type === 'Combined' || saved.type === 'SupervisorOnly') {
      const supervisorIds = [...new Set(employees.map((e) => e.supervisorId).filter(Boolean))];
      const supervisors = await prisma.user.findMany({ where: { id: { in: supervisorIds } } });
      supervisors.forEach((sup) => {
        const supEmployees = employees.filter((e) => e.supervisorId === sup.id);
        supEmployees.forEach((emp) => {
          sendSupervisorReminder(sup, emp.name, saved);
          notifySupervisorReminder(sup.id, emp.name, saved.description, saved.id);
        });
      });
    }
  }

  await logActivity({
    req,
    action: 'status_changed',
    entity: 'Assessment',
    entityId: saved.id,
    description: `Assessment "${saved.description || saved.purpose}" ${assessment.status} → ${newStatus}`,
    metadata: { from: assessment.status, to: newStatus },
  });

  res.status(200).json({ status: 'success', data: { assessment: toLegacy(saved, req.user.role === 'HR_ADMIN') } });
});

// ─── EXTEND DEADLINE (ACTIVE & SCHEDULED) ─────────────────────────────────────
export const extendDeadline = asyncHandler(async (req, res, next) => {
  const assessment = await prisma.assessment.findUnique({
    where: { id: req.params.id },
    include: assessmentInclude,
  });
  if (!assessment) return next(new AppError('Assessment not found.', 404));

  if (!['ACTIVE', 'SCHEDULED'].includes(assessment.status)) {
    return next(new AppError('Only ACTIVE or SCHEDULED assessments can have their dates extended.', 400));
  }

  const { endDate, startDate } = req.body;
  if (!endDate) return next(new AppError('A new end date is required.', 400));
  const newEnd = new Date(endDate);
  if (isNaN(newEnd.getTime())) return next(new AppError('Invalid end date.', 400));

  const isScheduled = assessment.status === 'SCHEDULED';
  let newStart = assessment.startDate;

  if (isScheduled && startDate) {
    const parsedStart = new Date(startDate);
    if (isNaN(parsedStart.getTime())) return next(new AppError('Invalid start date.', 400));
    if (parsedStart <= new Date()) return next(new AppError('The start date must be in the future.', 400));
    if (newEnd <= parsedStart) return next(new AppError('The end date must be after the start date.', 400));
    newStart = parsedStart;
  } else if (isScheduled) {
    if (newEnd <= new Date(assessment.startDate)) {
      return next(new AppError('The end date must be after the assessment start date.', 400));
    }
  } else {
    if (newEnd <= new Date()) return next(new AppError('The new deadline must be in the future.', 400));
    if (newEnd <= new Date(assessment.startDate)) {
      return next(new AppError('The new deadline must be after the assessment start date.', 400));
    }
  }

  const data = { endDate: newEnd };
  if (isScheduled && startDate) data.startDate = newStart;

  const updated = await prisma.assessment.update({
    where: { id: assessment.id },
    data,
    include: assessmentInclude,
  });

  clearAssessmentTimers(assessment.id);
  scheduleAssessmentTimers(updated);

  await logActivity({
    req,
    action: 'deadline_extended',
    entity: 'Assessment',
    entityId: updated.id,
    description: isScheduled
      ? `Timeline for "${updated.description || updated.purpose}" extended: ${newStart.toISOString()} to ${newEnd.toISOString()}`
      : `Deadline for "${updated.description || updated.purpose}" extended to ${newEnd.toISOString()}`,
    metadata: { from: assessment.endDate, to: newEnd, ...(isScheduled && startDate ? { startFrom: assessment.startDate, startTo: newStart } : {}) },
  });

  res.status(200).json({ status: 'success', data: { assessment: toLegacy(updated, req.user.role === 'HR_ADMIN') } });
});

// ─── GET ACTIVE ASSESSMENTS FOR CURRENT USER ─────────────────────────────────
export const getActiveAssessments = asyncHandler(async (req, res) => {
  await autoActivateScheduledAssessments();
  await autoCompleteExpiredAssessments();

  const { sortBy, sortDir } = req.query;

  const me = await prisma.user.findUnique({ where: { id: req.user.id } });
  if (!me) return res.status(404).json({ status: 'fail', message: 'User not found' });

  logger.debug({ event: 'active_assessments_query', userId: me.id, department: me.department });

  const where = {
    status: { in: ['SCHEDULED', 'ACTIVE'] },
    OR: [
      { audienceType: 'ALL_DEPARTMENTS' },
      { audienceDepartments: { some: { department: me.department } } },
      { audienceEmployees: { some: { employeeId: me.id } } },
    ],
  };

  const assessments = await prisma.assessment.findMany({
    where,
    include: assessmentInclude,
    orderBy: resolveAssessmentOrderBy(sortBy, sortDir, 'asc'),
  });

  logger.debug({ event: 'active_assessments_found', count: assessments.length, userId: me.id });

  res.status(200).json({ status: 'success', results: assessments.length, data: { assessments: assessments.map(a => toLegacy(a, req.user.role === 'HR_ADMIN')) } });
});

// ─── DUPLICATE / CLONE ────────────────────────────────────────────────────────
export const duplicateAssessment = asyncHandler(async (req, res, next) => {
  const { startDate, endDate } = req.body;

  if (!startDate || !endDate)
    return next(new AppError('New startDate and endDate are required.', 400));
  if (new Date(endDate) <= new Date(startDate))
    return next(new AppError('End date must be after start date.', 400));

  const source = await prisma.assessment.findUnique({
    where: { id: req.params.id },
    include: assessmentInclude,
  });
  if (!source) return next(new AppError('Assessment not found.', 404));

  // assessmentInclude selects { order, question } for assessmentQuestions —
  // the questionId scalar is NOT fetched, so resolve it from the included
  // question relation. Skip dangling rows and de-dupe: the junction has
  // @@unique([assessmentId, questionId]) and either would fail the clone.
  const questionLinks = [];
  const seenQuestionIds = new Set();
  for (const q of source.assessmentQuestions) {
    const questionId = q.question?.id ?? q.questionId;
    if (!questionId || seenQuestionIds.has(questionId)) continue;
    seenQuestionIds.add(questionId);
    questionLinks.push({ questionId, order: q.order ?? 0, pool: q.pool || 'MAIN' });
  }

  const clone = await prisma.assessment.create({
    data: {
      competencyId:       source.competencyId,
      targetGroup:        source.targetGroup,
      purpose:            source.purpose,
      description:        source.description ? `${source.description} (copy)` : '',
      legacyDepartment:   source.legacyDepartment,
      legacyPosition:     source.legacyPosition,
      reminderMinutesBefore: source.reminderMinutesBefore,
      reminderSent:       false,
      audienceType:        source.audienceType,
      targetAudience:      { create: { type: source.audienceType } },
      audienceDepartments: { create: source.audienceDepartments.map(d => ({ department: d.department })) },
      audienceEmployees:   { create: source.audienceEmployees.map(e => ({ employeeId: e.employeeId })) },
      assessmentQuestions: { create: questionLinks },
      timeLimit:       source.timeLimit,
      type:            source.type,
      selfWeight:      source.selfWeight,
      supervisorWeight: source.supervisorWeight,
      startDate:       new Date(startDate),
      endDate:         new Date(endDate),
      status:          'DRAFT',
      createdBy:       req.user.id,
    },
    include: assessmentInclude,
  });

  logger.info({ event: 'assessment_duplicated', sourceId: source.id, cloneId: clone.id, by: req.user.id });

  await logActivity({
    req,
    action: 'duplicated',
    entity: 'Assessment',
    entityId: clone.id,
    description: `Assessment "${clone.description || clone.purpose}" duplicated`,
    metadata: { sourceId: source.id },
  });

  res.status(201).json({ status: 'success', data: { assessment: toLegacy(clone, req.user.role === 'HR_ADMIN') } });
});

// ─── DELETE ───────────────────────────────────────────────────────────────────
export const deleteAssessments = asyncHandler(async (req, res, next) => {
  const assessment = await prisma.assessment.findUnique({ where: { id: req.params.id } });
  if (!assessment) return next(new AppError('Assessment not found.', 404));
  clearAssessmentTimers(req.params.id);
  await prisma.assessment.delete({ where: { id: req.params.id } });

  await logActivity({
    req,
    action: 'deleted',
    entity: 'Assessment',
    entityId: req.params.id,
    description: `Assessment "${assessment.description || assessment.purpose}" deleted`,
    metadata: { status: assessment.status, type: assessment.type },
  });

  res.status(200).json({ status: 'success', message: 'Assessment deleted.' });
});

// ─── SEARCH EMPLOYEES ─────────────────────────────────────────────────────────
export const searchEmployees = asyncHandler(async (req, res) => {
  const { name, department, position } = req.query;
  const where = { status: 'ACTIVE' };
  if (name)       where.name       = { contains: name, mode: 'insensitive' };
  if (department) where.department = department;
  if (position)   where.position   = { contains: position, mode: 'insensitive' };

  const employees = await prisma.user.findMany({
    where,
    select: { id: true, name: true, email: true, department: true, position: true, employeeId: true },
    take: 50,
  });

  res.status(200).json({ status: 'success', data: { employees: employees.map(e => ({ ...e, _id: e.id })) } });
});

// ─── GET ALL DEPARTMENTS ──────────────────────────────────────────────────────
export const getDepartments = asyncHandler(async (req, res) => {
  const result = await prisma.user.findMany({
    where: { status: 'ACTIVE', department: { not: null } },
    select: { department: true },
    distinct: ['department'],
  });
  const departments = result.map(r => r.department).filter(Boolean).sort();
  res.status(200).json({ status: 'success', data: { departments } });
});

// ─── PROCESS REMINDERS (called by scheduler AND HTTP endpoint) ──────────────
// Lead time is stored in minutes so reminders can be set in minutes, hours,
// or days. Runs every 30 minutes (see schedulerService) for sub-day precision.
export const formatReminderLead = (msLeft) => {
  const mins = Math.max(1, Math.ceil(msLeft / 60000));
  if (mins < 60) return `${mins} minute${mins !== 1 ? 's' : ''}`;
  const hours = Math.floor(mins / 60);
  if (hours < 48) return `${hours} hour${hours !== 1 ? 's' : ''}`;
  const days = Math.ceil(mins / 1440);
  return `${days} day${days !== 1 ? 's' : ''}`;
};

export const processPendingReminders = async () => {
  const now = new Date();
  const assessments = await prisma.assessment.findMany({
    where: { status: 'ACTIVE', reminderMinutesBefore: { not: null }, reminderSent: false },
    include: assessmentInclude,
  });
  let processedCount = 0;

  for (const assessment of assessments) {
    const msLeft = new Date(assessment.endDate) - now;
    if (msLeft <= 0) continue; // expired — completion flow owns it now
    if (msLeft <= assessment.reminderMinutesBefore * 60000) {
      const leadLabel = formatReminderLead(msLeft);
      const employees = await resolveEmployees(assessment);
      employees.forEach(emp => {
        sendAssessmentReminderEmail(emp, assessment, leadLabel);
        notifyDeadlineReminder(emp.id, assessment.description, leadLabel, assessment.id);
      });
      await prisma.assessment.update({ where: { id: assessment.id }, data: { reminderSent: true } });
      processedCount++;
    }
  }
  return processedCount;
};

export const sendReminderEmails = asyncHandler(async (req, res) => {
  const processedCount = await processPendingReminders();
  res.status(200).json({ status: 'success', message: `Reminders processed for ${processedCount} assessment(s).` });
});

// ─── SEND SUPERVISOR EVAL REMINDER (HR_ADMIN) ────────────────────────────────
export const sendSupervisorEvalReminder = asyncHandler(async (req, res, next) => {
  const assessment = await prisma.assessment.findUnique({
    where: { id: req.params.id },
    include: { competency: { select: { id: true, name: true } }, supervisorEvaluations: true },
  });
  if (!assessment) return next(new AppError('Assessment not found.', 404));

  const { supervisorId } = req.body;
  if (!supervisorId) return next(new AppError('supervisorId is required.', 400));

  const supervisor = await prisma.user.findUnique({ where: { id: supervisorId } });
  if (!supervisor) return next(new AppError('Supervisor not found.', 404));

  // Which employees is this supervisor evaluating in this assessment?
  const evalEntries = (assessment.supervisorEvaluations || []).filter(
    e => e.supervisorId === supervisorId && e.status === 'PENDING'
  );
  if (!evalEntries.length) {
    return res.status(200).json({ status: 'success', message: 'No pending evaluations for this supervisor.' });
  }

  const employeeIds = evalEntries.map(e => e.employeeId);
  const employees = await prisma.user.findMany({ where: { id: { in: employeeIds } }, select: { name: true } });
  const empNames = employees.map(e => e.name).join(', ');

  const assessmentDescription = assessment.description || assessment.competency?.name || 'Assessment';

  // Email
  sendSupervisorReminder(supervisor, empNames, {
    description: assessmentDescription,
    endDate: assessment.endDate,
  });

  // In-app notification
  notifySupervisorReminder(
    supervisorId,
    empNames,
    assessmentDescription,
    assessment.id
  );

  logger.info({ event: 'supervisor_eval_reminder_sent', assessmentId: assessment.id, supervisorId, sentBy: req.user.id });

  res.status(200).json({
    status: 'success',
    message: `Reminder sent to ${supervisor.name}.`,
  });
});
