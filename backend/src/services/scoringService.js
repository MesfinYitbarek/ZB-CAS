import logger from '../utils/logger.js';
import prisma from '../config/prisma.js';
import { computeRawScore, computeWeightedScore, assignLevel } from '../utils/scoring.js';
import { sendResultsEmail } from './emailService.js';
import { notifyResultReady } from './notificationService.js';

/**
 * A Combined assessment is only ready to score once BOTH sides have
 * submitted: at least one submitted self response AND a submitted
 * supervisor evaluation (drafts with submittedAt == null don't count).
 * Scoring earlier would persist a FINAL row that is just the self part
 * (supervisorScore 0) or just the supervisor part (selfScore 0) instead
 * of one combined calculation.
 */
export const hasSubmittedBothSides = async (assessmentId, employeeId) => {
  const [self, supervisor] = await Promise.all([
    prisma.response.findFirst({
      where: { assessmentId, employeeId, respondentType: 'self', submittedAt: { not: null } },
      select: { id: true },
    }),
    prisma.response.findFirst({
      where: { assessmentId, employeeId, respondentType: 'supervisor', submittedAt: { not: null } },
      select: { id: true },
    }),
  ]);
  return !!(self && supervisor);
};

const calculateAndSaveResult = async (assessment, employeeId) => {
  const emp = await prisma.user.findUnique({ where: { id: employeeId } });
  if (!emp) return null;

  logger.debug({ event: 'scoring_start', employee: emp.name });

  const responses = await prisma.response.findMany({
    where: { assessmentId: assessment.id, employeeId },
  });

  const questionIds = (assessment.assessmentQuestions || []).map(aq => aq.questionId);
  const questions = questionIds.length > 0
    ? await prisma.question.findMany({ where: { id: { in: questionIds } } })
    : [];

  const selfResponses = responses.filter(r => r.respondentType === 'self');
  const supervisorResp = responses.find(r => r.respondentType === 'supervisor' && r.submittedAt);

  // Protect an earned FINAL from an abandoned retake: starting a new attempt
  // clears prior self answers, so if nothing was (re)submitted, recomputing
  // from drafts/emptiness would overwrite the real score with ~0. Keep the
  // existing FINAL instead. (SupervisorOnly has no self side — excluded.)
  if (assessment.type !== 'SupervisorOnly' && !selfResponses.some((r) => r.submittedAt)) {
    const existingFinal = await prisma.result.findFirst({
      where: {
        userId: employeeId,
        assessmentId: assessment.id,
        competencyId: assessment.competencyId,
        status: 'FINAL',
      },
      orderBy: { updatedAt: 'desc' },
    });
    if (existingFinal) {
      logger.info({ event: 'score_keep_final', reason: 'abandoned_retake', assessmentId: assessment.id, employeeId });
      return existingFinal;
    }
  }

  // 1. Calculate Individual Components
  // expose `_id` so the scoring util (which reads q._id.toString()) works
  const scoredQuestions = questions.map(q => ({ ...q, _id: q.id }));
  const selfRes = computeRawScore(scoredQuestions, selfResponses);
  const selfPerc = selfRes.percentage;
  const selfQuestionDetails = selfRes.questionDetails;

  const supPerc = Number(supervisorResp?.score) || 0;

  let finalScore = 0;
  let scoreDetails = {
    selfScore: selfPerc,
    supervisorScore: supPerc,
    weightUsed: {},
    calculation: "",
    questionDetails: selfQuestionDetails,
  };

  // 2. Apply Assessment Type Logic
  if (assessment.type === 'Combined') {
    const weights = { selfAssessment: assessment.selfWeight, supervisor: assessment.supervisorWeight };
    finalScore = computeWeightedScore(selfPerc, supPerc, weights);
    scoreDetails.weightUsed = weights;
    scoreDetails.calculation = `Weighted: (${selfPerc}% x ${weights.selfAssessment}%) + (${supPerc}% x ${weights.supervisor}%)`;
  } else if (assessment.type === 'SelfAssessment') {
    finalScore = selfPerc;
    scoreDetails.weightUsed = { selfAssessment: 100, supervisor: 0 };
    scoreDetails.calculation = `Self-Assessment Only: ${finalScore}%`;
  } else {
    finalScore = supPerc;
    scoreDetails.weightUsed = { selfAssessment: 0, supervisor: 100 };
    scoreDetails.calculation = `Supervisor Only Score: ${finalScore}%`;
  }

  const level = assignLevel(finalScore);
  const rec = await prisma.recommendation.findFirst({
    where: { competencyId: assessment.competencyId, level },
  });

  logger.debug({ event: 'scoring_stage', type: assessment.type, finalScore, level });

  // 3. Persist Result (upsert by user+assessment+competency, keeping ONE row)
  const existingResults = await prisma.result.findMany({
    where: {
      userId: employeeId,
      assessmentId: assessment.id,
      competencyId: assessment.competencyId,
    },
    orderBy: { updatedAt: 'desc' },
  });

  const resultData = {
    userId: employeeId,
    assessmentId: assessment.id,
    competencyId: assessment.competencyId,
    finalScore,
    level,
    recommendation: rec?.recommendation || '',
    status: 'FINAL',
    scoreDetails,
  };

  let result;
  if (existingResults.length > 0) {
    result = await prisma.result.update({
      where: { id: existingResults[0].id },
      data: resultData,
    });
    // Collapse stale duplicate rows left over from partial/legacy scoring so the
    // results list never shows conflicting scores for the same attempt.
    const staleIds = existingResults.slice(1).map(r => r.id);
    if (staleIds.length > 0) {
      await prisma.result.deleteMany({ where: { id: { in: staleIds } } });
    }
  } else {
    try {
      result = await prisma.result.create({ data: resultData });
    } catch (err) {
      if (err?.code === 'P2002') {
        // Lost a race with a concurrent scoring run for the same
        // (user, assessment, competency) — update the winner's row so the
        // two runs collapse into ONE combined result instead of erroring.
        const winner = await prisma.result.findFirst({
          where: {
            userId: employeeId,
            assessmentId: assessment.id,
            competencyId: assessment.competencyId,
          },
          orderBy: { updatedAt: 'desc' },
        });
        if (!winner) throw err;
        result = await prisma.result.update({
          where: { id: winner.id },
          data: resultData,
        });
        logger.info({ event: 'score_race_merged', assessmentId: assessment.id, employeeId });
      } else {
        throw err;
      }
    }
  }

  // Persist per-question details in the junction table
  await prisma.resultQuestionDetail.deleteMany({ where: { resultId: result.id } });
  if (selfQuestionDetails.length > 0) {
    await prisma.resultQuestionDetail.createMany({
      data: selfQuestionDetails.map((qd) => ({
        resultId: result.id,
        questionId: qd.questionId,
        questionNumber: qd.questionNumber,
        questionText: qd.questionText,
        questionType: qd.questionType,
        maxScore: qd.maxScore,
        options: qd.options,
        userAnswer: qd.userAnswer,
        correctAnswer: qd.correctAnswer,
        scoreAwarded: qd.scoreAwarded,
        scorePercentage: qd.scorePercentage,
        isCorrect: qd.isCorrect,
        isPartial: qd.isPartial,
        isUnanswered: qd.isUnanswered,
      })),
    });
  }

  logger.info({ event: 'score_saved', employeeId: emp.id, finalScore, level });
  return result;
};

