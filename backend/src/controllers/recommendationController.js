/* controllers/recommendationController.js */
import prisma from '../config/prisma.js';
import AppError from '../utils/AppError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { logActivity } from '../services/activityService.js';
import logger from '../utils/logger.js';
import { normalizeTargetGroup, denormalizeTargetGroup } from '../utils/targetGroup.js';
import { parseImportBuffer, toCell, buildImportTemplate, sendXlsxDownload } from '../utils/importFile.js';

const LEVELS = ['Basic', 'Intermediate', 'Advanced', 'Expert'];

const include = { competency: { select: { id: true, name: true, category: true, targetGroups: true } } };
const mapRec = (r) => ({ ...r, _id: r.id, competencyId: r.competency || r.competencyId, targetGroup: denormalizeTargetGroup(r.targetGroup) });

// ─── GET ALL (with filters & pagination) ──────────────────────────────────────
export const getRecommendations = asyncHandler(async (req, res) => {
  const { competencyId, targetGroup, level, page = 1, limit = 50 } = req.query;

  const where = {};
  if (competencyId) where.competencyId = competencyId;
  if (targetGroup)  where.targetGroup  = normalizeTargetGroup(targetGroup);
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
  if (targetGroup) where.targetGroup = normalizeTargetGroup(targetGroup);
  if (level)       where.level        = level;

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
  const { competencyId, targetGroup: rawTG, level, recommendation, description, bulk } = req.body;
  const targetGroup = rawTG !== undefined ? normalizeTargetGroup(rawTG) : rawTG;

  if (bulk && Array.isArray(bulk)) {
    for (const item of bulk) {
      const itemTG = normalizeTargetGroup(item.targetGroup);
      const existing = await prisma.recommendation.findFirst({
        where: { competencyId: item.competencyId, targetGroup: itemTG, level: item.level },
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
            targetGroup: itemTG,
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
  const { recommendation, description, targetGroup: rawTG, level } = req.body;

  const updateData = {};
  if (recommendation !== undefined) updateData.recommendation = recommendation.trim();
  if (description    !== undefined) updateData.description    = description.trim();
  if (rawTG)                        updateData.targetGroup    = normalizeTargetGroup(rawTG);
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

// ═══ BULK IMPORT (Excel / CSV) ═══════════════════════════════════════════════
// Columns: competency | category | targetGroup | level | recommendation | description
//   competency: competency name (category disambiguates when names repeat)
//   Existing (competency, targetGroup, level) rows are updated (upsert).
const REC_HEADER_ALIASES = {
  'competency': 'competency', 'competencyname': 'competency', 'competency name': 'competency',
  'category': 'category', 'competencycategory': 'category', 'competency category': 'category',
  'targetgroup': 'targetGroup', 'target group': 'targetGroup', 'targetgroups': 'targetGroup',
  'target groups': 'targetGroup', 'group': 'targetGroup',
  'level': 'level', 'proficiencylevel': 'level', 'proficiency level': 'level',
  'recommendation': 'recommendation', 'recommendations': 'recommendation', 'rec': 'recommendation',
  'description': 'description', 'descriptions': 'description', 'desc': 'description',
  'details': 'description',
};

export const bulkImportRecommendations = asyncHandler(async (req, res, next) => {
  if (!req.file) return next(new AppError('No file uploaded. Attach an .xlsx, .xls, or .csv file.', 400));

  let rows;
  try {
    rows = await parseImportBuffer(req.file.buffer, req.file.originalname,
      (h) => REC_HEADER_ALIASES[(h || '').toString().trim().toLowerCase()] || null);
  } catch (err) {
    return next(new AppError(err.message || 'Unable to parse file.', 400));
  }

  if (rows.length > 1000) {
    return next(new AppError('Import limited to 1000 recommendations per file.', 400));
  }

  const imported = [];
  const failed = [];
  let processed = 0;
  let updated = 0;

  // Cache competencies by name for resolution
  const allCompetencies = await prisma.competency.findMany({ select: { id: true, name: true, category: true } });
  const byName = {};
  allCompetencies.forEach(c => {
    const key = c.name.trim().toLowerCase();
    (byName[key] = byName[key] || []).push(c);
  });

  for (const raw of rows) {
    processed++;
    const compName = toCell(raw.competency);
    const catRaw = toCell(raw.category);
    const targetGroup = normalizeTargetGroup(toCell(raw.targetGroup));
    const level = toCell(raw.level);
    const recommendation = toCell(raw.recommendation);
    const description = toCell(raw.description);

    if (!compName) { failed.push({ row: raw.__line, message: 'Missing required field: competency' }); continue; }
    if (!toCell(raw.targetGroup)) { failed.push({ row: raw.__line, message: 'Missing required field: targetGroup' }); continue; }
    if (!['managerial', 'non_managerial', 'common'].includes(targetGroup)) {
      failed.push({ row: raw.__line, message: `Invalid targetGroup: ${toCell(raw.targetGroup)}. Allowed: managerial, non-managerial, common` });
      continue;
    }
    if (!LEVELS.includes(level)) {
      failed.push({ row: raw.__line, message: `Invalid level: ${level || '(empty)'}. Allowed: ${LEVELS.join(', ')}` });
      continue;
    }
    if (!recommendation) { failed.push({ row: raw.__line, message: 'Missing required field: recommendation' }); continue; }

    const candidates = byName[compName.toLowerCase()] || [];
    let competency = null;
    if (candidates.length === 1) {
      competency = candidates[0];
    } else if (candidates.length > 1) {
      if (!catRaw) {
        failed.push({ row: raw.__line, message: `Ambiguous competency "${compName}" — specify category` });
        continue;
      }
      competency = candidates.find(c => c.category.toLowerCase() === catRaw.toLowerCase()) || null;
      if (!competency) {
        failed.push({ row: raw.__line, message: `Competency "${compName}" not found in category "${catRaw}"` });
        continue;
      }
    } else {
      failed.push({ row: raw.__line, message: `Competency not found: ${compName}` });
      continue;
    }

    try {
      const existing = await prisma.recommendation.findFirst({
        where: { competencyId: competency.id, targetGroup, level },
      });
      if (existing) {
        await prisma.recommendation.update({
          where: { id: existing.id },
          data: { recommendation, description },
        });
        updated++;
        imported.push({ _id: existing.id, competency: compName, targetGroup, level, updated: true });
      } else {
        const created = await prisma.recommendation.create({
          data: { competencyId: competency.id, targetGroup, level, recommendation, description },
        });
        imported.push({ _id: created.id, competency: compName, targetGroup, level, updated: false });
      }
    } catch (err) {
      failed.push({ row: raw.__line, message: `DB error: ${err.message}` });
    }
  }

  logger.info({ event: 'recommendations_bulk_import', by: req.user.id, processed, imported: imported.length, updated, failed: failed.length });

  await logActivity({
    req,
    action: 'bulk_import',
    entity: 'Recommendation',
    description: `Bulk imported ${imported.length} recommendation(s)${failed.length ? ` (${failed.length} failed)` : ''}`,
    metadata: { total: rows.length, processed, imported: imported.length, updated, failed: failed.length },
  });

  res.status(200).json({
    status: 'success',
    data: {
      summary: { total: rows.length, processed, imported: imported.length, updated, failed: failed.length },
      imported,
      failed,
    },
  });
});

// ─── DOWNLOAD IMPORT TEMPLATE (Excel) ────────────────────────────────────────
export const downloadRecommendationTemplate = asyncHandler(async (req, res) => {
  const buffer = await buildImportTemplate(
    'Recommendations',
    ['competency', 'category', 'targetGroup', 'level', 'recommendation', 'description'],
    ['Communication', 'Core-Behavioral', 'common', 'Basic', 'Attend active-listening workshops and practice daily summaries.', 'Foundational courses and mentoring.'],
  );
  await sendXlsxDownload(res, 'recommendation-import-template.xlsx', buffer);
});
