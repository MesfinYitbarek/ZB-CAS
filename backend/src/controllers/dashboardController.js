import prisma from '../config/prisma.js';
import AppError from '../utils/AppError.js';
import asyncHandler from '../utils/asyncHandler.js';

// ─── TIME PERIOD HELPER ──────────────────────────────────────────────────────
const getDateRange = (period = 'all') => {
  const now = new Date();
  const start = new Date();

  switch (period) {
    case 'monthly':
      start.setMonth(start.getMonth() - 1);
      break;
    case 'quarterly':
      start.setMonth(start.getMonth() - 3);
      break;
    case 'semi':
      start.setMonth(start.getMonth() - 6);
      break;
    case 'yearly':
      start.setFullYear(start.getFullYear() - 1);
      break;
    case 'all':
    default:
      return null;
  }

  return { gte: start, lte: now };
};

const getTrendPoints = (period = 'semi') => {
  switch (period) {
    case 'monthly':   return 4;
    case 'quarterly': return 3;
    case 'semi':      return 6;
    case 'yearly':    return 12;
    case 'all':       return 12;
    default:          return 6;
  }
};

// ─── ADMIN DASHBOARD ─────────────────────────────────────────────────────────
export const getAdminDashboardStats = asyncHandler(async (req, res) => {
  const { period = 'semi' } = req.query;
  const dateRange = getDateRange(period);
  const dateMatch = dateRange ? { createdAt: dateRange } : {};
  const trendPoints = getTrendPoints(period);

  const [
    totalUsers, activeUsers, totalCompetencies, assessments,
    totalResults, pendingResults, recentActivity,
    competencyCategories, assessmentStatusDist, trendData,
    levelDist, deptPerformanceResults, scoreStatsResults, questionsRaw, allTimeResults,
    totalQuestions
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { status: 'ACTIVE' } }),
    prisma.competency.count(),
    prisma.assessment.findMany(),
    prisma.result.count({ where: dateRange ? { createdAt: dateRange } : undefined }),
    prisma.result.count({ where: { ...dateMatch, status: 'PENDING' } }),
    buildRecentActivity(),
    prisma.competency.groupBy({ by: ['category'], _count: { _all: true } }),
    prisma.assessment.groupBy({ by: ['status'], _count: { _all: true } }),
    buildAdminTrend(trendPoints),
    prisma.result.groupBy({
      by: ['level'],
      _count: { _all: true },
      _avg: { finalScore: true },
      where: { status: 'FINAL', ...(dateRange ? { createdAt: dateRange } : {}) },
    }),
    prisma.result.findMany({
      where: {
        status: 'FINAL',
        ...(dateRange ? { createdAt: dateRange } : {}),
      },
      include: { user: { select: { department: true } } },
    }),
    prisma.result.findMany({
      where: {
        status: 'FINAL',
        ...(dateRange ? { createdAt: dateRange } : {}),
      },
      select: { finalScore: true },
    }),
    prisma.question.findMany({
      include: { competency: { select: { name: true, category: true } } },
    }),
    prisma.result.count(),
    prisma.question.count(),
  ]);

  // Department performance: group in JS
  const deptMap = {};
  for (const r of deptPerformanceResults) {
    const dept = r.user?.department || 'Unknown';
    if (!deptMap[dept]) deptMap[dept] = { scores: [], userIds: new Set() };
    deptMap[dept].scores.push(r.finalScore);
    deptMap[dept].userIds.add(r.userId);
  }
  const deptPerformance = Object.entries(deptMap)
    .map(([dept, data]) => ({
      _id: dept,
      avgScore: data.scores.reduce((a, b) => a + b, 0) / data.scores.length,
      count: data.scores.length,
      employeeCount: data.userIds.size,
    }))
    .sort((a, b) => b.avgScore - a.avgScore)
    .slice(0, 8);

  // Score stats: compute in JS
  let scores = {};
  if (scoreStatsResults.length > 0) {
    const vals = scoreStatsResults.map(r => r.finalScore);
    const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
    const max = Math.max(...vals);
    const min = Math.min(...vals);
    const variance = vals.reduce((s, v) => s + Math.pow(v - avg, 2), 0) / vals.length;
    const stdDev = Math.sqrt(variance);
    scores = { avgScore: avg, maxScore: max, minScore: min, stdDev };
  }

  // Questions by competency: group in JS
  const qByComp = {};
  for (const q of questionsRaw) {
    const comp = q.competency;
    if (!comp) continue;
    const key = q.competencyId;
    if (!qByComp[key]) qByComp[key] = { name: comp.name, category: comp.category, total: 0, byType: {}, byTargetGroup: {} };
    qByComp[key].total += 1;
    const t = String(q.type);
    qByComp[key].byType[t] = (qByComp[key].byType[t] || 0) + 1;
    const tg = String(q.targetGroup);
    qByComp[key].byTargetGroup[tg] = (qByComp[key].byTargetGroup[tg] || 0) + 1;
  }
  const questionsByCompetency = Object.values(qByComp)
    .sort((a, b) => b.total - a.total)
    .slice(0, 15);

  const activeAssessments = assessments.filter(a => a.status === 'ACTIVE').length;
  const completedAssessments = assessments.filter(a => a.status === 'COMPLETED').length;
  const draftAssessments = assessments.filter(a => a.status === 'DRAFT').length;
  const scheduledAssessments = assessments.filter(a => a.status === 'SCHEDULED').length;

  res.status(200).json({
    status: 'success',
    data: {
      period,
      stats: {
        totalUsers, activeUsers, totalCompetencies,
        activeAssessments, completedAssessments, draftAssessments, scheduledAssessments,
        pendingResults, totalResults, allTimeResults, totalQuestions,
        avgScore: scores.avgScore ? Math.round(scores.avgScore) : 0,
        maxScore: scores.maxScore || 0,
        minScore: scores.minScore || 0,
        stdDev: scores.stdDev ? Math.round(scores.stdDev * 10) / 10 : 0,
      },
      charts: {
        competencyDistribution: competencyCategories.map(i => ({ name: i.category || 'Other', value: i._count._all })),
        assessmentStatus: assessmentStatusDist.map(i => ({ name: i.status, value: i._count._all })),
        trend: trendData,
        levelDistribution: levelDist.map(i => ({ name: i.level, count: i._count._all, avg: Math.round(i._avg.finalScore || 0) })),
        departmentPerformance: deptPerformance.map(d => ({
          name: d._id || 'Unknown',
          avgScore: Math.round(d.avgScore),
          count: d.count,
          employees: d.employeeCount,
        })),
        questionsByCompetency: questionsByCompetency.map(q => ({
          name: q.name,
          category: q.category,
          total: q.total,
          types: q.byType,
          targetGroups: q.byTargetGroup,
        })),
      },
      recentActivity,
      quickStats: {
        completionRate: totalResults > 0
          ? Math.round(((totalResults - pendingResults) / totalResults) * 100) : 0,
        avgAssessmentsPerUser: totalUsers > 0
          ? parseFloat((allTimeResults / totalUsers).toFixed(1)) : 0,
      },
    },
  });
});

