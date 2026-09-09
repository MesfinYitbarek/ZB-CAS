/* controllers/recommendationController.js */
import prisma from '../config/prisma.js';
import AppError from '../utils/AppError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { logActivity } from '../services/activityService.js';

const LEVELS = ['Basic', 'Intermediate', 'Advanced', 'Expert'];

const include = { competency: { select: { id: true, name: true, category: true, targetGroups: true } } };
const mapRec = (r) => ({ ...r, _id: r.id, competencyId: r.competency || r.competencyId });

// ─── GET ALL (with filters & pagination) ──────────────────────────────────────
export const getRecommendations = asyncHandler(async (req, res) => {
  const { competencyId, targetGroup, level, page = 1, limit = 50 } = req.query;

  const where = {};
  if (competencyId) where.competencyId = competencyId;
  if (targetGroup)  where.targetGroup  = targetGroup;
  if (level)        where.level        = level;

  const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);

  const [recommendations, total] = await Promise.all([
    prisma.recommendation.findMany({
      where,
      include,
      skip,
      take: parseInt(limit, 10),
      orderBy: [{ competencyId: 'asc' }, { targetGroup: 'asc' }, { level: 'asc' }],
    }),
    prisma.recommendation.count({ where }),
  ]);

  res.status(200).json({
    status: 'success',
    data: { recommendations: recommendations.map(mapRec), pagination: { total, page: parseInt(page, 10), limit: parseInt(limit, 10) } },
  });
});

// ─── GET SINGLE ────────────────────────────────────────────────────────────────
export const getRecommendation = asyncHandler(async (req, res, next) => {
  const rec = await prisma.recommendation.findUnique({ where: { id: req.params.id }, include });

  if (!rec) return next(new AppError('Recommendation not found', 404));
  res.status(200).json({ status: 'success', data: { recommendation: mapRec(rec) } });
});

// ─── GET BY COMPETENCY ─────────────────────────────────────────────────────────
export const getByCompetency = asyncHandler(async (req, res) => {
  const recommendations = await prisma.recommendation.findMany({
    where: { competencyId: req.params.competencyId },
    include,
    orderBy: [{ targetGroup: 'asc' }, { level: 'asc' }],
  });

  res.status(200).json({ status: 'success', data: { recommendations: recommendations.map(mapRec) } });
});

// ─── GET BY TARGET GROUP + LEVEL (cross-competency) ───────────────────────────
export const getByTargetGroupAndLevel = asyncHandler(async (req, res) => {
  const { targetGroup, level } = req.query;

  const where = {};
  if (targetGroup) where.targetGroup = targetGroup;
  if (level)       where.level       = level;

  const recommendations = await prisma.recommendation.findMany({
    where,
    include: { competency: { select: { id: true, name: true, category: true } } },
    orderBy: { competencyId: 'asc' },
  });

  const seen = new Set();
  const unique = recommendations.filter((r) => {
    const key = r.recommendation.trim().toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  res.status(200).json({ status: 'success', data: { recommendations: unique.map(mapRec) } });
});

// ─── CREATE / BULK UPSERT ──────────────────────────────────────────────────────
export const createRecommendation = asyncHandler(async (req, res, next) => {
  const { competencyId, targetGroup, level, recommendation, description, bulk } = req.body;

  if (bulk && Array.isArray(bulk)) {
    for (const item of bulk) {
      const existing = await prisma.recommendation.findFirst({
        where: { competencyId: item.competencyId, targetGroup: item.targetGroup, level: item.level },
      });
      if (existing) {
        await prisma.recommendation.update({
          where: { id: existing.id },
          data: { recommendation: item.recommendation.trim(), description: (item.description || '').trim() },
        });
      } else {
        await prisma.recommendation.create({
          data: {
            competencyId: item.competencyId,
            targetGroup: item.targetGroup,
            level: item.level,
            recommendation: item.recommendation.trim(),
            description: (item.description || '').trim(),
          },
        });
      }
    }
    await logActivity({
      req,
      action: 'bulk_created',
      entity: 'Recommendation',
      description: `Processed ${bulk.length} recommendation(s) in bulk`,
      metadata: { count: bulk.length },
    });
    return res.status(201).json({ status: 'success', message: 'Bulk recommendations processed successfully' });
  }

  if (!competencyId || !targetGroup || !level || !recommendation?.trim()) {
    return next(new AppError('competencyId, targetGroup, level, and recommendation are required', 400));
  }

  if (!LEVELS.includes(level)) {
    return next(new AppError(`Invalid level. Must be one of: ${LEVELS.join(', ')}`, 400));
  }

  const existing = await prisma.recommendation.findFirst({ where: { competencyId, targetGroup, level }, include });
  let rec;
  if (existing) {
    rec = await prisma.recommendation.update({
      where: { id: existing.id },
      data: { recommendation: recommendation.trim(), description: (description || '').trim() },
      include,
    });
  } else {
    rec = await prisma.recommendation.create({
      data: { competencyId, targetGroup, level, recommendation: recommendation.trim(), description: (description || '').trim() },
      include,
    });
  }

  await logActivity({
    req,
    action: existing ? 'updated' : 'created',
    entity: 'Recommendation',
    entityId: rec.id,
    description: `Recommendation for level "${rec.level}" ${existing ? 'updated' : 'created'}`,
    metadata: { competencyId: rec.competencyId, targetGroup: rec.targetGroup, level: rec.level },
  });

  res.status(201).json({ status: 'success', data: { recommendation: mapRec(rec) } });
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

  const rec = await prisma.recommendation.update({ where: { id: req.params.id }, data: updateData, include }).catch(() => null);

  if (!rec) return next(new AppError('Recommendation not found', 404));

  await logActivity({
    req,
    action: 'updated',
    entity: 'Recommendation',
    entityId: rec.id,
    description: `Recommendation for level "${rec.level}" updated`,
    metadata: { competencyId: rec.competencyId, targetGroup: rec.targetGroup, level: rec.level },
  });

  res.status(200).json({ status: 'success', data: { recommendation: mapRec(rec) } });
});

// ─── DELETE ────────────────────────────────────────────────────────────────────
export const deleteRecommendation = asyncHandler(async (req, res, next) => {
  const rec = await prisma.recommendation.findUnique({ where: { id: req.params.id } });
  if (!rec) return next(new AppError('Recommendation not found', 404));
  await prisma.recommendation.delete({ where: { id: req.params.id } });

  await logActivity({
    req,
    action: 'deleted',
    entity: 'Recommendation',
    entityId: rec.id,
    description: `Recommendation for level "${rec.level}" deleted`,
  });

  res.status(200).json({ status: 'success', message: 'Recommendation deleted successfully' });
});
