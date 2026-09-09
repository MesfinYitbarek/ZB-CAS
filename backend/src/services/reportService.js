import logger from '../utils/logger.js';
import prisma from '../config/prisma.js';

export const generateReportsForAssessment = async (assessmentId) => {

  const assessment = await prisma.assessment.findUnique({
    where: { id: assessmentId },
  });

  if (!assessment) {
    console.warn(`[ReportService] Assessment ${assessmentId} not found`);
    return;
  }

  const results = await prisma.result.findMany({
    where: { assessmentId, status: 'FINAL' },
    include: {
      user: { select: { id: true, name: true, email: true, employeeId: true, department: true, position: true, gender: true } },
      competency: { select: { id: true, name: true, category: true } },
    },
  });

  if (!results.length) {
    return;
  }

  const byUser = {};
  for (const r of results) {
    const uid = r.user.id;
    if (!byUser[uid]) byUser[uid] = { user: r.user, results: [] };
    byUser[uid].results.push(r);
  }

  const ops = [];
  for (const { user, results: userResults } of Object.values(byUser)) {

    const competencyResults = userResults.map(r => ({
      competencyId: r.competency?.id || null,
      competencyName: r.competency?.name || 'Unknown',
      category: r.competency?.category || '',
      finalScore: r.finalScore,
      level: r.level,
      recommendation: r.recommendation || '',
      scoreDetails: {
        selfScore: r.scoreDetails?.selfScore ?? 0,
        supervisorScore: r.scoreDetails?.supervisorScore ?? 0,
        weightUsed: r.scoreDetails?.weightUsed ?? { selfAssessment: 0, supervisor: 0 },
        calculation: r.scoreDetails?.calculation ?? '',
      },
      resultId: r.id,
    }));

    const overallScore = Math.round(
      competencyResults.reduce((sum, cr) => sum + cr.finalScore, 0) /
      competencyResults.length
    );
    const overallLevel = assignLevel(overallScore);

    const report = await prisma.report.upsert({
      where: { userId_assessmentId: { userId: user.id, assessmentId } },
      create: {
        userId: user.id,
        assessmentId,
        user_name: user.name || '',
        user_email: user.email || '',
        user_employeeId: user.employeeId || '',
        user_department: user.department || '',
        user_position: user.position || '',
        user_gender: user.gender || '',
        assessment_description: assessment.description || '',
        assessment_type: assessment.type || '',
        assessment_purpose: assessment.purpose || '',
        assessment_targetGroup: assessment.targetGroup || '',
        assessment_startDate: assessment.startDate || null,
        assessment_endDate: assessment.endDate || null,
        overallScore,
        overallLevel,
        status: 'COMPLETE',
        generatedAt: new Date(),
      },
      update: {
        user_name: user.name || '',
        user_email: user.email || '',
        user_employeeId: user.employeeId || '',
        user_department: user.department || '',
        user_position: user.position || '',
        user_gender: user.gender || '',
        assessment_description: assessment.description || '',
        assessment_type: assessment.type || '',
        assessment_purpose: assessment.purpose || '',
        assessment_targetGroup: assessment.targetGroup || '',
        assessment_startDate: assessment.startDate || null,
        assessment_endDate: assessment.endDate || null,
        overallScore,
        overallLevel,
        status: 'COMPLETE',
        generatedAt: new Date(),
      },
    });

    ops.push({ reportId: report.id, competencyResults });
  }

  for (const { reportId, competencyResults } of ops) {
    await prisma.reportCompetency.deleteMany({ where: { reportId } });
    if (competencyResults.length) {
      await prisma.reportCompetency.createMany({
        data: competencyResults.map(cr => ({
          reportId,
          competencyId: cr.competencyId,
          competencyName: cr.competencyName,
          category: cr.category,
          finalScore: cr.finalScore,
          level: cr.level,
          recommendation: cr.recommendation,
          scoreDetails: cr.scoreDetails,
          resultId: cr.resultId,
        })),
      });
    }
  }

  return ops.length;
};

export const generateReportForSingleUser = async (assessmentId, userId) => {

  const [assessment, results] = await Promise.all([
    prisma.assessment.findUnique({ where: { id: assessmentId } }),
    prisma.result.findMany({
      where: { assessmentId, userId, status: 'FINAL' },
      include: {
        user: { select: { id: true, name: true, email: true, employeeId: true, department: true, position: true, gender: true } },
        competency: { select: { id: true, name: true, category: true } },
      },
    }),
  ]);

  if (!assessment || !results.length) return null;

  const user = results[0].user;

  const competencyResults = results.map(r => ({
    competencyId: r.competency?.id || null,
    competencyName: r.competency?.name || 'Unknown',
    category: r.competency?.category || '',
    finalScore: r.finalScore,
    level: r.level,
    recommendation: r.recommendation || '',
    scoreDetails: {
      selfScore: r.scoreDetails?.selfScore ?? 0,
      supervisorScore: r.scoreDetails?.supervisorScore ?? 0,
      weightUsed: r.scoreDetails?.weightUsed ?? { selfAssessment: 0, supervisor: 0 },
      calculation: r.scoreDetails?.calculation ?? '',
    },
    resultId: r.id,
  }));

  const overallScore = Math.round(
    competencyResults.reduce((s, cr) => s + cr.finalScore, 0) / competencyResults.length
  );

  const report = await prisma.report.upsert({
    where: { userId_assessmentId: { userId: user.id, assessmentId } },
    create: {
      userId: user.id,
      assessmentId,
      user_name: user.name || '',
      user_email: user.email || '',
      user_employeeId: user.employeeId || '',
      user_department: user.department || '',
      user_position: user.position || '',
      user_gender: user.gender || '',
      assessment_description: assessment.description || '',
      assessment_type: assessment.type || '',
      assessment_purpose: assessment.purpose || '',
      assessment_targetGroup: assessment.targetGroup || '',
      assessment_startDate: assessment.startDate || null,
      assessment_endDate: assessment.endDate || null,
      overallScore,
      overallLevel: assignLevel(overallScore),
      status: 'COMPLETE',
      generatedAt: new Date(),
    },
    update: {
      user_name: user.name || '',
      user_email: user.email || '',
      user_employeeId: user.employeeId || '',
      user_department: user.department || '',
      user_position: user.position || '',
      user_gender: user.gender || '',
      assessment_description: assessment.description || '',
      assessment_type: assessment.type || '',
      assessment_purpose: assessment.purpose || '',
      assessment_targetGroup: assessment.targetGroup || '',
      assessment_startDate: assessment.startDate || null,
      assessment_endDate: assessment.endDate || null,
      overallScore,
      overallLevel: assignLevel(overallScore),
      status: 'COMPLETE',
      generatedAt: new Date(),
    },
  });

  await prisma.reportCompetency.deleteMany({ where: { reportId: report.id } });
  if (competencyResults.length) {
    await prisma.reportCompetency.createMany({
      data: competencyResults.map(cr => ({
        reportId: report.id,
        competencyId: cr.competencyId,
        competencyName: cr.competencyName,
        category: cr.category,
        finalScore: cr.finalScore,
        level: cr.level,
        recommendation: cr.recommendation,
        scoreDetails: cr.scoreDetails,
        resultId: cr.resultId,
      })),
    });
  }

  return prisma.report.findUnique({
    where: { id: report.id },
    include: { competencyResults: true },
  });
};

const assignLevel = (score) => {
  if (score >= 85) return 'Expert';
  if (score >= 70) return 'Advanced';
  if (score >= 50) return 'Intermediate';
  return 'Basic';
};
