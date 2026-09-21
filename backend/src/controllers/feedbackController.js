import prisma from '../config/prisma.js';
import AppError from '../utils/AppError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { denormalizeTargetGroup } from '../utils/targetGroup.js';

const feedbackInclude = {
  user: { select: { id: true, name: true, email: true, department: true, position: true, employeeId: true } },
  assessment: {
    select: {
      id: true, description: true, targetGroup: true, purpose: true, competencyId: true,
      competency: { select: { id: true, name: true, category: true } },
    },
  },
};

// ───────────────────────────────────────────────────────────────
// SUBMIT FEEDBACK
// ───────────────────────────────────────────────────────────────
export const createFeedback = asyncHandler(async (req, res, next) => {
  const { assessmentId, content, rating } = req.body;

  if (!assessmentId || !content) {
    return next(new AppError('Assessment ID and content are required.', 400));
  }

  if (req.user.role === 'EMPLOYEE') {
    const result = await prisma.result.findFirst({
      where: { userId: req.user.id, assessmentId, status: 'FINAL' },
      select: { id: true },
    });

    if (!result) {
      return next(new AppError('You can only submit feedback for assessments you have participated in.', 403));
    }

    const existing = await prisma.feedback.findFirst({
      where: { userId: req.user.id, assessmentId },
      select: { id: true },
    });

    if (existing) {
      return next(new AppError('You have already submitted feedback for this assessment.', 400));
    }
  }

  const feedback = await prisma.feedback.create({
    data: {
      userId: req.user.id,
      assessmentId,
      content,
      rating: rating || null,
    },
    include: feedbackInclude,
  });

  res.status(201).json({ status: 'success', data: { feedback: { ...feedback, _id: feedback.id } } });
});

