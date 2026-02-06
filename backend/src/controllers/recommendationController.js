/* controllers/recommendationController.js
 * Recommendation CRUD – HR_ADMIN manages the recommendation library.
 *
 * GET    /recommendations                     – list (filter by competencyId / level)
 * GET    /recommendations/:id                 – single
 * GET    /recommendations/competency/:compId  – all recommendations for one competency
 * POST   /recommendations                     – create
 * PUT    /recommendations/:id                 – update
 * DELETE /recommendations/:id                 – delete
 */
const Recommendation = require('../models/Recommendation');
const AppError       = require('../utils/AppError');
const asyncHandler   = require('../utils/asyncHandler');

// ─── LIST ALL ─────────────────────────────────────────────────────────────────
exports.getRecommendations = asyncHandler(async (req, res) => {
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
exports.getRecommendation = asyncHandler(async (req, res, next) => {
  const rec = await Recommendation.findById(req.params.id)
    .populate('competencyId', 'name category')
    .lean();

  if (!rec) return next(new AppError('Recommendation not found.', 404));

  res.status(200).json({ status: 'success', data: { recommendation: rec } });
});

// ─── GET BY COMPETENCY ───────────────────────────────────────────────────────
exports.getByCompetency = asyncHandler(async (req, res) => {
  const recommendations = await Recommendation.find({
    competencyId: req.params.competencyId,
  })
    .populate('competencyId', 'name category')
    .sort({ level: 1 })
    .lean();

  res.status(200).json({ status: 'success', data: { recommendations } });
});

// ─── CREATE ──────────────────────────────────────────────────────────────────
exports.createRecommendation = asyncHandler(async (req, res, next) => {
  const { competencyId, level, recommendation } = req.body;

  const rec = await Recommendation.create({ competencyId, level, recommendation });

  res.status(201).json({ status: 'success', data: { recommendation: rec } });
});

// ─── UPDATE ──────────────────────────────────────────────────────────────────
exports.updateRecommendation = asyncHandler(async (req, res, next) => {
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
exports.deleteRecommendation = asyncHandler(async (req, res, next) => {
  const rec = await Recommendation.findByIdAndDelete(req.params.id);
  if (!rec) return next(new AppError('Recommendation not found.', 404));

  res.status(200).json({ status: 'success', message: 'Recommendation deleted.' });
});
