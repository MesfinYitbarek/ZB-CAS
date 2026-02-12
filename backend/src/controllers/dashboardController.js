import User from '../models/User.js';
import Competency from '../models/Competency.js';
import Assessment from '../models/Assessment.js';
import Result from '../models/Result.js';
import Feedback from '../models/Feedback.js';
import AppError from '../utils/AppError.js';
import asyncHandler from '../utils/asyncHandler.js';
import Response from '../models/Response.js';
// ─── ADMIN DASHBOARD STATISTICS ──────────────────────────────────────────────
export const getAdminDashboardStats = asyncHandler(async (req, res) => {
  // 1️⃣ Basic Stats
  const [
    totalUsers,
    activeUsers,
    totalCompetencies,
    assessments,
    totalResults,
    pendingResults,
    recentAssessments,
    recentResults,
    recentUsers,
    recentFeedback,
    competencyCategories,
    assessmentStatusDist,
    monthlyTrends
  ] = await Promise.all([
    // User stats
    User.countDocuments(),
    User.countDocuments({ status: 'ACTIVE' }),
    
    // Competency stats
    Competency.countDocuments(),
    
    // Assessment stats
    Assessment.find().lean(),
    
    // Result stats
    Result.countDocuments(),
    Result.countDocuments({ status: 'PENDING' }),
    
    // Recent activity - assessments (last 5)
    Assessment.find()
      .sort({ createdAt: -1 })
      .limit(5)
      .populate('createdBy', 'name')
      .lean(),
    
    // Recent activity - results (last 5)
    Result.find()
      .sort({ createdAt: -1 })
      .limit(5)
      .populate('userId', 'name')
      .populate('competencyId', 'name')
      .lean(),
    
    // Recent activity - users (last 5)
    User.find()
      .sort({ createdAt: -1 })
      .limit(5)
      .lean(),
    
    // Recent activity - feedback (last 5, unreviewed first)
    Feedback.find()
      .sort({ reviewed: 1, createdAt: -1 })
      .limit(5)
      .populate('userId', 'name')
      .populate('assessmentId', 'description')
      .lean(),
    
    // Competency distribution by category
    Competency.aggregate([
      { $group: { _id: '$category', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]),
    
    // Assessment status distribution
    Assessment.aggregate([
      { $group: { _id: '$status', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]),
    
    // 6-month trend data
    getMonthlyTrends()
  ]);

  // Calculate assessment stats
  const activeAssessments = assessments.filter(a => a.status === 'ACTIVE').length;
  const completedAssessments = assessments.filter(a => a.status === 'COMPLETED').length;
  const draftAssessments = assessments.filter(a => a.status === 'DRAFT').length;
  const scheduledAssessments = assessments.filter(a => a.status === 'SCHEDULED').length;

  // Format competency distribution for chart
  const compData = competencyCategories.map(item => ({
    name: item._id || 'Uncategorized',
    value: item.count
  }));

  // Format assessment status for pie chart
  const statusData = assessmentStatusDist.map(item => ({
    name: item._id,
    value: item.count
  }));

  // Combine recent activity
  const recentActivity = [
    ...recentAssessments.map(a => ({
      type: 'assessment',
      desc: `New ${a.type} assessment created: ${a.description?.substring(0, 30)}${a.description?.length > 30 ? '...' : ''}`,
      time: formatTimeAgo(a.createdAt),
      user: a.createdBy?.name || 'HR Admin',
      rawDate: a.createdAt
    })),
    ...recentResults.map(r => ({
      type: 'result',
      desc: `Results finalized for ${r.userId?.name || 'employee'} - ${r.competencyId?.name || 'Competency'}: ${r.level}`,
      time: formatTimeAgo(r.createdAt),
      user: 'System',
      rawDate: r.createdAt
    })),
    ...recentUsers.map(u => ({
      type: 'user',
      desc: `New ${u.role} onboarded: ${u.name}`,
      time: formatTimeAgo(u.createdAt),
      user: 'HR Admin',
      rawDate: u.createdAt
    })),
    ...recentFeedback.map(f => ({
      type: 'feedback',
      desc: `New feedback received ${!f.reviewed ? '(pending review)' : ''}`,
      time: formatTimeAgo(f.createdAt),
      user: f.userId?.name || 'Employee',
      rawDate: f.createdAt
    }))
  ]
  .sort((a, b) => new Date(b.rawDate) - new Date(a.rawDate))
  .slice(0, 8);

  res.status(200).json({
    status: 'success',
    data: {
      stats: {
        totalUsers,
        activeUsers,
        totalCompetencies,
        activeAssessments,
        completedAssessments,
        draftAssessments,
        scheduledAssessments,
        pendingResults,
        totalResults,
      },
      charts: {
        competencyDistribution: compData,
        assessmentStatus: statusData,
        monthlyTrends
      },
      recentActivity,
      quickStats: {
        completionRate: totalResults > 0 
          ? Math.round(((totalResults - pendingResults) / totalResults) * 100) 
          : 0,
        avgAssessmentsPerUser: totalUsers > 0 
          ? (totalResults / totalUsers).toFixed(1) 
          : 0,
        feedbackPending: recentFeedback.filter(f => !f.reviewed).length
      }
    }
  });
});

// ─── SUPERVISOR DASHBOARD STATS ──────────────────────────────────────────────
export const getSupervisorDashboardStats = asyncHandler(async (req, res) => {
  const supervisorId = req.user.id;

  // Get team members
  const teamMembers = await User.find({ 
    supervisorId, 
    status: 'ACTIVE' 
  }).select('_id name email department position').lean();

  const teamMemberIds = teamMembers.map(m => m._id);

  // Get pending evaluations
  const pendingAssessments = await Assessment.find({
    status: 'ACTIVE',
    $or: [{ type: 'SupervisorOnly' }, { type: 'Combined' }]
  }).lean();

  const pendingEvaluations = [];
  
  for (const assessment of pendingAssessments) {
    for (const member of teamMembers) {
      const supervisorResponse = await Response.findOne({
        assessmentId: assessment._id,
        employeeId: member._id,
        respondentType: 'supervisor',
        submittedAt: null
      }).lean();

      if (supervisorResponse || !supervisorResponse) { // Needs evaluation if no response or draft
        const employeeResponse = await Response.findOne({
          assessmentId: assessment._id,
          employeeId: member._id,
          respondentType: 'self',
          submittedAt: { $ne: null }
        }).lean();

        const selfComplete = assessment.type === 'Combined' ? !!employeeResponse : true;
        
        if (selfComplete) {
          pendingEvaluations.push({
            assessmentId: assessment._id,
            assessmentName: assessment.description,
            employeeId: member._id,
            employeeName: member.name,
            dueDate: assessment.endDate
          });
        }
      }
    }
  }

  // Get team results
  const teamResults = await Result.find({
    userId: { $in: teamMemberIds },
    status: 'FINAL'
  })
  .populate('competencyId', 'name category')
  .sort({ createdAt: -1 })
  .limit(10)
  .lean();

  // Calculate team average score
  const allTeamResults = await Result.find({
    userId: { $in: teamMemberIds },
    status: 'FINAL'
  }).lean();

  const teamAvgScore = allTeamResults.length > 0
    ? Math.round(allTeamResults.reduce((sum, r) => sum + r.finalScore, 0) / allTeamResults.length)
    : 0;

  res.status(200).json({
    status: 'success',
    data: {
      stats: {
        teamSize: teamMembers.length,
        pendingEvaluations: pendingEvaluations.length,
        completedEvaluations: allTeamResults.length,
        teamAvgScore
      },
      teamMembers,
      pendingEvaluations: pendingEvaluations.slice(0, 5),
      recentResults: teamResults,
      quickActions: [
        { label: 'Evaluate Team', icon: 'clipboard', link: '/assessments' },
        { label: 'View Reports', icon: 'chart', link: '/reports' },
        { label: 'Team Feedback', icon: 'message', link: '/feedback' }
      ]
    }
  });
});

// ─── EMPLOYEE DASHBOARD STATS ───────────────────────────────────────────────
export const getEmployeeDashboardStats = asyncHandler(async (req, res) => {
  const employeeId = req.user.id;

  const [
    pendingAssessments,
    completedAssessments,
    recentResults,
    supervisor,
    feedback
  ] = await Promise.all([
    // Active assessments not yet submitted
    Assessment.find({
      status: 'ACTIVE',
      $or: [
        { 'target.department': req.user.department },
        { 'target.position': req.user.position },
        { 'target.department': null, 'target.position': null }
      ]
    })
    .populate('competencyId', 'name')
    .lean()
    .then(async (assessments) => {
      const pending = [];
      for (const a of assessments) {
        const submitted = await Response.findOne({
          assessmentId: a._id,
          employeeId,
          respondentType: 'self',
          submittedAt: { $ne: null }
        }).lean();
        if (!submitted) {
          pending.push({
            ...a,
            progress: await calculateProgress(a._id, employeeId)
          });
        }
      }
      return pending;
    }),
    
    // Completed assessments with results
    Result.find({ userId: employeeId, status: 'FINAL' })
      .populate('competencyId', 'name category')
      .populate('assessmentId', 'description type')
      .sort({ createdAt: -1 })
      .limit(5)
      .lean(),
    
    // Recent results
    Result.find({ userId: employeeId, status: 'FINAL' })
      .populate('competencyId', 'name')
      .sort({ createdAt: -1 })
      .limit(3)
      .lean(),
    
    // Supervisor info
    User.findById(req.user.supervisorId)
      .select('name email position')
      .lean(),
    
    // Recent feedback given
    Feedback.find({ userId: employeeId })
      .populate('assessmentId', 'description')
      .sort({ createdAt: -1 })
      .limit(3)
      .lean()
  ]);

  // Calculate overall average score
  const allResults = await Result.find({ userId: employeeId, status: 'FINAL' }).lean();
  const avgScore = allResults.length > 0
    ? Math.round(allResults.reduce((sum, r) => sum + r.finalScore, 0) / allResults.length)
    : 0;

  res.status(200).json({
    status: 'success',
    data: {
      stats: {
        pendingAssessments: pendingAssessments.length,
        completedAssessments: completedAssessments.length,
        totalAssessments: pendingAssessments.length + completedAssessments.length,
        avgScore,
        competenciesAssessed: [...new Set(allResults.map(r => r.competencyId?._id?.toString()))].length
      },
      pendingAssessments: pendingAssessments.slice(0, 3),
      recentResults,
      supervisor,
      recentFeedback: feedback,
      nextDeadline: getNextDeadline(pendingAssessments)
    }
  });
});

// ─── HELPER FUNCTIONS ────────────────────────────────────────────────────────

const getMonthlyTrends = async () => {
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

  const [monthlyAssessments, monthlyResults] = await Promise.all([
    Assessment.aggregate([
      { $match: { createdAt: { $gte: sixMonthsAgo } } },
      {
        $group: {
          _id: { $month: '$createdAt' },
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]),
    Result.aggregate([
      { $match: { createdAt: { $gte: sixMonthsAgo } } },
      {
        $group: {
          _id: { $month: '$createdAt' },
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ])
  ]);

  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const currentMonth = new Date().getMonth();
  
  const trends = [];
  for (let i = 5; i >= 0; i--) {
    const monthIndex = (currentMonth - i + 12) % 12;
    const monthName = monthNames[monthIndex];
    const monthNumber = monthIndex + 1;
    
    const assessments = monthlyAssessments.find(m => m._id === monthNumber)?.count || 0;
    const results = monthlyResults.find(m => m._id === monthNumber)?.count || 0;
    
    // Get cumulative results for trend
    const cumulativeResults = await Result.countDocuments({
      createdAt: {
        $gte: new Date(new Date().getFullYear(), monthIndex, 1),
        $lt: new Date(new Date().getFullYear(), monthIndex + 1, 1)
      }
    });
    
    trends.push({
      month: monthName,
      assessments,
      results: cumulativeResults || results
    });
  }
  
  return trends;
};

const formatTimeAgo = (date) => {
  const seconds = Math.floor((new Date() - new Date(date)) / 1000);
  
  if (seconds < 60) return `${seconds} sec ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} day${days > 1 ? 's' : ''} ago`;
  return new Date(date).toLocaleDateString();
};

const calculateProgress = async (assessmentId, employeeId) => {
  const assessment = await Assessment.findById(assessmentId).lean();
  if (!assessment) return 0;
  
  const totalQuestions = assessment.questionIds?.length || 0;
  if (totalQuestions === 0) return 0;
  
  const answeredCount = await Response.countDocuments({
    assessmentId,
    employeeId,
    respondentType: 'self',
    selectedAnswer: { $ne: null }
  });
  
  return Math.round((answeredCount / totalQuestions) * 100);
};

const getNextDeadline = (assessments) => {
  if (!assessments.length) return null;
  
  const upcoming = assessments
    .filter(a => a.endDate)
    .sort((a, b) => new Date(a.endDate) - new Date(b.endDate))[0];
  
  return upcoming ? {
    id: upcoming._id,
    name: upcoming.description,
    date: upcoming.endDate,
    daysLeft: Math.ceil((new Date(upcoming.endDate) - new Date()) / (1000 * 60 * 60 * 24))
  } : null;
};

// Add this function to your existing dashboardController.js
export const getDashboardByRole = asyncHandler(async (req, res, next) => {
  // Route to the appropriate dashboard based on user role
  if (req.user.role === 'HR_ADMIN') {
    return getAdminDashboardStats(req, res, next);
  } else if (req.user.role === 'SUPERVISOR') {
    return getSupervisorDashboardStats(req, res, next);
  } else {
    return getEmployeeDashboardStats(req, res, next);
  }
});