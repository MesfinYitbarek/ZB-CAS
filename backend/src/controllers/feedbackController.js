import mongoose from 'mongoose';
import Feedback from '../models/Feedback.js';
import Result from '../models/Result.js';
import Assessment from '../models/Assessment.js';
import AppError from '../utils/AppError.js';
import asyncHandler from '../utils/asyncHandler.js';


// ───────────────────────────────────────────────────────────────
// SUBMIT FEEDBACK
// Employees can only submit feedback for assessments they joined
// ───────────────────────────────────────────────────────────────
export const createFeedback = asyncHandler(async (req, res, next) => {
  const { assessmentId, content, rating } = req.body;

  if (!assessmentId || !content) {
    return next(new AppError('Assessment ID and content are required.', 400));
  }

  if (req.user.role === 'EMPLOYEE') {
    const result = await Result.findOne({
      userId: req.user.id,
      assessmentId,
    }).lean();

    if (!result) {
      return next(
        new AppError(
          'You can only submit feedback for assessments you have participated in.',
          403
        )
      );
    }

    const existing = await Feedback.findOne({
      userId: req.user.id,
      assessmentId,
    }).lean();

    if (existing) {
      return next(
        new AppError(
          'You have already submitted feedback for this assessment.',
          400
        )
      );
    }
  }

  const feedback = await Feedback.create({
    userId: req.user.id,
    assessmentId,
    content,
    rating: rating || null,
  });

  res.status(201).json({
    status: 'success',
    data: { feedback },
  });
});


// ───────────────────────────────────────────────────────────────
// LIST FEEDBACKS (Employee + Admin)
// ───────────────────────────────────────────────────────────────
export const getFeedbacks = asyncHandler(async (req, res) => {
  const { assessmentId, reviewed, page = 1, limit = 20 } = req.query;

  const filter = {};

  if (assessmentId) filter.assessmentId = assessmentId;
  if (reviewed !== undefined && reviewed !== '')
    filter.reviewed = reviewed === 'true';

  if (req.user.role === 'EMPLOYEE') {
    filter.userId = req.user.id;
  }

  const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);

  const [feedbacks, total] = await Promise.all([
    Feedback.find(filter)
      .populate('userId', 'name email department position employeeId')
      .populate('assessmentId', 'description competencyId targetGroup purpose')
      .skip(skip)
      .limit(parseInt(limit, 10))
      .sort({ createdAt: -1 })
      .lean(),
    Feedback.countDocuments(filter),
  ]);

  res.status(200).json({
    status: 'success',
    data: {
      feedbacks,
      pagination: {
        total,
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
      },
    },
  });
});


// ───────────────────────────────────────────────────────────────
// ADMIN SUMMARY (FIXED VERSION)
// ───────────────────────────────────────────────────────────────
export const getFeedbackSummaryByAssessment = asyncHandler(
  async (req, res) => {
    const { competencyId, dateFrom, dateTo } = req.query;

    const matchStage = {};

    if (dateFrom || dateTo) {
      matchStage.createdAt = {};
      if (dateFrom) matchStage.createdAt.$gte = new Date(dateFrom);

      if (dateTo) {
        const end = new Date(dateTo);
        end.setHours(23, 59, 59, 999);
        matchStage.createdAt.$lte = end;
      }
    }

    const pipeline = [
      ...(Object.keys(matchStage).length ? [{ $match: matchStage }] : []),

      // GROUP FEEDBACK
      {
        $group: {
          _id: '$assessmentId',
          avgRating: { $avg: '$rating' },
          totalFeedbacks: { $sum: 1 },
          ratedCount: {
            $sum: { $cond: [{ $ne: ['$rating', null] }, 1, 0] },
          },
          reviewedCount: {
            $sum: { $cond: ['$reviewed', 1, 0] },
          },
          ratings: { $push: '$rating' },
        },
      },

      // JOIN ASSESSMENT
      {
        $lookup: {
          from: 'assessments',
          localField: '_id',
          foreignField: '_id',
          as: 'assessment',
        },
      },
      {
        $unwind: {
          path: '$assessment',
          preserveNullAndEmptyArrays: true, // ✅ FIXED
        },
      },

      // JOIN COMPETENCY
      {
        $lookup: {
          from: 'competencies',
          localField: 'assessment.competencyId',
          foreignField: '_id',
          as: 'competency',
        },
      },
      {
        $unwind: {
          path: '$competency',
          preserveNullAndEmptyArrays: true, // ✅ FIXED
        },
      },

      ...(competencyId
        ? [
            {
              $match: {
                'assessment.competencyId':
                  new mongoose.Types.ObjectId(competencyId),
              },
            },
          ]
        : []),

      // FINAL SHAPE
      {
        $project: {
          assessmentId: '$_id',
          assessmentDescription: '$assessment.description',
          competencyName: '$competency.name',
          competencyCategory: '$competency.category',
          targetGroup: '$assessment.targetGroup',
          purpose: '$assessment.purpose',

          avgRating: { $round: ['$avgRating', 2] },

          totalFeedbacks: 1,
          ratedCount: 1,
          reviewedCount: 1,
          pendingReview: {
            $subtract: ['$totalFeedbacks', '$reviewedCount'],
          },

          rating5: {
            $size: {
              $filter: {
                input: '$ratings',
                as: 'r',
                cond: { $eq: ['$$r', 5] },
              },
            },
          },
          rating4: {
            $size: {
              $filter: {
                input: '$ratings',
                as: 'r',
                cond: { $eq: ['$$r', 4] },
              },
            },
          },
          rating3: {
            $size: {
              $filter: {
                input: '$ratings',
                as: 'r',
                cond: { $eq: ['$$r', 3] },
              },
            },
          },
          rating2: {
            $size: {
              $filter: {
                input: '$ratings',
                as: 'r',
                cond: { $eq: ['$$r', 2] },
              },
            },
          },
          rating1: {
            $size: {
              $filter: {
                input: '$ratings',
                as: 'r',
                cond: { $eq: ['$$r', 1] },
              },
            },
          },
        },
      },

      { $sort: { totalFeedbacks: -1 } },
    ];

    const summaries = await Feedback.aggregate(pipeline);

    res.status(200).json({
      status: 'success',
      data: { summaries },
    });
  }
);


