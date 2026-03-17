import User from '../models/User.js';
import Competency from '../models/Competency.js';
import Assessment from '../models/Assessment.js';
import Result from '../models/Result.js';
import Feedback from '../models/Feedback.js';
import Question from '../models/Question.js';
import AppError from '../utils/AppError.js';
import asyncHandler from '../utils/asyncHandler.js';
import Response from '../models/Response.js';

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

  return { $gte: start, $lte: now };
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
    levelDist, deptPerformance, scoreStats, questionsByCompetency
  ] = await Promise.all([
    User.countDocuments(),
    User.countDocuments({ status: 'ACTIVE' }),
    Competency.countDocuments(),
    Assessment.find().lean(),
    Result.countDocuments(dateMatch),
    Result.countDocuments({ ...dateMatch, status: 'PENDING' }),
    buildRecentActivity(),
    Competency.aggregate([
      { $group: { _id: '$category', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]),
    Assessment.aggregate([
      { $group: { _id: '$status', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]),
    buildAdminTrend(trendPoints),
    Result.aggregate([
      ...(dateRange ? [{ $match: { createdAt: dateRange } }] : []),
      { $group: { _id: '$level', count: { $sum: 1 }, avgScore: { $avg: '$finalScore' } } },
      { $sort: { avgScore: -1 } }
    ]),
    Result.aggregate([
      ...(dateRange ? [{ $match: { createdAt: dateRange, status: 'FINAL' } }] : [{ $match: { status: 'FINAL' } }]),
      {
        $lookup: {
          from: 'users', localField: 'userId', foreignField: '_id', as: 'user'
        }
      },
      { $unwind: '$user' },
      {
        $group: {
          _id: '$user.department',
          avgScore: { $avg: '$finalScore' },
          count: { $sum: 1 },
          employeeCount: { $addToSet: '$userId' }
        }
      },
      { $addFields: { employeeCount: { $size: '$employeeCount' } } },
      { $sort: { avgScore: -1 } },
      { $limit: 8 }
    ]),
    Result.aggregate([
      ...(dateRange ? [{ $match: { createdAt: dateRange, status: 'FINAL' } }] : [{ $match: { status: 'FINAL' } }]),
      {
        $group: {
          _id: null,
          avgScore: { $avg: '$finalScore' },
          maxScore: { $max: '$finalScore' },
          minScore: { $min: '$finalScore' },
          stdDev: { $stdDevPop: '$finalScore' }
        }
      }
    ]),
    // Questions per competency with category breakdown
    Question.aggregate([
      {
        $lookup: {
          from: 'competencies',
          localField: 'competencyId',
          foreignField: '_id',
          as: 'competency'
        }
      },
      { $unwind: '$competency' },
      {
        $group: {
          _id: { competencyId: '$competencyId', name: '$competency.name', category: '$competency.category' },
          total: { $sum: 1 },
          byType: { $push: '$type' },
          byTargetGroup: { $push: '$targetGroup' },
        }
      },
      { $sort: { total: -1 } },
      { $limit: 15 }
    ])
  ]);

  const activeAssessments = assessments.filter(a => a.status === 'ACTIVE').length;
  const completedAssessments = assessments.filter(a => a.status === 'COMPLETED').length;
  const draftAssessments = assessments.filter(a => a.status === 'DRAFT').length;
  const scheduledAssessments = assessments.filter(a => a.status === 'SCHEDULED').length;
  const scores = scoreStats[0] || {};
  const allTimeResults = await Result.countDocuments();

  res.status(200).json({
    status: 'success',
    data: {
      period,
      stats: {
        totalUsers, activeUsers, totalCompetencies,
        activeAssessments, completedAssessments, draftAssessments, scheduledAssessments,
        pendingResults, totalResults, allTimeResults,
        avgScore: scores.avgScore ? Math.round(scores.avgScore) : 0,
        maxScore: scores.maxScore || 0,
        minScore: scores.minScore || 0,
        stdDev: scores.stdDev ? Math.round(scores.stdDev * 10) / 10 : 0,
      },
      charts: {
        competencyDistribution: competencyCategories.map(i => ({ name: i._id || 'Other', value: i.count })),
        assessmentStatus: assessmentStatusDist.map(i => ({ name: i._id, value: i.count })),
        trend: trendData,
        levelDistribution: levelDist.map(i => ({ name: i._id, count: i.count, avg: Math.round(i.avgScore || 0) })),
        departmentPerformance: deptPerformance.map(d => ({
          name: d._id || 'Unknown',
          avgScore: Math.round(d.avgScore),
          count: d.count,
          employees: d.employeeCount
        })),
        questionsByCompetency: questionsByCompetency.map(q => {
          const typeCount = {};
          (q.byType || []).forEach(t => { typeCount[t] = (typeCount[t] || 0) + 1; });
          const tgCount = {};
          (q.byTargetGroup || []).forEach(t => { tgCount[t] = (tgCount[t] || 0) + 1; });
          return {
            name: q._id.name,
            category: q._id.category,
            total: q.total,
            types: typeCount,
            targetGroups: tgCount,
          };
        }),
      },
      recentActivity,
      quickStats: {
        completionRate: totalResults > 0
          ? Math.round(((totalResults - pendingResults) / totalResults) * 100) : 0,
        avgAssessmentsPerUser: totalUsers > 0
          ? parseFloat((allTimeResults / totalUsers).toFixed(1)) : 0,
      }
    }
  });
});

// ─── SUPERVISOR DASHBOARD ────────────────────────────────────────────────────
export const getSupervisorDashboardStats = asyncHandler(async (req, res) => {
  const supervisorId = req.user.id;
  const { period = 'quarterly' } = req.query;
  const dateRange = getDateRange(period);
  const dateMatch = dateRange ? { createdAt: dateRange } : {};

  const teamMembers = await User.find({ supervisorId, status: 'ACTIVE' })
    .select('_id name email department position gender').lean();
  const teamMemberIds = teamMembers.map(m => m._id);

  const [pendingEvals, allTeamResults, periodResults, teamTrend, competencyBreakdown, memberScores] = await Promise.all([
    buildPendingEvaluations(teamMembers),
    Result.find({ userId: { $in: teamMemberIds }, status: 'FINAL' }).lean(),
    Result.find({ userId: { $in: teamMemberIds }, status: 'FINAL', ...dateMatch }).lean(),
    buildTeamTrend(teamMemberIds, getTrendPoints(period)),
    Result.aggregate([
      { $match: { userId: { $in: teamMemberIds }, status: 'FINAL', ...(dateRange ? { createdAt: dateRange } : {}) } },
      { $lookup: { from: 'competencies', localField: 'competencyId', foreignField: '_id', as: 'competency' } },
      { $unwind: '$competency' },
      { $group: { _id: '$competency.name', avgScore: { $avg: '$finalScore' }, count: { $sum: 1 } } },
      { $sort: { avgScore: -1 } },
      { $limit: 6 }
    ]),
    Result.aggregate([
      { $match: { userId: { $in: teamMemberIds }, status: 'FINAL', ...(dateRange ? { createdAt: dateRange } : {}) } },
      { $group: { _id: '$userId', avgScore: { $avg: '$finalScore' }, count: { $sum: 1 }, latestLevel: { $last: '$level' } } }
    ])
  ]);

  const memberScoreMap = {};
  memberScores.forEach(s => { memberScoreMap[s._id.toString()] = s; });

  const enrichedMembers = teamMembers.map(m => {
    const score = memberScoreMap[m._id.toString()];
    return { ...m, avgScore: score ? Math.round(score.avgScore) : null, assessmentCount: score?.count || 0, latestLevel: score?.latestLevel || null };
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
        competencyBreakdown: competencyBreakdown.map(c => ({ name: c._id, avg: Math.round(c.avgScore), count: c.count }))
      }
    }
  });
});

