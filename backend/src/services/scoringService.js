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

  console.log(`\n╔══════════════════════════════════════════════════════════════╗`);
  console.log(`║ PROCESSING RESULT: ${emp.name.toUpperCase().padEnd(31)} ║`);
  console.log(`╚══════════════════════════════════════════════════════════════╝`);

  const responses = await Response.find({ assessmentId: assessment._id, employeeId }).lean();
  const questions = assessment.questionIds?.length > 0 
      ? await Question.find({ _id: { $in: assessment.questionIds } }).select(SECRET_FIELDS).lean()
      : [];

  const selfResponses = responses.filter(r => r.respondentType === 'self');
  const supervisorResp = responses.find(r => r.respondentType === 'supervisor' && r.submittedAt);

  // 1. Calculate Individual Components
  const selfRes = computeRawScore(questions, selfResponses);
  const selfPerc = selfRes.percentage;
  const supPerc = Number(supervisorResp?.score) || 0;

  let finalScore = 0;
  let scoreDetails = { selfScore: selfPerc, supervisorScore: supPerc, weightUsed: {}, calculation: "" };

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

  console.log(`[STAGE] Logic: ${assessment.type} | Final Score: ${finalScore}% | Level: ${level}`);

  // 3. Persist Result
  const result = await Result.findOneAndUpdate(
      { userId: employeeId, assessmentId: assessment._id, competencyId: assessment.competencyId },
      { finalScore, level, recommendation: rec?.recommendation || '', status: 'FINAL', scoreDetails },
      { upsert: true, new: true }
  );

  // 4. Update HR Report Snapshot
  await Report.findOneAndUpdate(
      { assessmentId: assessment._id, 'user.userId': employeeId },
      {
          user: { userId: emp._id, name: emp.name, department: emp.department, position: emp.position, email: emp.email },
          competencyId: assessment.competencyId,
          competencyName: assessment.competencyId.name || 'Competency',
          finalScore, level, recommendation: rec?.recommendation || '', scoreDetails, updatedAt: new Date()
      },
      { upsert: true }
  );

  console.log(`✅ Success: Result for ${emp.name} finalized.\n`);
  return result;
};

export const scoreFullAssessment = async (assessmentId) => {
  const assessment = await Assessment.findById(assessmentId).populate('competencyId');
  if (!assessment) throw new Error('Assessment not found');

  const filter = { status: { $in: ['ACTIVE', 'COMPLETED'] } };
  if (assessment.target?.department) filter.department = assessment.target.department;
  if (assessment.target?.position) filter.position = assessment.target.position;

  const employees = await User.find(filter).select('_id').lean();
  console.log(`🚀 Bulk Scoring triggered for ${employees.length} employees...`);
  
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