// ─── SUPERVISOR DASHBOARD ────────────────────────────────────────────────────
export const getSupervisorDashboardStats = asyncHandler(async (req, res) => {
  const supervisorId = req.user.id;
  const { period = 'quarterly' } = req.query;
  const dateRange = getDateRange(period);
  const dateMatch = dateRange ? { createdAt: dateRange } : {};

  const teamMembers = await prisma.user.findMany({
    where: { supervisorId, status: 'ACTIVE' },
    select: { id: true, name: true, email: true, department: true, position: true, gender: true },
  });
  const teamMemberIds = teamMembers.map(m => m.id);

  const [pendingEvals, allTeamResults, periodResults, teamTrend, competencyBreakdownRaw, memberScoresRaw] = await Promise.all([
    buildPendingEvaluations(teamMembers),
    prisma.result.findMany({ where: { userId: { in: teamMemberIds }, status: 'FINAL' } }),
    prisma.result.findMany({ where: { userId: { in: teamMemberIds }, status: 'FINAL', ...dateMatch } }),
    buildTeamTrend(teamMemberIds, getTrendPoints(period)),
    prisma.result.findMany({
      where: {
        userId: { in: teamMemberIds },
        status: 'FINAL',
        ...(dateRange ? { createdAt: dateRange } : {}),
      },
      include: { competency: { select: { name: true } } },
    }),
    prisma.result.findMany({
      where: {
        userId: { in: teamMemberIds },
        status: 'FINAL',
        ...(dateRange ? { createdAt: dateRange } : {}),
      },
      orderBy: { createdAt: 'desc' },
    }),
  ]);

  // Competency breakdown: group in JS
  const compMap = {};
  for (const r of competencyBreakdownRaw) {
    const name = r.competency?.name || 'Unknown';
    if (!compMap[name]) compMap[name] = { scores: [] };
    compMap[name].scores.push(r.finalScore);
  }
  const competencyBreakdown = Object.entries(compMap)
    .map(([name, data]) => ({
      _id: name,
      avgScore: data.scores.reduce((a, b) => a + b, 0) / data.scores.length,
      count: data.scores.length,
    }))
    .sort((a, b) => b.avgScore - a.avgScore)
    .slice(0, 6);

  // Member scores: group in JS
  const memberScoreMap = {};
  for (const r of memberScoresRaw) {
    const uid = r.userId;
    if (!memberScoreMap[uid]) memberScoreMap[uid] = { scores: [], latestLevel: r.level, count: 0 };
    memberScoreMap[uid].scores.push(r.finalScore);
    memberScoreMap[uid].count += 1;
    memberScoreMap[uid].latestLevel = r.level;
  }

  const enrichedMembers = teamMembers.map(m => {
    const score = memberScoreMap[m.id];
    const avgScore = score ? score.scores.reduce((a, b) => a + b, 0) / score.scores.length : null;
    return {
      ...m,
      id: m.id,
      _id: m.id,
      avgScore: avgScore !== null ? Math.round(avgScore) : null,
      assessmentCount: score?.count || 0,
      latestLevel: score?.latestLevel || null,
    };
  });

  res.status(200).json({
    status: 'success',
    data: {
      period,
      stats: {
        teamSize: teamMembers.length,
        pendingEvaluations: pendingEvals.filter(e => !e.isScheduled && !e.supervisorSubmitted).length,
        completedEvaluations: allTeamResults.length,
        teamAvgScore: allTeamResults.length > 0 ? Math.round(allTeamResults.reduce((s, r) => s + r.finalScore, 0) / allTeamResults.length) : 0,
        periodAvgScore: periodResults.length > 0 ? Math.round(periodResults.reduce((s, r) => s + r.finalScore, 0) / periodResults.length) : 0,
        periodResultCount: periodResults.length,
      },
      teamMembers: enrichedMembers,
      pendingEvaluations: pendingEvals.slice(0, 10),
      charts: {
        trend: teamTrend,
        competencyBreakdown: competencyBreakdown.map(c => ({ name: c._id, avg: Math.round(c.avgScore), count: c.count })),
      },
    },
  });
});

