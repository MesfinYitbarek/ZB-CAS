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
  const assessment = await Assessment.findById(assessmentId)
    .populate('competencyId', 'name category');
    
  if (!assessment) throw new Error('Assessment not found.');

  const competency = assessment.competencyId;
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
       * ───────────── Combined Assessment ─────────────
       */
      if (assessment.type === 'Combined') {
        // Calculate self score (0 if no responses)
        const selfResult = selfResponses.length > 0 
          ? computeRawScore(questions, selfResponses)
          : { percentage: 0, rawScore: 0, totalPossible: questions.length };
        
        const selfPercentage = selfResult.percentage;
        
        // Get supervisor score (0 if no evaluation)
        const supervisorResponse = supervisorResponses.find(r => r.submittedAt);
        const supervisorPercentage = supervisorResponse 
          ? (Number(supervisorResponse.score) || 0)
          : 0;

        // Get and validate weights
        const weights = assessment.weight || { selfAssessment: 20, supervisor: 80 };
        let selfWeight = Number(weights.selfAssessment) || 20;
        let supWeight = Number(weights.supervisor) || 80;
        
        // Validate weights sum to 100
        const totalWeight = selfWeight + supWeight;
        if (Math.abs(totalWeight - 100) > 0.01) {
          console.warn(`[ScoringService] Weights don't sum to 100 (${totalWeight}), normalizing...`);
          selfWeight = (selfWeight / totalWeight) * 100;
          supWeight = (supWeight / totalWeight) * 100;
        }

        // Calculate weighted final score
        finalScore = (selfPercentage * selfWeight / 100) + (supervisorPercentage * supWeight / 100);
        finalScore = Math.min(100, Math.max(0, Number(finalScore.toFixed(2))));

        scoreDetails = {
          selfScore: selfPercentage,
          supervisorScore: supervisorPercentage,
          weightUsed: { 
            selfAssessment: Number(selfWeight.toFixed(2)), 
            supervisor: Number(supWeight.toFixed(2)) 
          },
          calculation:
            `(${selfPercentage.toFixed(2)} × ${selfWeight.toFixed(2)}%) + ` +
            `(${supervisorPercentage.toFixed(2)} × ${supWeight.toFixed(2)}%) = ${finalScore.toFixed(2)}%`,
          missingSelf: selfResponses.length === 0,
          missingSupervisor: !supervisorResponse,
          selfResponseCount: selfResponses.length,
          supervisorEvaluationSubmitted: !!supervisorResponse
        };

        status = 'FINAL'; // Always FINAL for Combined
      }
      
      /**
       * ───────────── Self Assessment ─────────────
       */
      else if (assessment.type === 'SelfAssessment') {
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
        employeeEmail: employee.email,
        finalScore,
        level,
        status,
        scoreDetails,
        competencyName: competency.name,
        assessmentType: assessment.type
      });

    } catch (err) {
      console.error('[ScoringService] Error scoring employee:', employee._id, err);
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
    const supervisorPercentage = supervisorResponses.length > 0 
      ? (Number(supervisorResponses[0]?.score) || 0)
      : 0;

    const selfPercentage = selfResult.percentage;
    const weights = assessment.weight || { selfAssessment: 20, supervisor: 80 };

    // Normalize weights
    let selfWeight = weights.selfAssessment || 20;
    let supWeight = weights.supervisor || 80;
    
    const totalWeight = selfWeight + supWeight;
    if (totalWeight > 0 && totalWeight !== 100) {
      selfWeight = (selfWeight / totalWeight) * 100;
      supWeight = (supWeight / totalWeight) * 100;
    }

    finalScore = computeWeightedScore(
      selfPercentage,
      supervisorPercentage,
      { selfAssessment: selfWeight, supervisor: supWeight }
    );

    scoreDetails = {
      selfScore: selfPercentage,
      supervisorScore: supervisorPercentage,
      weightUsed: { selfAssessment: selfWeight, supervisor: supWeight },
      calculation:
        `(${selfPercentage.toFixed(2)} × ${selfWeight.toFixed(2)}%) + ` +
        `(${supervisorPercentage.toFixed(2)} × ${supWeight.toFixed(2)}%) = ${finalScore.toFixed(2)}`,
      missingSelf: selfResponses.length === 0,
      missingSupervisor: supervisorResponses.length === 0
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