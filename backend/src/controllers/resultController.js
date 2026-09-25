/* controllers/resultController.js
 * SECURITY FIXES:
 *  A01 – getResult: Added ownership/role check
 *  A01 – getPDP: Added ownership check
 *  A01 – autoScoreEmployee: now validates ownership
 */
import prisma from '../config/prisma.js';
import asyncHandler from '../utils/asyncHandler.js';
import AppError from '../utils/AppError.js';
import { scoreFullAssessment, scoreIndividual } from '../services/scoringService.js';
import { sendResultsEmail } from '../services/emailService.js';
import { notifyResultReady } from '../services/notificationService.js';
import { normalizeTargetGroup, denormalizeTargetGroup } from '../utils/targetGroup.js';
import logger from '../utils/logger.js';

// ─── OWNERSHIP HELPER ─────────────────────────────────────────────────────────
async function canActForUser(requester, targetUserId) {
  if (requester.role === 'HR_ADMIN') return true;
  if (requester.id === targetUserId) return true;
  if (requester.role === 'SUPERVISOR') {
    const target = await prisma.user.findUnique({ where: { id: targetUserId }, select: { supervisorId: true } });
    return target?.supervisorId === requester.id;
  }
  return false;
}

const resultInclude = (excludeDetails = false) => ({
  user: { select: { id: true, name: true, email: true, department: true, position: true, employeeId: true, gender: true } },
  competency: { select: { id: true, name: true, category: true, targetGroups: true } },
});

// Helper to map a result row to the legacy shape used by the frontend
const processResultRow = (r) => ({
  _id: r.id,
  id: r.id,
  competencyId: r.competency || r.competencyId,
  competencyName: r.competency?.name || 'N/A',
  competencyCategory: r.competency?.category || 'N/A',
  assessmentId: r.assessment ? { _id: r.assessment.id, description: r.assessment.description, type: r.assessment.type } : null,
  assessmentDescription: r.assessment?.description || 'N/A',
  assessmentType: r.assessment?.type || 'N/A',
  userId: r.user ? { ...r.user, _id: r.user.id } : r.userId,
  userName: r.user?.name || 'N/A',
  userEmail: r.user?.email || 'N/A',
  userDepartment: r.user?.department || 'N/A',
  userPosition: r.user?.position || 'N/A',
  userGender: r.user?.gender || 'N/A',
  employeeId: r.user?.employeeId || r.user?.id || 'N/A',
  selfScore: r.scoreDetails?.selfScore ?? null,
  supervisorScore: r.scoreDetails?.supervisorScore ?? null,
  finalScore: r.finalScore,
  level: r.level,
  recommendation: r.recommendation,
  status: r.status || 'FINAL',
  notTaken: r.status === 'PENDING' || !!r.scoreDetails?.notTaken,
  partial: !!r.scoreDetails?.partial,
  missingSide: r.scoreDetails?.missingSide || null,
  weightUsed: r.scoreDetails?.weightUsed || null,
  calculation: r.scoreDetails?.calculation || null,
  hasQuestionDetails: !!(r.scoreDetails?.questionDetails?.length > 0 || r.scoreDetails),
  date: r.createdAt,
  formattedDate: new Date(r.createdAt).toLocaleDateString(),
  hasBoth: r.scoreDetails?.selfScore !== null && r.scoreDetails?.supervisorScore !== null,
  isCombined: r.assessment?.type === 'Combined',
  targetGroup: denormalizeTargetGroup(r.assessment?.targetGroup) || 'N/A',
  purpose: r.assessment?.purpose || 'N/A',
});

const getSubordinateIds = async (supervisorId) => {
  const subs = await prisma.user.findMany({ where: { supervisorId }, select: { id: true } });
  return subs.map(s => s.id);
};

// ─── ADMIN SCORE ──────────────────────────────────────────────────────────────
export const scoreAssessment = asyncHandler(async (req, res, next) => {
  const { results, skipped } = await scoreFullAssessment(req.params.assessmentId);

  results.forEach(async (r) => {
    const employee = await prisma.user.findUnique({ where: { id: r.userId } });
    if (employee?.email) {
      sendResultsEmail({ name: employee.name, email: employee.email }, [{
        competencyName: 'Competency',
        finalScore: r.finalScore,
        level: r.level,
        assessmentType: 'Combined'
      }]).catch(e => logger.error({ event: 'email_fail', message: e.message }));
      notifyResultReady(r.userId, 'Competency', r.finalScore, r.level, r.id);
    }
  });

  res.status(200).json({
    status: 'success',
    message: `Processed ${results.length} results.`,
    data: { results, skipped },
  });
});

