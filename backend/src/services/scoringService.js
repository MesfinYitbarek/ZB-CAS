/* services/scoringService.js - Fixed version */
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
 * Score a single assessment for ALL target employees.
 * @param {string} assessmentId
 * @returns {Array} – array of result objects
 */
const scoreAssessment = async (assessmentId) => {
  // ── 1. Load assessment with questions (including correctAnswer) ──────────
  const assessment = await Assessment.findById(assessmentId).lean();
  if (!assessment) throw new Error('Assessment not found.');

  const questions = await Question.find({ _id: { $in: assessment.questionIds } })
    .select('+correctAnswer')   // correctAnswer is select:false by default
    .lean();

  const competency = await Competency.findById(assessment.competencyId).lean();
  if (!competency) throw new Error('Competency not found.');

  // ── 2. Collect all responses grouped by employee ─────────────────────────
  const allResponses = await Response.find({ assessmentId })
    .lean();

  // Group by employeeId
  const employeeMap = {};
  allResponses.forEach((resp) => {
    const empId = resp.employeeId.toString();
    if (!employeeMap[empId]) employeeMap[empId] = { self: [], supervisor: [] };
    employeeMap[empId][resp.respondentType].push(resp);
  });

  const results = [];

  // ── 3-8. Process each employee ───────────────────────────────────────────
  for (const [empId, responseGroup] of Object.entries(employeeMap)) {
    let finalScore = 0;

    if (assessment.type === 'SelfAssessment') {
      const { percentage } = computeRawScore(questions, responseGroup.self);
      finalScore = percentage;

    } else if (assessment.type === 'SupervisorOnly') {
      const { percentage } = computeRawScore(questions, responseGroup.supervisor);
      finalScore = percentage;

    } else if (assessment.type === 'Combined') {
      const selfResult = computeRawScore(questions, responseGroup.self);
      const supResult  = computeRawScore(questions, responseGroup.supervisor);
      finalScore = computeWeightedScore(
        selfResult.percentage,
        supResult.percentage,
        assessment.weight
      );
    }

    const level = assignLevel(finalScore);

    // ── 6. Lookup recommendation ──────────────────────────────────────────
    const rec = await Recommendation.findOne({
      competencyId: assessment.competencyId,
      level,
    }).lean();

    // ── 7. Check if any ShortAnswer questions still need manual review ────
    const hasManualPending = questions.some((q) => q.manualReview);
    const resultStatus = hasManualPending ? 'PENDING' : 'FINAL';

    // Check if result already exists
    const existingResult = await Result.findOne({
      userId: empId,
      assessmentId,
      competencyId: assessment.competencyId,
    });

    let result;
    
    if (existingResult) {
      // Update existing result
      existingResult.finalScore = finalScore;
      existingResult.level = level;
      existingResult.recommendation = rec ? rec.recommendation : '';
      existingResult.status = resultStatus;
      await existingResult.save();
      result = existingResult;
    } else {
      // Create new result
      result = await Result.create({
        userId: empId,
        assessmentId,
        competencyId: assessment.competencyId,
        finalScore,
        level,
        recommendation: rec ? rec.recommendation : '',
        status: resultStatus,
      });
    }

    // ── 8. Persist/Update Report snapshot ────────────────────────────────
    const employee = await User.findById(empId).lean();

    // Check if report exists
    const existingReport = await Report.findOne({
      'user.userId': empId,
      assessmentId,
    });

    const reportData = {
      user: {
        userId: empId,
        name: employee?.name || 'Unknown',
        department: employee?.department || '',
        position: employee?.position || '',
        email: employee?.email || '',
      },
      competencyName: competency.name,
      competencyId: assessment.competencyId,
      assessmentId,
      finalScore,
      level,
      recommendation: rec ? rec.recommendation : '',
    };

    if (existingReport) {
      await Report.findOneAndUpdate(
        { _id: existingReport._id },
        reportData,
        { new: true }
      );
    } else {
      await Report.create(reportData);
    }

    results.push({
      employeeId: empId,
      employeeName: employee?.name || 'Unknown',
      employeeEmail: employee?.email || '',
      competencyName: competency.name,
      finalScore,
      level,
      recommendation: rec ? rec.recommendation : '',
      resultStatus,
    });
  }

  return results;
};

/**
 * Finalise a single result after manual review of ShortAnswer questions.
 * HR admin calls this after setting manualScore on Response documents.
 */
const finaliseResult = async (resultId) => {
  const result = await Result.findById(resultId).populate('assessmentId');
  if (!result) throw new Error('Result not found.');

  const assessment = await Assessment.findById(result.assessmentId).lean();
  const questions = await Question.find({ _id: { $in: assessment.questionIds } })
    .select('+correctAnswer').lean();

  const responses = await Response.find({
    assessmentId: result.assessmentId,
    employeeId: result.userId,
  }).lean();

  // Re-score with manual scores now populated
  const selfResponses = responses.filter((r) => r.respondentType === 'self');
  const supResponses = responses.filter((r) => r.respondentType === 'supervisor');

  let finalScore = 0;
  if (assessment.type === 'SelfAssessment') {
    finalScore = computeRawScore(questions, selfResponses).percentage;
  } else if (assessment.type === 'SupervisorOnly') {
    finalScore = computeRawScore(questions, supResponses).percentage;
  } else {
    finalScore = computeWeightedScore(
      computeRawScore(questions, selfResponses).percentage,
      computeRawScore(questions, supResponses).percentage,
      assessment.weight
    );
  }

  const level = assignLevel(finalScore);

  const rec = await Recommendation.findOne({
    competencyId: assessment.competencyId,
    level,
  }).lean();

  // Update Result
  result.finalScore = finalScore;
  result.level = level;
  result.recommendation = rec ? rec.recommendation : '';
  result.status = 'FINAL';
  await result.save();

  // Update the corresponding Report
  await Report.findOneAndUpdate(
    { assessmentId: result.assessmentId, 'user.userId': result.userId },
    { 
      finalScore, 
      level, 
      recommendation: rec ? rec.recommendation : '',
      updatedAt: new Date()
    }
  );

  return result;
};

module.exports = { scoreAssessment, finaliseResult };