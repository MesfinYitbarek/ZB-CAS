// controllers/supervisorController.js
const User = require('../models/User');
const Result = require('../models/Result');
const Assessment = require('../models/Assessment');
const Response = require('../models/Response');
const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');

/**
 * Get all statistics for a supervisor dashboard
 */
exports.getSupervisorDashboardStats = asyncHandler(async (req, res) => {
  try {
    const supervisorId = req.user.id;

    // 1️⃣ Get team members supervised by this user
    const teamMembers = await User.find({ supervisorId, role: 'EMPLOYEE' });

    // 2️⃣ Get all results for the team
    const teamResults = await Result.find({ userId: { $in: teamMembers.map(m => m._id) } });

    // Calculate stats
    const completedEvaluations = teamResults.filter(r => r.status === 'FINAL').length;
    const teamAvgScore = teamResults.length > 0
      ? Math.round(teamResults.reduce((sum, r) => sum + r.finalScore, 0) / teamResults.length)
      : 0;

    // 3️⃣ Get all active assessments
    const activeAssessments = await Assessment.find({ status: 'ACTIVE' });

    // 4️⃣ Find pending assessments for supervisor
    const pendingEvaluations = [];

    for (const assessment of activeAssessments) {
      if (assessment.type !== 'SupervisorOnly' && assessment.type !== 'Combined') continue;

      for (const member of teamMembers) {
        const responses = await Response.find({ assessmentId: assessment._id, userId: member._id });

        const supervisorResponse = responses.find(r => r.respondentType === 'supervisor');
        const employeeResponse = responses.find(r => r.respondentType === 'employee');

        const selfComplete = assessment.type === 'Combined' ? !!employeeResponse?.submittedAt : true;

        if (!supervisorResponse?.submittedAt && selfComplete) {
          pendingEvaluations.push({
            assessmentId: assessment._id,
            assessmentName: assessment.description,
            type: assessment.type,
            employeeId: member._id,
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
        teamMembers,
        pendingEvaluations,
        teamResults,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: 'error', message: 'Failed to load supervisor dashboard stats' });
  }
});

// ─── GET EVALUATION PROGRESS ────────────────────────────────────────────────
exports.getEvaluationProgress = asyncHandler(async (req, res, next) => {
  const { assessmentId, employeeId } = req.params;
  const supervisorId = req.user.id;

  // Verify supervisor has access to this employee
  const employee = await User.findOne({
    _id: employeeId,
    supervisorId: supervisorId
  });

  if (!employee) {
    return next(new AppError('Access denied or employee not found.', 403));
  }

  const assessment = await Assessment.findById(assessmentId).lean();
  if (!assessment) {
    return next(new AppError('Assessment not found.', 404));
  }

  // Count total questions
  const totalQuestions = assessment.questionIds.length;

  // Count supervisor's answered questions for this employee
  const answeredCount = await Response.countDocuments({
    assessmentId,
    employeeId,
    userId: supervisorId,
    respondentType: 'supervisor',
    selectedAnswer: { $ne: null }
  });

  // Check if already submitted
  const submitted = await Response.findOne({
    assessmentId,
    employeeId,
    userId: supervisorId,
    respondentType: 'supervisor',
    submittedAt: { $ne: null }
  });

  res.status(200).json({
    status: 'success',
    data: {
      totalQuestions,
      answeredCount,
      percentage: totalQuestions > 0 
        ? Math.round((answeredCount / totalQuestions) * 100)
        : 0,
      isSubmitted: !!submitted
    }
  });
});

// ─── GET PENDING EVALUATIONS ─────────────────────────────────────────────────
exports.getPendingEvaluations = asyncHandler(async (req, res) => {
  const supervisorId = req.user.id;
  
  // Get supervisor's team
  const teamMembers = await User.find({ 
    supervisorId,
    status: 'ACTIVE'
  }).select('_id name email position department').lean();

  const teamMemberIds = teamMembers.map(m => m._id);

  // Get active assessments with pending evaluations
  const activeAssessments = await Assessment.find({
    status: 'ACTIVE',
    $or: [
      { type: 'SupervisorOnly' },
      { type: 'Combined' }
    ],
    'supervisorEvaluations': {
      $elemMatch: {
        supervisorId,
        employeeId: { $in: teamMemberIds },
        status: 'PENDING'
      }
    }
  })
  .populate('competencyId', 'name category')
  .populate('supervisorEvaluations.employeeId', 'name email position')
  .lean();

  // Format the response
  const pendingEvaluations = [];
  
  activeAssessments.forEach(assessment => {
    assessment.supervisorEvaluations.forEach(eval => {
      if (eval.supervisorId.toString() === supervisorId.toString() && 
          eval.status === 'PENDING') {
        
        pendingEvaluations.push({
          assessmentId: assessment._id,
          assessmentDescription: assessment.description,
          assessmentType: assessment.type,
          competency: assessment.competencyId,
          startDate: assessment.startDate,
          endDate: assessment.endDate,
          employee: eval.employeeId,
          weight: assessment.weight,
          priority: getPriority(assessment.endDate)
        });
      }
    });
  });

  // Sort by priority and due date
  pendingEvaluations.sort((a, b) => {
    if (a.priority !== b.priority) {
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    }
    return new Date(a.endDate) - new Date(b.endDate);
  });

  res.status(200).json({
    status: 'success',
    data: { pendingEvaluations }
  });
});

// ─── UPDATE EVALUATION STATUS ────────────────────────────────────────────────
exports.updateEvaluationStatus = asyncHandler(async (req, res, next) => {
  const { assessmentId, employeeId } = req.params;
  const { status } = req.body;

  const assessment = await Assessment.findById(assessmentId);
  if (!assessment) {
    return next(new AppError('Assessment not found.', 404));
  }

  // Find the evaluation
  const evaluation = assessment.supervisorEvaluations.find(
    eval => eval.employeeId.toString() === employeeId && 
            eval.supervisorId.toString() === req.user.id
  );

  if (!evaluation) {
    return next(new AppError('Evaluation not found or access denied.', 404));
  }

  evaluation.status = status;
  evaluation.completedAt = status === 'COMPLETED' ? new Date() : null;
  
  await assessment.save();

  res.status(200).json({
    status: 'success',
    data: { evaluation }
  });
});

// Helper functions
function getPriority(endDate) {
  const now = new Date();
  const end = new Date(endDate);
  const daysLeft = Math.ceil((end - now) / (1000 * 60 * 60 * 24));
  
  if (daysLeft <= 1) return 'HIGH';
  if (daysLeft <= 3) return 'MEDIUM';
  return 'LOW';
}

const priorityOrder = { HIGH: 1, MEDIUM: 2, LOW: 3 };

