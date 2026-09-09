import logger from '../utils/logger.js';
import prisma from '../config/prisma.js';
import { computeRawScore, computeWeightedScore, assignLevel } from '../utils/scoring.js';

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

  // 3. Persist Result (upsert by user+assessment+competency)
  const existingResult = await prisma.result.findFirst({
    where: {
      userId: employeeId,
      assessmentId: assessment.id,
      competencyId: assessment.competencyId,
    },
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
  if (existingResult) {
    result = await prisma.result.update({
      where: { id: existingResult.id },
      data: resultData,
    });
  } else {
    result = await prisma.result.create({ data: resultData });
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

export const scoreFullAssessment = async (assessmentId) => {
  const assessment = await prisma.assessment.findUnique({
    where: { id: assessmentId },
    include: { assessmentQuestions: { select: { questionId: true } } },
  });
  if (!assessment) throw new Error('Assessment not found');

  // Only score employees who actually participated (have at least one response).
  // Otherwise bulk/admin scoring assigns bogus 0% results to employees that
  // never took the assessment.
  const participated = await prisma.response.findMany({
    where: { assessmentId: assessment.id },
    select: { employeeId: true },
    distinct: ['employeeId'],
  });
  const participantIds = participated.map(r => r.employeeId);
  if (participantIds.length === 0) {
    logger.info({ event: 'bulk_score_skip', reason: 'no_participants', assessmentId });
    return [];
  }

  const filter = { id: { in: participantIds } };
  if (assessment.legacyDepartment) filter.department = assessment.legacyDepartment;
  if (assessment.legacyPosition) filter.position = assessment.legacyPosition;

  const employees = await prisma.user.findMany({ where: filter, select: { id: true } });
  logger.info({ event: 'bulk_score_start', count: employees.length });

  const results = [];
  for (const emp of employees) {
    const res = await calculateAndSaveResult(assessment, emp.id);
    if (res) results.push(res);
  }
  return results;
};

export const scoreIndividual = async (assessmentId, employeeId) => {
  const assessment = await prisma.assessment.findUnique({
    where: { id: assessmentId },
    include: { assessmentQuestions: { select: { questionId: true } } },
  });
  return calculateAndSaveResult(assessment, employeeId);
};
