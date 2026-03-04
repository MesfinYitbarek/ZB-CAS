import logger from '../utils/logger.js';
import Result from '../models/Result.js';
import Assessment from '../models/Assessment.js';
import Question from '../models/Question.js';
import Response from '../models/Response.js';
import Report from '../models/Report.js';
import Recommendation from '../models/Recommendation.js';
import User from '../models/User.js';
import { computeRawScore, computeWeightedScore, assignLevel } from '../utils/scoring.js';

const SECRET_FIELDS = '+correctAnswer +correctAnswers +matchingPairs +correctOrder +categories';

const calculateAndSaveResult = async (assessment, employeeId) => {
  const emp = await User.findById(employeeId).lean();
  if (!emp) return null;

  logger.debug({ event: 'scoring_start', employee: emp.name });
  // removed
  // removed

  const responses = await Response.find({ assessmentId: assessment._id, employeeId }).lean();
  const questions = assessment.questionIds?.length > 0
      ? await Question.find({ _id: { $in: assessment.questionIds } }).select(SECRET_FIELDS).lean()
      : [];

  const selfResponses = responses.filter(r => r.respondentType === 'self');
  const supervisorResp = responses.find(r => r.respondentType === 'supervisor' && r.submittedAt);

  // 1. Calculate Individual Components
  // UPDATED: computeRawScore now returns questionDetails alongside rawScore & percentage
  const selfRes = computeRawScore(questions, selfResponses);
  const selfPerc = selfRes.percentage;
  const selfQuestionDetails = selfRes.questionDetails; // NEW: per-question breakdown

  const supPerc = Number(supervisorResp?.score) || 0;

  let finalScore = 0;
  let scoreDetails = {
    selfScore: selfPerc,
    supervisorScore: supPerc,
    weightUsed: {},
    calculation: "",
    // NEW: Store per-question answers, correct answers, and scores
    questionDetails: selfQuestionDetails
  };

  // 2. Apply Assessment Type Logic
  if (assessment.type === 'Combined') {
      const weights = assessment.weight || { selfAssessment: 20, supervisor: 80 };
      finalScore = computeWeightedScore(selfPerc, supPerc, weights);
      scoreDetails.weightUsed = weights;
      scoreDetails.calculation = `Weighted: (${selfPerc}% x ${weights.selfAssessment}%) + (${supPerc}% x ${weights.supervisor}%)`;
  } else if (assessment.type === 'SelfAssessment') {
      finalScore = selfPerc;
      scoreDetails.weightUsed = { selfAssessment: 100, supervisor: 0 };
      scoreDetails.calculation = `Self-Assessment Only: ${finalScore}%`;
  } else { // SupervisorOnly
      finalScore = supPerc;
      scoreDetails.weightUsed = { selfAssessment: 0, supervisor: 100 };
      scoreDetails.calculation = `Supervisor Only Score: ${finalScore}%`;
  }

  const level = assignLevel(finalScore);
  const rec = await Recommendation.findOne({ competencyId: assessment.competencyId, level }).lean();

  logger.debug({ event: 'scoring_stage', type: assessment.type, finalScore, level });
  logger.debug({ event: 'scoring_stage', type: assessment.type, finalScore, level });

  // 3. Persist Result (now includes questionDetails in scoreDetails)
  const result = await Result.findOneAndUpdate(
      { userId: employeeId, assessmentId: assessment._id, competencyId: assessment.competencyId },
      { finalScore, level, recommendation: rec?.recommendation || '', status: 'FINAL', scoreDetails },
      { upsert: true, new: true }
  );

  // 4. Update HR Report Snapshot
//   await Report.findOneAndUpdate(
//       { assessmentId: assessment._id, 'user.userId': employeeId },
//       {
//           user: { userId: emp._id, name: emp.name, department: emp.department, position: emp.position, email: emp.email },
//           competencyId: assessment.competencyId,
//           competencyName: assessment.competencyId.name || 'Competency',
//           finalScore, level, recommendation: rec?.recommendation || '', scoreDetails, updatedAt: new Date()
//       },
//       { upsert: true }
//   );

  logger.info({ event: 'score_saved', employeeId: emp._id, finalScore, level });
  return result;
};

export const scoreFullAssessment = async (assessmentId) => {
  const assessment = await Assessment.findById(assessmentId).populate('competencyId');
  if (!assessment) throw new Error('Assessment not found');

  const filter = { status: { $in: ['ACTIVE', 'COMPLETED'] } };
  if (assessment.target?.department) filter.department = assessment.target.department;
  if (assessment.target?.position) filter.position = assessment.target.position;

  const employees = await User.find(filter).select('_id').lean();
  logger.info({ event: 'bulk_score_start', count: employees.length });

  const results = [];
  for (const emp of employees) {
      const res = await calculateAndSaveResult(assessment, emp._id);
      if (res) results.push(res);
  }
  return results;
};

export const scoreIndividual = async (assessmentId, employeeId) => {
  const assessment = await Assessment.findById(assessmentId).populate('competencyId');
  return calculateAndSaveResult(assessment, employeeId);
};
