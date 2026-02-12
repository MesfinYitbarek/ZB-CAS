import Recommendation from '../models/Recommendation.js';
import AppError from '../utils/AppError.js';
import asyncHandler from '../utils/asyncHandler.js';

// ─── LIST ALL ─────────────────────────────────────────────────────────────────
export const getRecommendations = asyncHandler(async (req, res) => {
  const { competencyId, level, page = 1, limit = 50 } = req.query;

  const filter = {};
  if (competencyId) filter.competencyId = competencyId;
  if (level)        filter.level        = level;

  const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);

  const [recommendations, total] = await Promise.all([
    Recommendation.find(filter)
      .populate('competencyId', 'name category')
      .skip(skip)
      .limit(parseInt(limit, 10))
      .sort({ competencyId: 1, level: 1 })
      .lean(),
    Recommendation.countDocuments(filter),
  ]);

  res.status(200).json({
    status: 'success',
    data: {
      recommendations,
      pagination: { total, page: parseInt(page, 10), limit: parseInt(limit, 10) },
    },
  });
});

// ─── GET ONE ─────────────────────────────────────────────────────────────────
export const getRecommendation = asyncHandler(async (req, res, next) => {
  const rec = await Recommendation.findById(req.params.id)
    .populate('competencyId', 'name category')
    .lean();

  if (!rec) return next(new AppError('Recommendation not found.', 404));

  res.status(200).json({ status: 'success', data: { recommendation: rec } });
});

// ─── GET BY COMPETENCY ───────────────────────────────────────────────────────
export const getByCompetency = asyncHandler(async (req, res) => {
  const recommendations = await Recommendation.find({
    competencyId: req.params.competencyId,
  })
    .populate('competencyId', 'name category')
    .sort({ level: 1 })
    .lean();

  res.status(200).json({ status: 'success', data: { recommendations } });
});

// ─── CREATE ──────────────────────────────────────────────────────────────────
export const createRecommendation = asyncHandler(async (req, res, next) => {
  const { competencyId, level, recommendation } = req.body;

  const rec = await Recommendation.create({ competencyId, level, recommendation });

  res.status(201).json({ status: 'success', data: { recommendation: rec } });
});

// ─── UPDATE ──────────────────────────────────────────────────────────────────
export const updateRecommendation = asyncHandler(async (req, res, next) => {
  const { recommendation } = req.body;

  const rec = await Recommendation.findByIdAndUpdate(
    req.params.id,
    { recommendation },
    { new: true, runValidators: true }
  ).populate('competencyId', 'name category');

  if (!rec) return next(new AppError('Recommendation not found.', 404));

  res.status(200).json({ status: 'success', data: { recommendation: rec } });
});

// ─── DELETE ───────────────────────────────────────────────────────────────────
export const deleteRecommendation = asyncHandler(async (req, res, next) => {
  const rec = await Recommendation.findByIdAndDelete(req.params.id);
  if (!rec) return next(new AppError('Recommendation not found.', 404));

  res.status(200).json({ status: 'success', message: 'Recommendation deleted.' });
});