// ─── EMPLOYEE DASHBOARD ──────────────────────────────────────────────────────
export const getEmployeeDashboardStats = asyncHandler(async (req, res) => {
  const employeeId = req.user.id;
  const { period = 'yearly' } = req.query;
  const dateRange = getDateRange(period);
  const dateMatch = dateRange ? { createdAt: dateRange } : {};

  const [allResults, periodResults, activeAssessmentsList, supervisor, competencyProgress, scoreTrend] = await Promise.all([
    Result.find({ userId: employeeId, status: 'FINAL' })
      .populate('competencyId', 'name category')
      .populate('assessmentId', 'description type')
      .sort({ createdAt: -1 }).lean(),
    Result.find({ userId: employeeId, status: 'FINAL', ...dateMatch })
      .populate('competencyId', 'name category').sort({ createdAt: -1 }).lean(),
    Assessment.find({ status: 'ACTIVE' }).populate('competencyId', 'name').lean(),
    User.findById(req.user.supervisorId).select('name email position department').lean(),
    Result.aggregate([
      { $match: { userId: employeeId, status: 'FINAL' } },
      { $lookup: { from: 'competencies', localField: 'competencyId', foreignField: '_id', as: 'competency' } },
      { $unwind: '$competency' },
      {
        $group: {
          _id: { competencyId: '$competencyId', name: '$competency.name', category: '$competency.category' },
          latestScore: { $last: '$finalScore' },
          bestScore: { $max: '$finalScore' },
          latestLevel: { $last: '$level' },
          attempts: { $sum: 1 },
          latestDate: { $last: '$createdAt' }
        }
      },
      { $sort: { latestDate: -1 } }
    ]),
    buildEmployeeTrend(employeeId, getTrendPoints(period))
  ]);

  const pendingAssessments = [];
  for (const a of activeAssessmentsList) {
    const submitted = await Response.findOne({ assessmentId: a._id, employeeId, respondentType: 'self', submittedAt: { $ne: null } }).lean();
    if (!submitted) pendingAssessments.push(a);
  }

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
        competenciesAssessed: [...new Set(allResults.map(r => r.competencyId?._id?.toString()))].length,
        levelCounts
      },
      pendingAssessments: pendingAssessments.slice(0, 3),
      recentResults: allResults.slice(0, 5),
      competencyProgress: competencyProgress.map(c => ({
        id: c._id.competencyId, name: c._id.name, category: c._id.category,
        latestScore: c.latestScore, bestScore: c.bestScore, latestLevel: c.latestLevel,
        attempts: c.attempts, latestDate: c.latestDate
      })),
      charts: { trend: scoreTrend },
      supervisor,
      nextDeadline: getNextDeadline(pendingAssessments)
    }
  });
});