// ───────────────────────────────────────────────────────────────
// LIST FEEDBACKS (Employee + Admin)
// ───────────────────────────────────────────────────────────────
export const getFeedbacks = asyncHandler(async (req, res) => {
  const { assessmentId, page = 1, limit = 20 } = req.query;

  const where = {};
  if (assessmentId) where.assessmentId = assessmentId;

  if (req.user.role === 'EMPLOYEE') {
    where.userId = req.user.id;
  } else if (req.user.role === 'SUPERVISOR') {
    const subs = await prisma.user.findMany({ where: { supervisorId: req.user.id }, select: { id: true } });
    where.userId = { in: subs.map(s => s.id) };
  }

  const pageNum = parseInt(page, 10);
  const limitNum = parseInt(limit, 10);
  const skip = (pageNum - 1) * limitNum;

  const [feedbacks, total] = await Promise.all([
    prisma.feedback.findMany({
      where,
      include: feedbackInclude,
      skip,
      take: limitNum,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.feedback.count({ where }),
  ]);

  res.status(200).json({
    status: 'success',
    data: {
      feedbacks: feedbacks.map(f => ({ ...f, _id: f.id })),
      pagination: { total, page: pageNum, limit: limitNum },
    },
  });
});

// ───────────────────────────────────────────────────────────────
// ADMIN SUMMARY BY ASSESSMENT
// ───────────────────────────────────────────────────────────────
export const getFeedbackSummaryByAssessment = asyncHandler(async (req, res) => {
  const { competencyId, dateFrom, dateTo } = req.query;

  const where = {};
  if (dateFrom || dateTo) {
    where.createdAt = {};
    if (dateFrom) where.createdAt.gte = new Date(dateFrom);
    if (dateTo) {
      const end = new Date(dateTo);
      end.setHours(23, 59, 59, 999);
      where.createdAt.lte = end;
    }
  }

  const feedbacks = await prisma.feedback.findMany({ where, select: { assessmentId: true, rating: true, createdAt: true } });
  const assessmentIds = [...new Set(feedbacks.map(f => f.assessmentId))];

  const assessments = assessmentIds.length
    ? await prisma.assessment.findMany({ where: { id: { in: assessmentIds } }, select: { id: true, description: true, targetGroup: true, purpose: true, competencyId: true } })
    : [];
  const compIds = [...new Set(assessments.map(a => a.competencyId))];
  const competencies = compIds.length
    ? await prisma.competency.findMany({ where: { id: { in: compIds } }, select: { id: true, name: true, category: true } })
    : [];

  const compMap = Object.fromEntries(competencies.map(c => [c.id, c]));

  const byAssessment = {};
  feedbacks.forEach(f => {
    if (!byAssessment[f.assessmentId]) byAssessment[f.assessmentId] = { ratings: [], total: 0, rated: 0, sum: 0 };
    byAssessment[f.assessmentId].total++;
    if (f.rating != null) { byAssessment[f.assessmentId].rated++; byAssessment[f.assessmentId].ratings.push(f.rating); byAssessment[f.assessmentId].sum += f.rating; }
  });

  function buildSummary(a) {
    const agg = byAssessment[a.id] || { ratings: [], total: 0, rated: 0, sum: 0 };
    const counts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    agg.ratings.forEach(r => { if (counts[r] !== undefined) counts[r]++; });
    return {
      assessmentId: a.id,
      assessmentDescription: a.description,
      competencyName: compMap[a.competencyId]?.name || 'N/A',
      competencyCategory: compMap[a.competencyId]?.category || 'N/A',
      targetGroup: denormalizeTargetGroup(a.targetGroup),
      purpose: a.purpose,
      avgRating: agg.rated ? Math.round((agg.sum / agg.rated) * 100) / 100 : null,
      totalFeedbacks: agg.total,
      ratedCount: agg.rated,
      rating5: counts[5], rating4: counts[4], rating3: counts[3], rating2: counts[2], rating1: counts[1],
    };
  }

  const summaries = assessments.map(buildSummary);

  const finalSummaries = competencyId
    ? assessments.filter(a => a.competencyId === competencyId).map(buildSummary)
    : summaries;

  finalSummaries.sort((a, b) => b.totalFeedbacks - a.totalFeedbacks);

  res.status(200).json({ status: 'success', data: { summaries: finalSummaries } });
});

// ───────────────────────────────────────────────────────────────
// ADMIN DETAIL (BY ASSESSMENT)
// ───────────────────────────────────────────────────────────────
export const getFeedbacksByAssessment = asyncHandler(async (req, res) => {
  const { assessmentId } = req.params;
  const { page = 1, limit = 20 } = req.query;

  const where = { assessmentId };
  const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);

  const [feedbacks, total] = await Promise.all([
    prisma.feedback.findMany({
      where,
      include: { user: { select: { id: true, name: true, email: true, department: true, position: true, employeeId: true } } },
      skip,
      take: parseInt(limit, 10),
      orderBy: { createdAt: 'desc' },
    }),
    prisma.feedback.count({ where }),
  ]);

  res.status(200).json({
    status: 'success',
    data: {
      feedbacks: feedbacks.map(f => ({ ...f, _id: f.id })),
      pagination: { total, page: parseInt(page, 10), limit: parseInt(limit, 10) },
    },
  });
});

// ─── GET EMPLOYEE'S ELIGIBLE ASSESSMENTS ──────────────────────────────────────
export const getEligibleAssessmentsForFeedback = asyncHandler(async (req, res) => {
  const [results, submittedResponses, submittedSecurity] = await Promise.all([
    prisma.result.findMany({ where: { userId: req.user.id, status: 'FINAL' }, select: { assessmentId: true }, distinct: ['assessmentId'] }),
    prisma.response.findMany({
      where: { userId: req.user.id, respondentType: 'self', submittedAt: { not: null } },
      select: { assessmentId: true },
      distinct: ['assessmentId'],
    }),
    prisma.securityViolation.findMany({
      where: { userId: req.user.id, submittedAt: { not: null } },
      select: { assessmentId: true },
      distinct: ['assessmentId'],
    }),
  ]);
  // A 0% submission (all unanswered) leaves no response row, and Combined
  // assessments only get a Result after admin scoring — treat any submitted
  // self response / security log / result as proof of completion.
  const resultIds = [...new Set([
    ...results.map(r => r.assessmentId),
    ...submittedResponses.map(r => r.assessmentId),
    ...submittedSecurity.map(r => r.assessmentId),
  ])];

  const existingFeedback = await prisma.feedback.findMany({
    where: { userId: req.user.id },
    select: { assessmentId: true },
    distinct: ['assessmentId'],
  });
  const existingIds = existingFeedback.map(f => f.assessmentId);

  const assessments = await prisma.assessment.findMany({
    where: {
      id: { in: resultIds },
      status: { in: ['COMPLETED', 'ACTIVE'] },
    },
    select: {
      id: true,
      description: true,
      competencyId: true,
      type: true,
      status: true,
      targetGroup: true,
      purpose: true,
      createdAt: true,
      competency: { select: { id: true, name: true, category: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  const assessesWithStatus = assessments.map(a => ({
    _id: a.id,
    id: a.id,
    description: a.description,
    competencyId: a.competency,
    type: a.type,
    status: a.status,
    targetGroup: denormalizeTargetGroup(a.targetGroup),
    purpose: a.purpose,
    createdAt: a.createdAt,
    alreadySubmitted: existingIds.includes(a.id),
  }));

  res.status(200).json({ status: 'success', data: { assessments: assessesWithStatus } });
});

// ─── GET ONE ──────────────────────────────────────────────────────────────────
export const getFeedback = asyncHandler(async (req, res, next) => {
  const feedback = await prisma.feedback.findUnique({ where: { id: req.params.id }, include: feedbackInclude });

  if (!feedback) return next(new AppError('Feedback not found.', 404));

  if (req.user.role === 'EMPLOYEE' && feedback.userId !== req.user.id) {
    return next(new AppError('Access denied.', 403));
  }

  if (req.user.role === 'SUPERVISOR') {
    const employee = await prisma.user.findUnique({
      where: { id: feedback.userId },
      select: { id: true, supervisorId: true },
    });
    if (!employee || employee.supervisorId !== req.user.id) {
      return next(new AppError('Access denied.', 403));
    }
  }

  res.status(200).json({ status: 'success', data: { feedback: { ...feedback, _id: feedback.id } } });
});
