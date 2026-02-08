// services/scoringService.js

const Assessment     = require('../models/Assessment');
const Question       = require('../models/Question');
const Response       = require('../models/Response');
const Result         = require('../models/Result');
const Report         = require('../models/Report');
const Recommendation = require('../models/Recommendation');
const User           = require('../models/User');
const Competency     = require('../models/Competency');

const {
  computeRawScore,
  computeWeightedScore,
  assignLevel,
} = require('../utils/scoring');

/**
 * ───────────────────────────────────────────────────────────────
 * SCORE AN ASSESSMENT FOR ALL TARGET EMPLOYEES
 * ───────────────────────────────────────────────────────────────
 */
const scoreAssessment = async (assessmentId) => {
  const assessment = await Assessment.findById(assessmentId).lean();
  if (!assessment) throw new Error('Assessment not found.');

  const competency = await Competency.findById(assessment.competencyId).lean();
  if (!competency) throw new Error('Competency not found.');

  // Target employees
  const userFilter = { status: 'ACTIVE' };
  if (assessment.target?.department) userFilter.department = assessment.target.department;
  if (assessment.target?.position)   userFilter.position   = assessment.target.position;

  const employees = await User.find(userFilter).lean();
  const allResponses = await Response.find({ assessmentId }).lean();

  let questions = [];
  if (assessment.questionIds?.length > 0) {
    questions = await Question.find({
      _id: { $in: assessment.questionIds }
    }).select('+correctAnswer').lean();
  }

  const results = [];

  for (const employee of employees) {
    try {
      const employeeResponses = allResponses.filter(
        r => r.employeeId.toString() === employee._id.toString()
      );

      const selfResponses = employeeResponses.filter(r => r.respondentType === 'self');
      const supervisorResponses = employeeResponses.filter(r => r.respondentType === 'supervisor');

      let finalScore = 0;
      let status = 'FINAL';
      let scoreDetails = null;

      /**
       * ───────────── Self Assessment ─────────────
       */
      if (assessment.type === 'SelfAssessment') {
        const submitted = selfResponses.some(r => r.submittedAt);
        if (!submitted) continue;

        const selfResult = computeRawScore(questions, selfResponses);
        finalScore = selfResult.percentage;

        scoreDetails = {
          selfScore: finalScore,
          supervisorScore: null,
          weightUsed: { selfAssessment: 100, supervisor: 0 }
        };
      }

      /**
       * ───────────── Supervisor Only ─────────────
       */
      else if (assessment.type === 'SupervisorOnly') {
        const supervisorResponse = supervisorResponses.find(r => r.submittedAt);
        if (!supervisorResponse) continue;

        finalScore = Number(supervisorResponse.score) || 0;

        scoreDetails = {
          selfScore: null,
          supervisorScore: finalScore,
          weightUsed: { selfAssessment: 0, supervisor: 100 }
        };
      }

      /**
       * ───────────── Combined Assessment ─────────────
       */
      else if (assessment.type === 'Combined') {
        const selfSubmitted = selfResponses.some(r => r.submittedAt);
        const supervisorResponse = supervisorResponses.find(r => r.submittedAt);

        if (!selfSubmitted || !supervisorResponse) {
          status = 'PENDING';
        } else {
          // ✅ Self = question based
          const selfResult = computeRawScore(questions, selfResponses);
          const selfPercentage = selfResult.percentage;

          // ✅ Supervisor = DIRECT score (0–100)
          const supervisorPercentage = Number(supervisorResponse.score) || 0;

          const weights = assessment.weight || { selfAssessment: 20, supervisor: 80 };

          finalScore = computeWeightedScore(
            selfPercentage,
            supervisorPercentage,
            weights
          );

          scoreDetails = {
            selfScore: selfPercentage,
            supervisorScore: supervisorPercentage,
            weightUsed: weights,
            calculation:
              `(${selfPercentage} × ${weights.selfAssessment}%) + ` +
              `(${supervisorPercentage} × ${weights.supervisor}%) = ${finalScore}`
          };
        }
      }

      // Clamp
      finalScore = Math.min(100, Math.max(0, finalScore));

      // Manual review pending?
      if (employeeResponses.some(r =>
        r.respondentType === 'self' && r.manualScore === null
      )) {
        status = 'PENDING';
      }

      if (status === 'PENDING') continue;

      const level = assignLevel(finalScore);

      const rec = await Recommendation.findOne({
        competencyId: assessment.competencyId,
        level
      }).lean();

      /**
       * ───────────── Save Result ─────────────
       */
      const existingResult = await Result.findOne({
        userId: employee._id,
        assessmentId,
        competencyId: assessment.competencyId
      });

      let result;
      if (existingResult) {
        existingResult.finalScore = finalScore;
        existingResult.level = level;
        existingResult.recommendation = rec?.recommendation || '';
        existingResult.status = status;
        existingResult.scoreDetails = scoreDetails;
        await existingResult.save();
        result = existingResult;
      } else {
        result = await Result.create({
          userId: employee._id,
          assessmentId,
          competencyId: assessment.competencyId,
          finalScore,
          level,
          recommendation: rec?.recommendation || '',
          status,
          scoreDetails
        });
      }

      /**
       * ───────────── Update Report ─────────────
       */
      await Report.findOneAndUpdate(
        { assessmentId, 'user.userId': employee._id },
        {
          user: {
            userId: employee._id,
            name: employee.name,
            department: employee.department,
            position: employee.position,
            email: employee.email,
          },
          competencyId: assessment.competencyId,
          competencyName: competency.name,
          finalScore,
          level,
          recommendation: rec?.recommendation || '',
          scoreDetails,
          updatedAt: new Date(),
        },
        { upsert: true }
      );

      results.push({
        employeeId: employee._id,
        employeeName: employee.name,
        finalScore,
        level,
        status,
        scoreDetails,
      });

    } catch (err) {
      console.error('[ScoringService]', err);
    }
  }

  return results;
};