// ─── HELPERS ──────────────────────────────────────────────────────────────────
const buildRecentActivity = async () => {
  const [assessments, results, users] = await Promise.all([
    Assessment.find().sort({ createdAt: -1 }).limit(4).populate('createdBy', 'name').lean(),
    Result.find().sort({ createdAt: -1 }).limit(4).populate('userId', 'name').populate('competencyId', 'name').lean(),
    User.find().sort({ createdAt: -1 }).limit(3).lean()
  ]);
  return [
    ...assessments.map(a => ({ type: 'assessment', desc: `New ${a.type}: ${(a.description || 'Untitled').substring(0, 40)}`, time: formatTimeAgo(a.createdAt), user: a.createdBy?.name || 'HR Admin', rawDate: a.createdAt, icon: 'clipboard' })),
    ...results.map(r => ({ type: 'result', desc: `${r.userId?.name || 'Employee'} — ${r.competencyId?.name || 'Assessment'} · ${r.level}`, time: formatTimeAgo(r.createdAt), user: r.userId?.name || 'System', rawDate: r.createdAt, icon: 'chart' })),
    ...users.map(u => ({ type: 'user', desc: `New employee: ${u.name}`, time: formatTimeAgo(u.createdAt), user: 'HR Admin', rawDate: u.createdAt, icon: 'user' }))
  ].sort((a, b) => new Date(b.rawDate) - new Date(a.rawDate)).slice(0, 8);
};

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const buildAdminTrend = async (points) => {
  const now = new Date();
  const trend = [];
  for (let i = points - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const next = new Date(d.getFullYear(), d.getMonth() + 1, 1);
    const [assessments, results, avg] = await Promise.all([
      Assessment.countDocuments({ createdAt: { $gte: d, $lt: next } }),
      Result.countDocuments({ createdAt: { $gte: d, $lt: next }, status: 'FINAL' }),
      Result.aggregate([{ $match: { createdAt: { $gte: d, $lt: next }, status: 'FINAL' } }, { $group: { _id: null, avg: { $avg: '$finalScore' } } }])
    ]);
    trend.push({ month: MONTH_NAMES[d.getMonth()], assessments, results, avgScore: avg[0] ? Math.round(avg[0].avg) : 0 });
  }
  return trend;
};