export const scoreFullAssessment = async (assessmentId, { finalCall = false } = {}) => {
  const assessment = await prisma.assessment.findUnique({
    where: { id: assessmentId },
    include: {
      assessmentQuestions: { select: { questionId: true } },
      audienceDepartments: { select: { department: true } },
      audienceEmployees: { select: { employeeId: true } },
    },
  });
  if (!assessment) throw new Error('Assessment not found');

  // Employees who touched the assessment (any response row, submitted or not).
  const participated = await prisma.response.findMany({
    where: { assessmentId: assessment.id },
    select: { employeeId: true },
    distinct: ['employeeId'],
  });
  const participantIds = participated.map(r => r.employeeId);

  // Submitted sides per employee, preloaded once (Combined readiness gate).
  const [submittedSelf, submittedSup] = await Promise.all([
    prisma.response.findMany({
      where: { assessmentId: assessment.id, respondentType: 'self', submittedAt: { not: null } },
      select: { employeeId: true },
      distinct: ['employeeId'],
    }),
    prisma.response.findMany({
      where: { assessmentId: assessment.id, respondentType: 'supervisor', submittedAt: { not: null } },
      select: { employeeId: true },
      distinct: ['employeeId'],
    }),
  ]);
  const selfSet = new Set(submittedSelf.map(r => r.employeeId));
  const supSet = new Set(submittedSup.map(r => r.employeeId));

  // At completion the whole assigned audience is finalized: participants get
  // their (combined) calculation with a missing side counted as 0, and
  // assigned users who never took the assessment get a PENDING "not taken"
  // row so they show up in the results page instead of being ignored.
  let assignedIds = [];
  if (finalCall) assignedIds = await getAssignedUserIds(assessment);

  const candidateIds = [...new Set([...participantIds, ...assignedIds])];
  if (candidateIds.length === 0) {
    logger.info({ event: 'bulk_score_skip', reason: 'no_participants', assessmentId });
    return { results: [], skipped: [] };
  }

  const filter = { id: { in: candidateIds } };
  if (assessment.legacyDepartment) filter.department = assessment.legacyDepartment;
  if (assessment.legacyPosition) filter.position = assessment.legacyPosition;

  const employees = await prisma.user.findMany({ where: filter, select: { id: true } });
  logger.info({ event: 'bulk_score_start', count: employees.length, finalCall });

  const results = [];
  const skipped = new Set();

  // P4: Emails are unaffected by write ordering — each employee owns a
  // distinct Result row — so score employees with bounded concurrency.
  const mapConcurrent = async (items, limit, fn) => {
    const out = new Array(items.length);
    let idx = 0;
    const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (idx < items.length) {
        const i = idx++;
        out[i] = await fn(items[i]);
      }
    });
    await Promise.all(workers);
    return out;
  };

  const outcomes = await mapConcurrent(employees, 6, async (emp) => {
    const hasSelf = selfSet.has(emp.id);
    const hasSup = supSet.has(emp.id);

    if (!hasSelf && !hasSup) {
      // Never took the assessment: only materialize a "not taken" row at
      // completion. Mid-flight bulk scoring leaves these employees alone.
      if (finalCall) {
        const row = await markNotTakenResult(assessment, emp.id);
        return row || null;
      }
      return null;
    }

    if (!finalCall && assessment.type === 'Combined' && !(hasSelf && hasSup)) {
      // Combined must be calculated from BOTH sides together. Scoring an
      // employee whose supervisor hasn't submitted (or vice versa) would
      // persist a single-side FINAL row instead of one combined result, so
      // those employees are skipped and reported back to the caller.
      skipped.add(emp.id);
      return null;
    }

    // Completion (or a ready pair): calculate with a missing side as 0.
    return calculateAndSaveResult(assessment, emp.id);
  });

  for (const row of outcomes) {
    if (row) results.push(row);
  }
  if (skipped.size > 0) {
    logger.info({ event: 'bulk_score_skipped_incomplete', assessmentId, count: skipped.size });
  }
  return { results, skipped: [...skipped] };
};

