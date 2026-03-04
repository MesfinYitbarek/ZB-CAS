/* controllers/recommendationController.js
 * CHANGE: Same recommendation text can now be used across different competencies.
 * The unique constraint is per (competencyId + targetGroup + level) — meaning one
 * entry per competency per group per level — but the recommendation text itself
 * is not unique, so the same guidance can appear under multiple competencies.
 *
 * Added: getByTargetGroupAndLevel — returns all recommendations for a given
 * targetGroup+level across ALL competencies (useful for reuse / copy workflows).
 */
import Recommendation from '../models/Recommendation.js';
import AppError from '../utils/AppError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { LEVELS } from '../models/Recommendation.js';

// ─── GET ALL (with filters & pagination) ──────────────────────────────────────
export const getRecommendations = asyncHandler(async (req, res) => {
  const { competencyId, targetGroup, level, page = 1, limit = 50 } = req.query;

  const filter = {};
  if (competencyId) filter.competencyId = competencyId;
  if (targetGroup)  filter.targetGroup  = targetGroup;
  if (level)        filter.level        = level;

  const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);

  const [recommendations, total] = await Promise.all([
    Recommendation.find(filter)
      .populate('competencyId', 'name category targetGroups')
      .skip(skip)
      .limit(parseInt(limit, 10))
      .sort({ competencyId: 1, targetGroup: 1, level: 1 })
      .lean(),
    Recommendation.countDocuments(filter),
  ]);

  res.status(200).json({
    status: 'success',
    data: { recommendations, pagination: { total, page: parseInt(page, 10), limit: parseInt(limit, 10) } },
  });
});

// ─── GET SINGLE ────────────────────────────────────────────────────────────────
export const getRecommendation = asyncHandler(async (req, res, next) => {
  const rec = await Recommendation.findById(req.params.id)
    .populate('competencyId', 'name category targetGroups')
    .lean();

  if (!rec) return next(new AppError('Recommendation not found', 404));
  res.status(200).json({ status: 'success', data: { recommendation: rec } });
});

// ─── GET BY COMPETENCY ─────────────────────────────────────────────────────────
export const getByCompetency = asyncHandler(async (req, res) => {
  const recommendations = await Recommendation.find({ competencyId: req.params.competencyId })
    .populate('competencyId', 'name category targetGroups')
    .sort({ targetGroup: 1, level: 1 })
    .lean();

  res.status(200).json({ status: 'success', data: { recommendations } });
});

// ─── GET BY TARGET GROUP + LEVEL (cross-competency) ───────────────────────────
// Returns all recommendations that share the same targetGroup+level, regardless
// of competency — useful for the "copy from existing" feature in the UI.
export const getByTargetGroupAndLevel = asyncHandler(async (req, res) => {
  const { targetGroup, level } = req.query;

  const filter = {};
  if (targetGroup) filter.targetGroup = targetGroup;
  if (level)       filter.level       = level;

  const recommendations = await Recommendation.find(filter)
    .populate('competencyId', 'name category')
    .sort({ competencyId: 1 })
    .lean();

  // Deduplicate by recommendation text so UI can offer unique suggestions
  const seen  = new Set();
  const unique = recommendations.filter((r) => {
    const key = r.recommendation.trim().toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  res.status(200).json({ status: 'success', data: { recommendations: unique } });
});

// ─── CREATE / BULK UPSERT ──────────────────────────────────────────────────────
export const createRecommendation = asyncHandler(async (req, res, next) => {
  const { competencyId, targetGroup, level, recommendation, description, bulk } = req.body;

  // Bulk creation/upsert
  if (bulk && Array.isArray(bulk)) {
    const operations = bulk.map((item) => ({
      updateOne: {
        filter: { competencyId: item.competencyId, targetGroup: item.targetGroup, level: item.level },
        update: { $set: { recommendation: item.recommendation.trim(), description: (item.description || '').trim() } },
        upsert: true,
      },
    }));

    await Recommendation.bulkWrite(operations);
    return res.status(201).json({ status: 'success', message: 'Bulk recommendations processed successfully' });
  }

  // Single creation/upsert
  if (!competencyId || !targetGroup || !level || !recommendation?.trim()) {
    return next(new AppError('competencyId, targetGroup, level, and recommendation are required', 400));
  }

  if (!LEVELS.includes(level)) {
    return next(new AppError(`Invalid level. Must be one of: ${LEVELS.join(', ')}`, 400));
  }

  // NOTE: Same recommendation text is allowed across different competencies.
  // The upsert key is (competencyId + targetGroup + level) — unique per slot,
  // but the text value itself has no uniqueness constraint.
  const rec = await Recommendation.findOneAndUpdate(
    { competencyId, targetGroup, level },
    { recommendation: recommendation.trim(), description: (description || '').trim() },
    { upsert: true, new: true, runValidators: true }
  ).populate('competencyId', 'name category targetGroups');

  res.status(201).json({ status: 'success', data: { recommendation: rec } });
});

// ─── UPDATE ────────────────────────────────────────────────────────────────────
export const updateRecommendation = asyncHandler(async (req, res, next) => {
  const { recommendation, description, targetGroup, level } = req.body;

  const updateData = {};
  if (recommendation !== undefined) updateData.recommendation = recommendation.trim();
  if (description    !== undefined) updateData.description    = description.trim();
  if (targetGroup)                  updateData.targetGroup    = targetGroup;
  if (level)                        updateData.level          = level;

  if (Object.keys(updateData).length === 0) {
    return next(new AppError('No fields provided to update', 400));
  }

  const rec = await Recommendation.findByIdAndUpdate(req.params.id, updateData, {
    new: true,
    runValidators: true,
  }).populate('competencyId', 'name category targetGroups');

  if (!rec) return next(new AppError('Recommendation not found', 404));
  res.status(200).json({ status: 'success', data: { recommendation: rec } });
});

// ─── DELETE ────────────────────────────────────────────────────────────────────
export const deleteRecommendation = asyncHandler(async (req, res, next) => {
  const rec = await Recommendation.findByIdAndDelete(req.params.id);
  if (!rec) return next(new AppError('Recommendation not found', 404));
  res.status(200).json({ status: 'success', message: 'Recommendation deleted successfully' });
});