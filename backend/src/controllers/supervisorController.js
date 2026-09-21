import prisma from '../config/prisma.js';
import AppError from '../utils/AppError.js';
import asyncHandler from '../utils/asyncHandler.js';

/**
 * Get all statistics for a supervisor dashboard
 */
export const getSupervisorDashboardStats = asyncHandler(async (req, res) => {
  try {
    const supervisorId = req.user.id;

    // 1. Get team members supervised by this user (explicit safe select —
    //    never pull passwordHash/refreshToken into supervisor payloads).
    const teamMembers = await prisma.user.findMany({
      where: { supervisorId, roles: { has: 'EMPLOYEE' } },
      select: {
        id: true,
        name: true,
        email: true,
        employeeId: true,
        position: true,
        department: true,
        roles: true,
        gender: true,
        status: true,
        supervisorId: true,
        createdAt: true,
      },
    });

    const teamIds = teamMembers.map(m => m.id);

    // 2. Get all results for the team
    const teamResults = teamIds.length
      ? await prisma.result.findMany({ where: { userId: { in: teamIds }, status: 'FINAL' } })
      : [];

    const completedEvaluations = teamResults.filter(r => r.status === 'FINAL').length;
    const teamAvgScore = teamResults.length > 0
      ? Math.round(teamResults.reduce((sum, r) => sum + r.finalScore, 0) / teamResults.length)
      : 0;

    // 3. Get all active assessments
    const activeAssessments = await prisma.assessment.findMany({ where: { status: 'ACTIVE' } });

    // 4. Find pending assessments for supervisor
    const pendingEvaluations = [];

    for (const assessment of activeAssessments) {
      if (assessment.type !== 'SupervisorOnly' && assessment.type !== 'Combined') continue;

      const responses = teamIds.length
        ? await prisma.response.findMany({
            where: { assessmentId: assessment.id, employeeId: { in: teamIds } },
          })
        : [];

      for (const member of teamMembers) {
        const memberResponses = responses.filter(r => r.employeeId === member.id);
        const supervisorResponse = memberResponses.find(r => r.respondentType === 'supervisor');
        const employeeResponse = memberResponses.find(r => r.respondentType === 'self');

        const selfComplete = assessment.type === 'Combined' ? !!employeeResponse?.submittedAt : true;

        if (!supervisorResponse?.submittedAt && selfComplete) {
          pendingEvaluations.push({
            assessmentId: assessment.id,
            assessmentName: assessment.description,
            type: assessment.type,
            employeeId: member.id,
            employeeName: member.name,
          });
        }
      }
    }

    res.status(200).json({
      status: 'success',
      data: {
        stats: {
          teamMembers: teamMembers.length,
          completedEvaluations,
          teamAvgScore,
          pendingEvaluations: pendingEvaluations.length,
        },
        teamMembers: teamMembers.map(m => ({ _id: m.id, ...m })),
        pendingEvaluations,
        teamResults: teamResults.map(r => ({ _id: r.id, ...r })),
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: 'error', message: 'Failed to load supervisor dashboard stats' });
  }
});

// ─── GET PENDING EVALUATIONS ─────────────────────────────────────────────────
export const getPendingEvaluations = asyncHandler(async (req, res) => {
  const supervisorId = req.user.id;
  const now = new Date();

  // Get supervisor's team
  const teamMembers = await prisma.user.findMany({
    where: { supervisorId, status: 'ACTIVE' },
    select: { id: true, name: true, email: true, position: true, department: true },
  });

  // Include ACTIVE and SCHEDULED supervisor/combined assessments
  const assessments = await prisma.assessment.findMany({
    where: {
      status: { in: ['ACTIVE', 'SCHEDULED'] },
      OR: [{ type: 'SupervisorOnly' }, { type: 'Combined' }],
    },
    include: { competency: { select: { id: true, name: true, category: true } } },
  });

  const pendingEvaluations = [];

  for (const assessment of assessments) {
    const isScheduled =
      assessment.status === 'SCHEDULED' ||
      (assessment.startDate && new Date(assessment.startDate) > now);

    const supervisorResponses = await prisma.response.findMany({
      where: {
        assessmentId: assessment.id,
        employeeId: { in: teamMembers.map(m => m.id) },
        respondentType: 'supervisor',
      },
      select: { employeeId: true, submittedAt: true },
    });
    const submittedMap = {};
    supervisorResponses.forEach(r => { submittedMap[r.employeeId] = !!r.submittedAt; });

    for (const member of teamMembers) {
      const supervisorSubmitted = !!submittedMap[member.id];

      const daysLeft = assessment.endDate
        ? Math.ceil((new Date(assessment.endDate) - now) / (1000 * 60 * 60 * 24))
        : null;

      pendingEvaluations.push({
        assessmentId: assessment.id,
        assessmentDescription: assessment.description,
        assessmentType: assessment.type,
        competency: assessment.competency,
        startDate: assessment.startDate,
        endDate: assessment.endDate,
        employee: { _id: member.id, ...member },
        weight: { self: assessment.selfWeight, supervisor: assessment.supervisorWeight },
        isScheduled,
        supervisorSubmitted,
        priority: isScheduled ? 'SCHEDULED' : getPriority(assessment.endDate),
        daysRemaining: daysLeft,
      });
    }
  }

  const ORDER = { HIGH: 0, MEDIUM: 1, LOW: 2, SCHEDULED: 3 };
  pendingEvaluations.sort((a, b) => {
    const po = (ORDER[a.priority] ?? 9) - (ORDER[b.priority] ?? 9);
    if (po !== 0) return po;
    return new Date(a.endDate) - new Date(b.endDate);
  });

  res.status(200).json({ status: 'success', data: { pendingEvaluations } });
});

// Helper functions
function getPriority(endDate) {
  if (!endDate) return 'LOW';
  const daysLeft = Math.ceil((new Date(endDate) - new Date()) / (1000 * 60 * 60 * 24));
  if (daysLeft <= 1) return 'HIGH';
  if (daysLeft <= 3) return 'MEDIUM';
  return 'LOW';
}

const priorityOrder = { HIGH: 0, MEDIUM: 1, LOW: 2, SCHEDULED: 3 };