// ─── EMPLOYEE DASHBOARD ──────────────────────────────────────────────────────
export const getEmployeeDashboardStats = asyncHandler(async (req, res) => {
  const employeeId = req.user.id;
  const { period = 'yearly' } = req.query;
  const dateRange = getDateRange(period);
  const dateMatch = dateRange ? { createdAt: dateRange } : {};

  const [allResultsRaw, periodResultsRaw, activeAssessmentsList, supervisor, competencyProgressRaw, scoreTrend] = await Promise.all([
    prisma.result.findMany({
      where: { userId: employeeId, status: 'FINAL' },
      include: {
        competency: { select: { id: true, name: true, category: true } },
        assessment: { select: { id: true, description: true, type: true } },
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.result.findMany({
      where: { userId: employeeId, status: 'FINAL', ...dateMatch },
      include: {
        competency: { select: { id: true, name: true, category: true } },
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.assessment.findMany({
      where: { status: 'ACTIVE' },
      include: { competency: { select: { id: true, name: true } } },
    }),
    req.user.supervisorId
      ? prisma.user.findUnique({ where: { id: req.user.supervisorId }, select: { id: true, name: true, email: true, position: true, department: true } })
      : null,
    prisma.result.findMany({
      where: { userId: employeeId, status: 'FINAL' },
      include: { competency: { select: { id: true, name: true, category: true } } },
    }),
    buildEmployeeTrend(employeeId, getTrendPoints(period)),
  ]);

  // Map results to include _id and flattened competencyId/assessmentId for frontend
  const allResults = allResultsRaw.map(r => ({
    _id: r.id,
    id: r.id,
    finalScore: r.finalScore,
    level: r.level,
    createdAt: r.createdAt,
    competencyId: r.competency,
    assessmentId: r.assessment,
  }));
  const periodResults = periodResultsRaw.map(r => ({
    _id: r.id,
    id: r.id,
    finalScore: r.finalScore,
    level: r.level,
    createdAt: r.createdAt,
    competencyId: r.competency,
  }));

  // Pending assessments: check self-submission
  const pendingAssessments = [];
  for (const a of activeAssessmentsList) {
    const submitted = await prisma.response.findFirst({
      where: {
        assessmentId: a.id,
        employeeId,
        respondentType: 'self',
        submittedAt: { not: null },
      },
    });
    if (!submitted) pendingAssessments.push({ ...a, _id: a.id });
  }

  // Competency progress: group in JS
  const compProgressMap = {};
  for (const r of competencyProgressRaw) {
    const comp = r.competency;
    if (!comp) continue;
    const key = comp.id;
    if (!compProgressMap[key]) {
      compProgressMap[key] = { name: comp.name, category: comp.category, scores: [], levels: [], dates: [] };
    }
    compProgressMap[key].scores.push(r.finalScore);
    compProgressMap[key].levels.push({ level: r.level, date: r.createdAt });
    compProgressMap[key].dates.push(r.createdAt);
  }
  const competencyProgress = Object.entries(compProgressMap)
    .map(([compId, data]) => {
      const sortedDates = data.levels.sort((a, b) => new Date(b.date) - new Date(a.date));
      return {
        id: compId,
        name: data.name,
        category: data.category,
        latestScore: sortedDates.length > 0
          ? data.scores[data.dates.indexOf(sortedDates[0].date)] : null,
        bestScore: Math.max(...data.scores),
        latestLevel: sortedDates.length > 0 ? sortedDates[0].level : null,
        attempts: data.scores.length,
        latestDate: data.dates.sort((a, b) => new Date(b) - new Date(a))[0],
      };
    })
    .sort((a, b) => new Date(b.latestDate) - new Date(a.latestDate));

  const avgScore = allResults.length > 0 ? Math.round(allResults.reduce((s, r) => s + r.finalScore, 0) / allResults.length) : 0;
  const periodAvgScore = periodResults.length > 0 ? Math.round(periodResults.reduce((s, r) => s + r.finalScore, 0) / periodResults.length) : 0;
  const levelCounts = allResults.reduce((acc, r) => { acc[r.level] = (acc[r.level] || 0) + 1; return acc; }, {});

  res.status(200).json({
    status: 'success',
    data: {
      period,
      stats: {
        pendingAssessments: pendingAssessments.length,
        completedAssessments: allResults.length,
        totalAssessments: pendingAssessments.length + allResults.length,
        avgScore, periodAvgScore, periodResultCount: periodResults.length,
        competenciesAssessed: [...new Set(allResults.map(r => r.competencyId?.id).filter(Boolean))].length,
        levelCounts,
      },
      pendingAssessments: pendingAssessments.slice(0, 3),
      recentResults: allResults.slice(0, 5),
      competencyProgress,
      charts: { trend: scoreTrend },
      supervisor,
      nextDeadline: getNextDeadline(pendingAssessments),
    },
  });
});

// ─── HELPERS ──────────────────────────────────────────────────────────────────
const buildRecentActivity = async () => {
  const [assessments, results, users] = await Promise.all([
    prisma.assessment.findMany({
      orderBy: { createdAt: 'desc' },
      take: 4,
      include: { creator: { select: { name: true } } },
    }),
    prisma.result.findMany({
      where: { status: 'FINAL' },
      orderBy: { createdAt: 'desc' },
      take: 4,
      include: { user: { select: { name: true } }, competency: { select: { name: true } } },
    }),
    prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      take: 3,
      select: { id: true, name: true, createdAt: true },
    }),
  ]);

  return [
    ...assessments.map(a => ({ type: 'assessment', desc: `New ${a.type}: ${(a.description || 'Untitled').substring(0, 40)}`, time: formatTimeAgo(a.createdAt), user: a.creator?.name || 'HR Admin', rawDate: a.createdAt, icon: 'clipboard' })),
    ...results.map(r => ({ type: 'result', desc: `${r.user?.name || 'Employee'} — ${r.competency?.name || 'Assessment'} · ${r.level}`, time: formatTimeAgo(r.createdAt), user: r.user?.name || 'System', rawDate: r.createdAt, icon: 'chart' })),
    ...users.map(u => ({ type: 'user', desc: `New employee: ${u.name}`, time: formatTimeAgo(u.createdAt), user: 'HR Admin', rawDate: u.createdAt, icon: 'user' })),
  ].sort((a, b) => new Date(b.rawDate) - new Date(a.rawDate)).slice(0, 8);
};

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const buildAdminTrend = async (points) => {
  const now = new Date();
  const trend = [];
  for (let i = points - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const next = new Date(d.getFullYear(), d.getMonth() + 1, 1);
    const where = { createdAt: { gte: d, lt: next } };
    const [assessments, results, avg] = await Promise.all([
      prisma.assessment.count({ where }),
      prisma.result.count({ where: { ...where, status: 'FINAL' } }),
      prisma.result.aggregate({ where: { ...where, status: 'FINAL' }, _avg: { finalScore: true } }),
    ]);
    trend.push({ month: MONTH_NAMES[d.getMonth()], assessments, results, avgScore: avg._avg.finalScore ? Math.round(avg._avg.finalScore) : 0 });
  }
  return trend;
};

const buildTeamTrend = async (memberIds, points) => {
  const now = new Date();
  const trend = [];
  for (let i = points - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const next = new Date(d.getFullYear(), d.getMonth() + 1, 1);
    const r = await prisma.result.aggregate({
      where: { userId: { in: memberIds }, status: 'FINAL', createdAt: { gte: d, lt: next } },
      _avg: { finalScore: true },
      _count: true,
    });
    trend.push({ month: MONTH_NAMES[d.getMonth()], avgScore: r._avg.finalScore ? Math.round(r._avg.finalScore) : 0, count: r._count || 0 });
  }
  return trend;
};

const buildEmployeeTrend = async (employeeId, points) => {
  const now = new Date();
  const trend = [];
  for (let i = points - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const next = new Date(d.getFullYear(), d.getMonth() + 1, 1);
    const r = await prisma.result.aggregate({
      where: { userId: employeeId, status: 'FINAL', createdAt: { gte: d, lt: next } },
      _avg: { finalScore: true },
      _count: true,
    });
    trend.push({ month: MONTH_NAMES[d.getMonth()], score: r._avg.finalScore ? Math.round(r._avg.finalScore) : null, count: r._count || 0 });
  }
  return trend;
};

const buildPendingEvaluations = async (teamMembers) => {
  const now = new Date();
  const assessments = await prisma.assessment.findMany({
    where: {
      OR: [{ type: 'SupervisorOnly' }, { type: 'Combined' }],
      status: { in: ['ACTIVE', 'SCHEDULED'] },
    },
  });

  const evals = [];
  for (const assessment of assessments) {
    const isScheduled = assessment.status === 'SCHEDULED' || (assessment.startDate && new Date(assessment.startDate) > now);

    for (const member of teamMembers) {
      const supervisorResponse = await prisma.response.findFirst({
        where: {
          assessmentId: assessment.id,
          employeeId: member.id,
          respondentType: 'supervisor',
        },
      });

      const supervisorSubmitted = !!(supervisorResponse?.submittedAt);

      if (!isScheduled && supervisorSubmitted) continue;

      const daysLeft = assessment.endDate
        ? Math.ceil((new Date(assessment.endDate) - now) / (1000 * 60 * 60 * 24))
        : null;

      evals.push({
        assessmentId: assessment.id,
        assessmentDescription: assessment.description,
        assessmentType: assessment.type,
        startDate: assessment.startDate,
        endDate: assessment.endDate,
        employeeId: member.id,
        employeeName: member.name,
        employeeDepartment: member.department,
        employeePosition: member.position,
        dueDate: assessment.endDate,
        daysLeft,
        isScheduled,
        supervisorSubmitted,
        priority: isScheduled ? 'SCHEDULED' : (daysLeft !== null ? (daysLeft <= 2 ? 'HIGH' : daysLeft <= 7 ? 'MEDIUM' : 'LOW') : 'LOW'),
      });
    }
  }

  const ORDER = { HIGH: 0, MEDIUM: 1, LOW: 2, SCHEDULED: 3 };
  return evals.sort((a, b) => (ORDER[a.priority] ?? 9) - (ORDER[b.priority] ?? 9));
};

const formatTimeAgo = (date) => {
  const s = Math.floor((new Date() - new Date(date)) / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60); if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24); if (d < 7) return `${d}d ago`;
  return new Date(date).toLocaleDateString();
};

const getNextDeadline = (assessments) => {
  if (!assessments.length) return null;
  const upcoming = assessments.filter(a => a.endDate).sort((a, b) => new Date(a.endDate) - new Date(b.endDate))[0];
  return upcoming ? { id: upcoming._id, name: upcoming.description, date: upcoming.endDate, daysLeft: Math.ceil((new Date(upcoming.endDate) - new Date()) / (1000 * 60 * 60 * 24)) } : null;
};

export const getDashboardByRole = asyncHandler(async (req, res, next) => {
  if (req.user.role === 'HR_ADMIN') return getAdminDashboardStats(req, res, next);
  if (req.user.role === 'SUPERVISOR') return getSupervisorDashboardStats(req, res, next);
  return getEmployeeDashboardStats(req, res, next);
});