const buildTeamTrend = async (memberIds, points) => {
  const now = new Date();
  const trend = [];
  for (let i = points - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const next = new Date(d.getFullYear(), d.getMonth() + 1, 1);
    const r = await Result.aggregate([
      { $match: { userId: { $in: memberIds }, status: 'FINAL', createdAt: { $gte: d, $lt: next } } },
      { $group: { _id: null, avgScore: { $avg: '$finalScore' }, count: { $sum: 1 } } }
    ]);
    trend.push({ month: MONTH_NAMES[d.getMonth()], avgScore: r[0] ? Math.round(r[0].avgScore) : 0, count: r[0]?.count || 0 });
  }
  return trend;
};

const buildEmployeeTrend = async (employeeId, points) => {
  const now = new Date();
  const trend = [];
  for (let i = points - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const next = new Date(d.getFullYear(), d.getMonth() + 1, 1);
    const r = await Result.aggregate([
      { $match: { userId: employeeId, status: 'FINAL', createdAt: { $gte: d, $lt: next } } },
      { $group: { _id: null, avgScore: { $avg: '$finalScore' }, count: { $sum: 1 } } }
    ]);
    trend.push({ month: MONTH_NAMES[d.getMonth()], score: r[0] ? Math.round(r[0].avgScore) : null, count: r[0]?.count || 0 });
  }
  return trend;
};

const buildPendingEvaluations = async (teamMembers) => {
  const now = new Date();
  // Include SCHEDULED (not started yet) and ACTIVE assessments
  const assessments = await Assessment.find({
    $or: [{ type: 'SupervisorOnly' }, { type: 'Combined' }],
    status: { $in: ['ACTIVE', 'SCHEDULED'] },
  }).lean();

  const evals = [];
  for (const assessment of assessments) {
    const isScheduled = assessment.status === 'SCHEDULED' || (assessment.startDate && new Date(assessment.startDate) > now);

    for (const member of teamMembers) {
      // Check if supervisor already has a response (submitted or in-progress)
      const supervisorResponse = await Response.findOne({
        assessmentId: assessment._id,
        employeeId: member._id,
        respondentType: 'supervisor',
      }).lean();

      const supervisorSubmitted = !!(supervisorResponse?.submittedAt);

      // For dashboard "pending" count: only count ACTIVE + not yet submitted
      // For the pending list page: include already-submitted (so supervisor can update) until COMPLETED
      if (!isScheduled && supervisorSubmitted) continue; // fully done — skip for pending count

      if (assessment.type === 'Combined' && !isScheduled) {
        const selfDone = await Response.findOne({
          assessmentId: assessment._id,
          employeeId: member._id,
          respondentType: 'self',
          submittedAt: { $ne: null },
        }).lean();
        if (!selfDone) continue; // employee hasn't finished yet
      }

      const daysLeft = assessment.endDate
        ? Math.ceil((new Date(assessment.endDate) - now) / (1000 * 60 * 60 * 24))
        : null;

      evals.push({
        assessmentId: assessment._id,
        assessmentDescription: assessment.description,
        assessmentType: assessment.type,
        startDate: assessment.startDate,
        endDate: assessment.endDate,
        employeeId: member._id,
        employeeName: member.name,
        employeeDepartment: member.department,
        employeePosition: member.position,
        dueDate: assessment.endDate,
        daysLeft,
        isScheduled,
        supervisorSubmitted, // true = supervisor already evaluated → show "Update" UI
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