/**
 * Assigned audience of an assessment — the users expected to take it.
 * Mirrors the read-path audience resolution (ALL_DEPARTMENTS /
 * DEPARTMENT_ALL / SPECIFIC_EMPLOYEES + legacy fallbacks), restricted to
 * active employees so admins don't collect "not taken" rows.
 */
export const getAssignedUserIds = async (assessment) => {
  const ACTIVE_EMPLOYEE = { status: 'ACTIVE', roles: { has: 'EMPLOYEE' } };

  if (assessment.audienceType === 'SPECIFIC_EMPLOYEES' && assessment.audienceEmployees?.length) {
    const ids = assessment.audienceEmployees.map(e => e.employeeId);
    const users = await prisma.user.findMany({ where: { id: { in: ids }, ...ACTIVE_EMPLOYEE }, select: { id: true } });
    return users.map(u => u.id);
  }

  if (assessment.audienceType === 'DEPARTMENT_ALL' && assessment.audienceDepartments?.length) {
    const users = await prisma.user.findMany({
      where: { ...ACTIVE_EMPLOYEE, department: { in: assessment.audienceDepartments.map(d => d.department) } },
      select: { id: true },
    });
    return users.map(u => u.id);
  }

  const where = { ...ACTIVE_EMPLOYEE };
  if (assessment.legacyDepartment) where.department = assessment.legacyDepartment;
  if (assessment.legacyPosition) where.position = assessment.legacyPosition;
  const users = await prisma.user.findMany({ where, select: { id: true } });
  return users.map(u => u.id);
};

