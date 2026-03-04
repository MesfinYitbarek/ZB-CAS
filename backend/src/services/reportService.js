import logger from '../utils/logger.js';
import Result from '../models/Result.js';
import Report from '../models/Report.js';
import Assessment from '../models/Assessment.js';
import User from '../models/User.js';
import Competency from '../models/Competency.js';

/**
 * generateReportsForAssessment
 *
 * Groups every FINAL Result under an assessment into a single consolidated
 * Report document per user. If a report already exists for a (user × assessment)
 * pair it is updated (upsert), so it is always safe to call this function
 * multiple times (e.g. when additional results are finalised later).
 *
 * Report shape:
 *   user             – snapshot of user fields at generation time
 *   assessment       – snapshot of assessment metadata
 *   competencyResults – array with one entry per competency in this assessment
 *   overallScore     – average of all competency finalScores
 *   overallLevel     – level derived from overallScore
 *   status           – COMPLETE when all expected competencies have results
 */
export const generateReportsForAssessment = async (assessmentId) => {

  // ── 1. Load the assessment (with competency population) ──────────────────
  const assessment = await Assessment.findById(assessmentId)
    .populate('competencyId', 'name category')
    .lean();

  if (!assessment) {
    console.warn(`[ReportService] Assessment ${assessmentId} not found`);
    return;
  }

  // ── 2. Load all FINAL results for this assessment ────────────────────────
  const results = await Result.find({ assessmentId, status: 'FINAL' })
    .populate('userId',      'name email employeeId department position gender')
    .populate('competencyId', 'name category')
    .lean();

  if (!results.length) {
    return;
  }

  // ── 3. Group results by userId ───────────────────────────────────────────
  const byUser = {};
  for (const r of results) {
    const uid = r.userId._id.toString();
    if (!byUser[uid]) byUser[uid] = { user: r.userId, results: [] };
    byUser[uid].results.push(r);
  }

  // ── 4. Build & upsert one report per user ────────────────────────────────
  const ops = Object.values(byUser).map(({ user, results: userResults }) => {

    // Build the embedded competency result array
    const competencyResults = userResults.map(r => ({
      competencyId:   r.competencyId?._id || r.competencyId,
      competencyName: r.competencyId?.name || 'Unknown',
      category:       r.competencyId?.category || '',
      finalScore:     r.finalScore,
      level:          r.level,
      recommendation: r.recommendation || '',
      scoreDetails: {
        selfScore:       r.scoreDetails?.selfScore       ?? 0,
        supervisorScore: r.scoreDetails?.supervisorScore ?? 0,
        weightUsed:      r.scoreDetails?.weightUsed      ?? { selfAssessment: 0, supervisor: 0 },
        calculation:     r.scoreDetails?.calculation     ?? '',
      },
      resultId: r._id,
    }));

    // Roll-up: average score & derived level
    const overallScore = Math.round(
      competencyResults.reduce((sum, cr) => sum + cr.finalScore, 0) /
      competencyResults.length
    );
    const overallLevel = assignLevel(overallScore);

    // Assessment snapshot
    const assessmentSnap = {
      assessmentId: assessment._id,
      description:  assessment.description  || '',
      type:         assessment.type         || '',
      purpose:      assessment.purpose      || '',
      targetGroup:  assessment.targetGroup  || '',
      startDate:    assessment.startDate    || null,
      endDate:      assessment.endDate      || null,
    };

    // User snapshot
    const userSnap = {
      userId:     user._id,
      name:       user.name       || '',
      email:      user.email      || '',
      employeeId: user.employeeId || '',
      department: user.department || '',
      position:   user.position   || '',
      gender:     user.gender     || '',
    };

    return {
      filter: {
        'user.userId':                user._id,
        'assessment.assessmentId':    assessment._id,
      },
      update: {
        $set: {
          user:               userSnap,
          assessment:         assessmentSnap,
          competencyResults,
          overallScore,
          overallLevel,
          status:             'COMPLETE',
          generatedAt:        new Date(),
        },
      },
      options: { upsert: true },
    };
  });

  // Execute all upserts in parallel
  await Promise.all(
    ops.map(({ filter, update, options }) =>
      Report.findOneAndUpdate(filter, update, options)
    )
  );

  return ops.length;
};

/**
 * generateReportForSingleUser
 *
 * Generates (or updates) the consolidated report for one specific
 * (assessmentId, userId) pair. Useful when a single employee's result
 * is finalised outside of the bulk flow.
 */
export const generateReportForSingleUser = async (assessmentId, userId) => {

  const [assessment, results] = await Promise.all([
    Assessment.findById(assessmentId).populate('competencyId', 'name category').lean(),
    Result.find({ assessmentId, userId, status: 'FINAL' })
      .populate('userId',      'name email employeeId department position gender')
      .populate('competencyId', 'name category')
      .lean(),
  ]);

  if (!assessment || !results.length) return null;

  const user = results[0].userId;

  const competencyResults = results.map(r => ({
    competencyId:   r.competencyId?._id || r.competencyId,
    competencyName: r.competencyId?.name || 'Unknown',
    category:       r.competencyId?.category || '',
    finalScore:     r.finalScore,
    level:          r.level,
    recommendation: r.recommendation || '',
    scoreDetails: {
      selfScore:       r.scoreDetails?.selfScore       ?? 0,
      supervisorScore: r.scoreDetails?.supervisorScore ?? 0,
      weightUsed:      r.scoreDetails?.weightUsed      ?? { selfAssessment: 0, supervisor: 0 },
      calculation:     r.scoreDetails?.calculation     ?? '',
    },
    resultId: r._id,
  }));

  const overallScore = Math.round(
    competencyResults.reduce((s, cr) => s + cr.finalScore, 0) / competencyResults.length
  );

  const report = await Report.findOneAndUpdate(
    { 'user.userId': user._id, 'assessment.assessmentId': assessment._id },
    {
      $set: {
        user: {
          userId: user._id, name: user.name || '', email: user.email || '',
          employeeId: user.employeeId || '', department: user.department || '',
          position: user.position || '', gender: user.gender || '',
        },
        assessment: {
          assessmentId: assessment._id,
          description:  assessment.description  || '',
          type:         assessment.type         || '',
          purpose:      assessment.purpose      || '',
          targetGroup:  assessment.targetGroup  || '',
          startDate:    assessment.startDate    || null,
          endDate:      assessment.endDate      || null,
        },
        competencyResults,
        overallScore,
        overallLevel: assignLevel(overallScore),
        status: 'COMPLETE',
        generatedAt: new Date(),
      },
    },
    { upsert: true, new: true }
  );

  return report;
};

// ── Local scoring helper (mirrors scoring.js) ─────────────────────────────────
const assignLevel = (score) => {
  if (score >= 85) return 'Expert';
  if (score >= 70) return 'Advanced';
  if (score >= 50) return 'Intermediate';
  return 'Basic';
};