// ───────────────────────────────────────────────────────────────
// ADMIN DETAIL (BY ASSESSMENT)
// ───────────────────────────────────────────────────────────────
export const getFeedbacksByAssessment = asyncHandler(
  async (req, res) => {
    const { assessmentId } = req.params;
    const { reviewed, page = 1, limit = 20 } = req.query;

    const filter = { assessmentId };

    if (reviewed !== undefined && reviewed !== '')
      filter.reviewed = reviewed === 'true';

    const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);

    const [feedbacks, total] = await Promise.all([
      Feedback.find(filter)
        .populate('userId', 'name email department position employeeId')
        .populate('reviewedBy', 'name')
        .skip(skip)
        .limit(parseInt(limit, 10))
        .sort({ createdAt: -1 })
        .lean(),
      Feedback.countDocuments(filter),
    ]);

    res.status(200).json({
      status: 'success',
      data: {
        feedbacks,
        pagination: {
          total,
          page: parseInt(page, 10),
          limit: parseInt(limit, 10),
        },
      },
    });
  }
);


// ───────────────────────────────────────────────────────────────
// MARK REVIEWED
// ───────────────────────────────────────────────────────────────
export const reviewFeedback = asyncHandler(async (req, res, next) => {
  const feedback = await Feedback.findById(req.params.id);

  if (!feedback) {
    return next(new AppError('Feedback not found.', 404));
  }

  feedback.reviewed = true;
  feedback.reviewedBy = req.user.id;
  feedback.reviewedAt = new Date();

  await feedback.save();

  res.status(200).json({
    status: 'success',
    data: { feedback },
  });
});


// ─── GET EMPLOYEE'S ELIGIBLE ASSESSMENTS (for employee feedback form) ─────────
export const getEligibleAssessmentsForFeedback = asyncHandler(async (req, res) => {
  // Find assessments where the employee has results (participated)
  const results = await Result.find({ userId: req.user.id })
    .distinct('assessmentId');

  // Find assessments where the employee hasn't submitted feedback yet
  const existingFeedback = await Feedback.find({ userId: req.user.id })
    .distinct('assessmentId');

  const existingIds = existingFeedback.map(id => id.toString());

  const assessments = await Assessment.find({
    _id: { $in: results },
    status: { $in: ['COMPLETED', 'ARCHIVED', 'ACTIVE'] },
  })
    .populate('competencyId', 'name category')
    .select('description competencyId type status targetGroup purpose createdAt')
    .sort({ createdAt: -1 })
    .lean();

  // Mark which ones already have feedback
  const assessmentsWithStatus = assessments.map(a => ({
    ...a,
    alreadySubmitted: existingIds.includes(a._id.toString()),
  }));

  res.status(200).json({ status: 'success', data: { assessments: assessmentsWithStatus } });
});

// ─── GET ONE ─────────────────────────────────────────────────────────────────
export const getFeedback = asyncHandler(async (req, res, next) => {
  const feedback = await Feedback.findById(req.params.id)
    .populate('userId', 'name email department position')
    .populate('assessmentId', 'description')
    .lean();

  if (!feedback) return next(new AppError('Feedback not found.', 404));

  if (req.user.role === 'EMPLOYEE' && feedback.userId._id?.toString() !== req.user.id) {
    return next(new AppError('Access denied.', 403));
  }

  res.status(200).json({ status: 'success', data: { feedback } });
});