/**
 * Persist a "not taken" marker for an assigned user who never took the
 * assessment. Status PENDING keeps the row out of every FINAL-gated
 * consumer (analytics, reports, dashboards, PDP) while the results page
 * renders it with a "Not Taken" score. Never overwrites an existing row.
 */
export const markNotTakenResult = async (assessment, userId) => {
  const where = { userId, assessmentId: assessment.id, competencyId: assessment.competencyId };
  const existing = await prisma.result.findFirst({ where });
  if (existing) return existing;

  try {
    return await prisma.result.create({
      data: {
        ...where,
        finalScore: 0,
        level: 'Basic',
        recommendation: '',
        status: 'PENDING',
        scoreDetails: {
          selfScore: null,
          supervisorScore: null,
          notTaken: true,
          calculation: 'Not taken — no submission from either side',
        },
      },
    });
  } catch (err) {
    if (err?.code === 'P2002') {
      return prisma.result.findFirst({ where });
    }
    throw err;
  }
};

export const scoreIndividual = async (assessmentId, employeeId) => {
  const assessment = await prisma.assessment.findUnique({
    where: { id: assessmentId },
    include: { assessmentQuestions: { select: { questionId: true } } },
  });
  return calculateAndSaveResult(assessment, employeeId);
};

/**
 * Finalize an assessment the moment it transitions to COMPLETED.
 * Fire-and-forget — never throws; every failure is logged. Every assigned
 * user ends up with exactly one row: participants get their (combined)
 * calculation with a missing side counted as 0, and assigned users who
 * never took the assessment get a PENDING "not taken" row. Then Combined
 * employees are emailed + notified that their result is ready.
 */
export const autoScoreOnCompletion = async (assessmentId) => {
  try {
    const assessment = await prisma.assessment.findUnique({
      where: { id: assessmentId },
      select: { id: true, type: true, competency: { select: { name: true } } },
    });
    if (!assessment) return;

    const { results } = await scoreFullAssessment(assessmentId, { finalCall: true });

    if (assessment.type !== 'Combined') return;
    const competencyName = assessment.competency?.name || 'Competency';

    for (const r of results) {
      if (r.status !== 'FINAL') continue;
      const employee = await prisma.user.findUnique({
        where: { id: r.userId },
        select: { name: true, email: true },
      });
      if (employee?.email) {
        sendResultsEmail(
          { name: employee.name, email: employee.email },
          [{ competencyName, finalScore: r.finalScore, level: r.level, assessmentType: 'Combined' }],
        ).catch(e => logger.error({ event: 'email_fail', message: e.message }));
        notifyResultReady(r.userId, competencyName, r.finalScore, r.level, r.id);
      }
    }

    logger.info({ event: 'auto_score_on_completion', assessmentId, count: results.length });
  } catch (err) {
    logger.error({ event: 'auto_score_on_completion_error', assessmentId, err: err.message });
  }
};