// ─── AUTO-SCORE ───────────────────────────────────────────────────────────────
export const autoScoreEmployee = asyncHandler(async (req, res, next) => {
  const { assessmentId, employeeId } = req.body;

  if (!assessmentId || !employeeId) {
    return next(new AppError('assessmentId and employeeId are required.', 400));
  }

  const allowed = await canActForUser(req.user, employeeId);
  if (!allowed) {
    return next(new AppError('You are not authorised to trigger scoring for this employee.', 403));
  }

  const assessment = await prisma.assessment.findUnique({ where: { id: assessmentId } });
  if (!assessment) return next(new AppError('Assessment not found.', 404));

  const result = await scoreIndividual(assessmentId, employeeId);
  logger.info({ event: 'auto_score', assessmentId, employeeId, triggeredBy: req.user.id });

  res.status(200).json({ status: 'success', data: { result: result && { ...result, _id: result.id } } });
});

// ─── GET AVAILABLE ASSESSMENTS ────────────────────────────────────────────────
export const getAvailableAssessments = asyncHandler(async (req, res) => {
  let assessmentIds = [];

  if (req.user.role === 'EMPLOYEE') {
    assessmentIds = (await prisma.result.findMany({ where: { userId: req.user.id, status: 'FINAL' }, select: { assessmentId: true }, distinct: ['assessmentId'] })).map(r => r.assessmentId);
  }

  if (req.user.role === 'SUPERVISOR') {
    const subordinateIds = await getSubordinateIds(req.user.id);
    assessmentIds = (await prisma.result.findMany({ where: { userId: { in: subordinateIds }, status: 'FINAL' }, select: { assessmentId: true }, distinct: ['assessmentId'] })).map(r => r.assessmentId);
  }

  const assessments = await prisma.assessment.findMany({
    where: { id: { in: assessmentIds } },
    select: { id: true, description: true, type: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
  });

  res.status(200).json({
    status: 'success',
    data: { assessments: assessments.map(a => ({ _id: a.id, id: a.id, title: a.description, description: a.description, type: a.type, createdAt: a.createdAt })) },
  });
});

// ─── GET RESULT QUESTION DETAILS ─────────────────────────────────────────────
export const getResultQuestionDetails = asyncHandler(async (req, res, next) => {
  const { id } = req.params;

  const result = await prisma.result.findUnique({ where: { id } });
  if (!result) return next(new AppError('Result not found.', 404));

  if (req.user.role === 'EMPLOYEE' && result.userId !== req.user.id) {
    return next(new AppError('Not authorized to view this result.', 403));
  }

  if (req.user.role === 'SUPERVISOR') {
    const subordinateIds = await getSubordinateIds(req.user.id);
    if (!subordinateIds.includes(result.userId)) {
      return next(new AppError('Not authorized to view this result.', 403));
    }
  }

  const questionDetails = result.scoreDetails?.questionDetails || [];
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

  res.status(200).json({ status: 'success', data: { questionDetails, summary } });
});

// ─── GET RESULTS BY ASSESSMENT ────────────────────────────────────────────────
export const getResultsByAssessment = asyncHandler(async (req, res, next) => {
  const { assessmentId } = req.params;
  const { page = 1, limit = 20 } = req.query;

  if (!assessmentId) return next(new AppError('Assessment ID is required', 400));

  let where = { assessmentId };

  if (req.user.role === 'EMPLOYEE') where.userId = req.user.id;
  if (req.user.role === 'SUPERVISOR') {
    where.userId = { in: await getSubordinateIds(req.user.id) };
  }

  const skip = (parseInt(page) - 1) * parseInt(limit);

  const [results, total, assessment] = await Promise.all([
    prisma.result.findMany({
      where,
      include: {
        user: { select: { id: true, name: true, email: true, department: true, position: true, employeeId: true } },
        competency: { select: { id: true, name: true, category: true } },
        assessment: { select: { id: true, description: true, type: true, selfWeight: true, supervisorWeight: true, targetGroup: true, purpose: true } },
      },
      skip,
      take: parseInt(limit),
      orderBy: { createdAt: 'desc' },
    }),
    prisma.result.count({ where }),
    prisma.assessment.findUnique({ where: { id: assessmentId }, select: { id: true, description: true, type: true } }),
  ]);

  const isAdmin = req.user.role === 'HR_ADMIN' || req.user.role === 'ADMIN';
  const processedResults = results.map(r => processResultRow(r));

  const grouped = isAdmin ? processedResults : processResults(results);

  res.status(200).json({
    status: 'success',
    data: {
      results: grouped,
      assessment: assessment && { _id: assessment.id, title: assessment.description, description: assessment.description, type: assessment.type },
      pagination: { total, page: parseInt(page), limit: parseInt(limit), totalPages: Math.ceil(total / parseInt(limit)) }
    }
  });
});

// ─── HELPER: group results for non-admin ─────────────────────────────────────
const processResults = (results) => {
  const grouped = results.reduce((acc, result) => {
    const competencyId = result.competencyId;
    const assessmentId = result.assessmentId;
    if (!competencyId || !assessmentId) return acc;
    const key = `${competencyId}-${assessmentId}`;
    if (!acc[key]) {
      acc[key] = processResultRow(result);
    }
    return acc;
  }, {});
  return Object.values(grouped);
};

// ─── GET RESULTS (paginated list) ─────────────────────────────────────────────
export const getResults = asyncHandler(async (req, res, next) => {
  const { competencyId, assessmentId, status, page = 1, limit = 20 } = req.query;
  const requestedUserId = req.params.userId || req.query.userId;
  const where = {};

  // GET /user/:userId — honour the path param and enforce who can view whom
  if (requestedUserId) {
    if (req.user.role === 'EMPLOYEE' && requestedUserId !== req.user.id) {
      return next(new AppError('Not authorized to view these results.', 403));
    }
    if (req.user.role === 'SUPERVISOR') {
      const subs = await getSubordinateIds(req.user.id);
      if (!subs.includes(requestedUserId)) {
        return next(new AppError('Not authorized to view these results.', 403));
      }
    }
    where.userId = requestedUserId;
  } else if (req.user.role === 'EMPLOYEE') {
    where.userId = req.user.id;
  } else if (req.user.role === 'SUPERVISOR') {
    where.userId = { in: await getSubordinateIds(req.user.id) };
  }

  if (competencyId) where.competencyId = competencyId;
  if (assessmentId) where.assessmentId = assessmentId;
  if (status) where.status = status;

  const skip = (parseInt(page) - 1) * parseInt(limit);
  const [results, total] = await Promise.all([
    prisma.result.findMany({
      where,
      include: {
        user: { select: { id: true, name: true, email: true, department: true, position: true } },
        competency: { select: { id: true, name: true, category: true } },
        assessment: { select: { id: true, description: true, type: true, targetGroup: true, purpose: true } },
      },
      skip,
      take: parseInt(limit),
      orderBy: { createdAt: 'desc' },
    }),
    prisma.result.count({ where })
  ]);

  res.status(200).json({
    status: 'success',
    data: { results: processResults(results), pagination: { total, page: parseInt(page), limit: parseInt(limit) } }
  });
});

// ─── GET SINGLE RESULT ────────────────────────────────────────────────────────
export const getResult = asyncHandler(async (req, res, next) => {
  const result = await prisma.result.findUnique({
    where: { id: req.params.id },
    include: {
      user: { select: { id: true, name: true, email: true, department: true, position: true } },
      competency: { select: { id: true, name: true, category: true } },
      assessment: { select: { id: true, description: true, type: true, targetGroup: true, purpose: true, selfWeight: true, supervisorWeight: true } },
    },
  });

  if (!result) return next(new AppError('Result not found.', 404));

  if (req.user.role === 'EMPLOYEE' && result.user?.id !== req.user.id) {
    return next(new AppError('Not authorized to view this result.', 403));
  }

  if (req.user.role === 'SUPERVISOR') {
    const subordinateIds = await getSubordinateIds(req.user.id);
    if (!subordinateIds.includes(result.user?.id)) {
      return next(new AppError('Not authorized to view this result.', 403));
    }
  }

  // Supervisor evaluation (score + comments) for this result, if any
  const supervisorEval = await prisma.response.findFirst({
    where: {
      assessmentId: result.assessmentId,
      employeeId: result.userId,
      respondentType: 'supervisor',
    },
    include: { user: { select: { id: true, name: true } } },
  });

  res.status(200).json({
    status: 'success',
    data: {
      result: processResultRow(result),
      supervisorEvaluation: supervisorEval ? {
        score: supervisorEval.score,
        comments: supervisorEval.comments || '',
        submittedAt: supervisorEval.submittedAt,
        supervisorName: supervisorEval.user?.name || null,
      } : null,
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

// ─── FINALISE RESULT ──────────────────────────────────────────────────────────
export const finaliseResult = asyncHandler(async (req, res, next) => {
  const result = await prisma.result.findUnique({ where: { id: req.params.id } });
  if (!result) return next(new AppError('Result not found.', 404));
  if (result.status === 'PENDING') {
    return next(new AppError('Cannot finalise a "not taken" result. It becomes final automatically once the assessment is submitted and scored.', 400));
  }

  const updated = await prisma.result.update({ where: { id: result.id }, data: { status: 'FINAL' } });
  res.status(200).json({ status: 'success', data: { result: updated } });
});

// ─── GET PDP ──────────────────────────────────────────────────────────────────
export const getPDP = asyncHandler(async (req, res, next) => {
  const { userId } = req.params;

  if (req.user.role === 'EMPLOYEE' && req.user.id !== userId) {
    return next(new AppError('You can only view your own development plan.', 403));
  }

  if (req.user.role === 'SUPERVISOR') {
    const target = await prisma.user.findUnique({ where: { id: userId }, select: { supervisorId: true } });
    if (!target || target.supervisorId !== req.user.id) {
      return next(new AppError('You can only view development plans for your direct reports.', 403));
    }
  }

  // Latest result per competency (equivalent to the Mongo aggregate group by competencyId)
  const pdp = await prisma.$queryRaw`
    SELECT DISTINCT ON (r."competencyId") r.*
    FROM "Result" r
    WHERE r."userId" = ${userId} AND r.status = 'FINAL'
    ORDER BY r."competencyId", r."createdAt" DESC
  `;

  const populated = [];
  for (const row of pdp) {
    const result = await prisma.result.findUnique({
      where: { id: row.id },
      include: {
        competency: { select: { id: true, name: true, category: true } },
        assessment: { select: { id: true, description: true, type: true, targetGroup: true, purpose: true } },
      },
    });
    if (result) populated.push(processResultRow(result));
  }

  res.status(200).json({ status: 'success', data: { pdp: populated } });
});

export const getSupervisorEvaluationScores = asyncHandler(async (req, res, next) => {
  const { assessmentId, employeeId } = req.params;

  // SUPERVISOR: must be the direct-report's supervisor
  if (req.user.role === 'SUPERVISOR') {
    const employee = await prisma.user.findUnique({
      where: { id: employeeId },
      select: { id: true, supervisorId: true },
    });
    if (!employee || employee.supervisorId !== req.user.id) {
      return next(new AppError('You can only view scores for your direct reports.', 403));
    }
  }

  const resp = await prisma.response.findFirst({
    where: { assessmentId, employeeId, respondentType: 'supervisor' },
  });
  res.status(200).json({ status: 'success', data: { supervisorScore: resp?.score || null, comments: resp?.comments || '' } });
});

// ─── RICH FILTERED RESULTS ────────────────────────────────────────────────────
export const getFilteredResults = asyncHandler(async (req, res) => {
  const {
    assessmentId, competencyId, department, position,
    targetGroup, purpose, level, status, assessmentType,
    dateFrom, dateTo, search, gender,
    page = 1, limit = 20, sortBy = 'createdAt', sortDir = 'desc',
  } = req.query;

  let where = {};

  if (assessmentId) where.assessmentId = assessmentId;
  if (competencyId) where.competencyId = competencyId;
  if (level) where.level = level;
  if (status) where.status = status;

  if (dateFrom || dateTo) {
    where.createdAt = {};
    if (dateFrom) where.createdAt.gte = new Date(dateFrom);
    if (dateTo) { const end = new Date(dateTo); end.setHours(23, 59, 59, 999); where.createdAt.lte = end; }
  }

  // P2: all filters are pushed into the SQL `where` (relation filters) so
  // pagination and totals reflect the query before `take` — no post-pagination
  // filtering in JS.
  const userFilters = {};
  if (department) userFilters.department = department;
  if (position) userFilters.position = { contains: position, mode: 'insensitive' };
  if (gender) userFilters.gender = gender;
  if (Object.keys(userFilters).length) where.user = userFilters;

  const assessmentFilters = {};
  if (normalizeTargetGroup(targetGroup)) assessmentFilters.targetGroup = normalizeTargetGroup(targetGroup);
  if (purpose) assessmentFilters.purpose = purpose;
  if (assessmentType) assessmentFilters.type = assessmentType;
  if (Object.keys(assessmentFilters).length) where.assessment = assessmentFilters;

  const competencyFilters = {};
  if (search) {
    const s = search.toLowerCase();
    where.OR = [
      { user: { name: { contains: s, mode: 'insensitive' } } },
      { user: { email: { contains: s, mode: 'insensitive' } } },
      { user: { employeeId: { contains: s, mode: 'insensitive' } } },
      { competency: { name: { contains: s, mode: 'insensitive' } } },
      { assessment: { description: { contains: s, mode: 'insensitive' } } },
    ];
  }

  if (req.user.role === 'EMPLOYEE') {
    where.userId = req.user.id;
  } else if (req.user.role === 'SUPERVISOR') {
    where.userId = { in: await getSubordinateIds(req.user.id) };
  }

  const skip = (parseInt(page) - 1) * parseInt(limit);
  // Whitelisted server-side sorting (`score` aliases finalScore;
  // `employee` / `competency` sort by related name)
  const RESULT_SORTABLE_FIELDS = new Set(['createdAt', 'updatedAt', 'finalScore', 'level', 'status']);
  const order = sortDir === 'asc' ? 'asc' : 'desc';
  let orderBy;
  if (sortBy === 'score') orderBy = { finalScore: order };
  else if (sortBy === 'employee') orderBy = { user: { name: order } };
  else if (sortBy === 'competency') orderBy = { competency: { name: order } };
  else orderBy = { [RESULT_SORTABLE_FIELDS.has(sortBy) ? sortBy : 'createdAt']: order };

  const [results, total] = await Promise.all([
    prisma.result.findMany({
      where,
      include: {
        user: { select: { id: true, name: true, email: true, department: true, position: true, employeeId: true, gender: true } },
        competency: { select: { id: true, name: true, category: true, targetGroups: true } },
        assessment: { select: { id: true, description: true, type: true, targetGroup: true, purpose: true, status: true } },
      },
      skip,
      take: parseInt(limit),
      orderBy,
    }),
    prisma.result.count({ where }),
  ]);

  const mapped = results.map(r => processResultRow(r));

  // "Not taken" (PENDING) rows are listed but excluded from performance
  // stats so their 0 scores don't drag down averages and distributions.
  const scored = mapped.filter(r => !r.notTaken);
  const stats = {
    total: mapped.length,
    avgScore: scored.length ? parseFloat((scored.reduce((s, r) => s + r.finalScore, 0) / scored.length).toFixed(1)) : 0,
    levelDist: { Basic: 0, Intermediate: 0, Advanced: 0, Expert: 0 },
    byDept: {},
  };
  scored.forEach(r => {
    if (stats.levelDist[r.level] !== undefined) stats.levelDist[r.level]++;
    if (r.userDepartment) { if (!stats.byDept[r.userDepartment]) stats.byDept[r.userDepartment] = 0; stats.byDept[r.userDepartment]++; }
  });

  res.status(200).json({
    status: 'success',
    data: { results: mapped, stats, pagination: { total, filteredTotal: total, page: parseInt(page), limit: parseInt(limit), totalPages: Math.ceil(total / parseInt(limit)) } },
  });
});

// ─── FILTER OPTIONS ───────────────────────────────────────────────────────────
export const getResultFilterOptions = asyncHandler(async (req, res) => {
  const [departments, positions, resultCompetencyIds, resultAssessmentIds] = await Promise.all([
    prisma.user.findMany({ where: { status: 'ACTIVE', department: { not: null } }, select: { department: true }, distinct: ['department'] }),
    prisma.user.findMany({ where: { status: 'ACTIVE', position: { not: null } }, select: { position: true }, distinct: ['position'] }),
    prisma.result.findMany({ select: { competencyId: true }, distinct: ['competencyId'] }),
    prisma.result.findMany({ select: { assessmentId: true }, distinct: ['assessmentId'] }),
  ]);

  const competencies = await prisma.competency.findMany({
    where: { id: { in: resultCompetencyIds.map(r => r.competencyId) } },
    select: { id: true, name: true, category: true },
  });
  const assessments = await prisma.assessment.findMany({
    where: { id: { in: resultAssessmentIds.map(r => r.assessmentId) } },
    select: { id: true, description: true, type: true, status: true, targetGroup: true, purpose: true },
  });

  res.status(200).json({
    status: 'success',
    data: {
      departments: departments.map(d => d.department).filter(Boolean).sort(),
      positions: positions.map(p => p.position).filter(Boolean).sort(),
      competencies, assessments,
      levels: ['Basic', 'Intermediate', 'Advanced', 'Expert'],
      assessmentTypes: ['SelfAssessment', 'SupervisorOnly', 'Combined'],
      targetGroups: ['managerial', 'non-managerial', 'common'],
      purposes: ['Career Development', 'Succession Planning', 'Performance Improvement', 'Training Needs Analysis', 'Promotion Readiness', 'Other'],
    },
  });
});
