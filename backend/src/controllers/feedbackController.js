import Feedback from '../models/Feedback.js';
import AppError from '../utils/AppError.js';
import asyncHandler from '../utils/asyncHandler.js';

// ─── SUBMIT ──────────────────────────────────────────────────────────────────
export const createFeedback = asyncHandler(async (req, res, next) => {
  const { assessmentId, content, rating } = req.body;

  if (!assessmentId || !content) {
    return next(new AppError('Assessment ID and content are required.', 400));
  }

  const feedback = await Feedback.create({
    userId:      req.user.id,
    assessmentId,
    content,
    rating: rating || null,
  });

  res.status(201).json({ status: 'success', data: { feedback } });
});

// ─── LIST ─────────────────────────────────────────────────────────────────────
export const getFeedbacks = asyncHandler(async (req, res) => {
  const { assessmentId, reviewed, page = 1, limit = 20 } = req.query;

  const filter = {};
  if (assessmentId)          filter.assessmentId = assessmentId;
  if (reviewed !== undefined) filter.reviewed     = reviewed === 'true';

  // Employees can only see their own
  if (req.user.role === 'EMPLOYEE') {
    filter.userId = req.user.id;
  }

  const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);

  const [feedbacks, total] = await Promise.all([
    Feedback.find(filter)
      .populate('userId',      'name email')
      .populate('assessmentId', 'description')
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
      pagination: { total, page: parseInt(page, 10), limit: parseInt(limit, 10) },
    },
  });
});

// ─── GET ONE ─────────────────────────────────────────────────────────────────
export const getFeedback = asyncHandler(async (req, res, next) => {
  const feedback = await Feedback.findById(req.params.id)
    .populate('userId',      'name email')
    .populate('assessmentId', 'description')
    .lean();

  if (!feedback) return next(new AppError('Feedback not found.', 404));

  // Employees can only see their own feedback
  if (req.user.role === 'EMPLOYEE' && feedback.userId._id?.toString() !== req.user.id) {
    return next(new AppError('Access denied.', 403));
  }

  res.status(200).json({ status: 'success', data: { feedback } });
});

// ─── REVIEW (HR_ADMIN) ───────────────────────────────────────────────────────
export const reviewFeedback = asyncHandler(async (req, res, next) => {
  const feedback = await Feedback.findById(req.params.id);
  if (!feedback) return next(new AppError('Feedback not found.', 404));

  feedback.reviewed   = true;
  feedback.reviewedBy = req.user.id;
  feedback.reviewedAt = new Date();
  await feedback.save();

  res.status(200).json({ status: 'success', data: { feedback } });
});