/**
 * ───────────────────────────────────────────────────────────────
 * FINALISE RESULT AFTER MANUAL REVIEW
 * ───────────────────────────────────────────────────────────────
 */
const finaliseResult = async (resultId) => {
  const result = await Result.findById(resultId);
  if (!result) throw new Error('Result not found.');

  const assessment = await Assessment.findById(result.assessmentId).lean();
  const responses = await Response.find({
    assessmentId: result.assessmentId,
    employeeId: result.userId
  }).lean();

  const selfResponses = responses.filter(r => r.respondentType === 'self');
  const supervisorResponses = responses.filter(r => r.respondentType === 'supervisor');

  let questions = [];
  if (assessment.questionIds?.length > 0) {
    questions = await Question.find({
      _id: { $in: assessment.questionIds }
    }).select('+correctAnswer').lean();
  }

  let finalScore = 0;
  let scoreDetails = null;

  if (assessment.type === 'SelfAssessment') {
    const selfResult = computeRawScore(questions, selfResponses);
    finalScore = selfResult.percentage;

    scoreDetails = {
      selfScore: finalScore,
      supervisorScore: null,
      weightUsed: { selfAssessment: 100, supervisor: 0 }
    };
  }

  else if (assessment.type === 'SupervisorOnly') {
    const supervisorResponse = supervisorResponses.find(r => r.submittedAt);
    finalScore = Number(supervisorResponse?.score) || 0;

    scoreDetails = {
      selfScore: null,
      supervisorScore: finalScore,
      weightUsed: { selfAssessment: 0, supervisor: 100 }
    };
  }

  else if (assessment.type === 'Combined') {
    const selfResult = computeRawScore(questions, selfResponses);
    const supervisorResponse = supervisorResponses.find(r => r.submittedAt);

    const selfPercentage = selfResult.percentage;
    const supervisorPercentage = Number(supervisorResponse?.score) || 0;
    const weights = assessment.weight || { selfAssessment: 20, supervisor: 80 };

    finalScore = computeWeightedScore(
      selfPercentage,
      supervisorPercentage,
      weights
    );

    scoreDetails = {
      selfScore: selfPercentage,
      supervisorScore: supervisorPercentage,
      weightUsed: weights,
      calculation:
        `(${selfPercentage} × ${weights.selfAssessment}%) + ` +
        `(${supervisorPercentage} × ${weights.supervisor}%) = ${finalScore}`
    };
  }

  finalScore = Math.min(100, Math.max(0, finalScore));

  const level = assignLevel(finalScore);

  const rec = await Recommendation.findOne({
    competencyId: assessment.competencyId,
    level
  }).lean();

  result.finalScore = finalScore;
  result.level = level;
  result.recommendation = rec?.recommendation || '';
  result.status = 'FINAL';
  result.scoreDetails = scoreDetails;

  await result.save();

  await Report.findOneAndUpdate(
    { assessmentId: result.assessmentId, 'user.userId': result.userId },
    {
      finalScore,
      level,
      recommendation: rec?.recommendation || '',
      scoreDetails,
      updatedAt: new Date(),
    }
  );

  return result;
};

module.exports = {
  scoreAssessment,
  finaliseResult,
};
