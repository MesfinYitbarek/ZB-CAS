import prisma from '../config/prisma.js';
import AppError from '../utils/AppError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { logActivity } from '../services/activityService.js';
import logger from '../utils/logger.js';
import {
  normalizeTargetGroup,
  denormalizeTargetGroup,
  isValidTargetGroup,
  normalizeCategory,
} from '../utils/targetGroup.js';
import { parseImportBuffer, toCell, buildImportTemplate, sendXlsxDownload } from '../utils/importFile.js';

// Canonical CompetencyCategory enum values (see prisma/schema.prisma)
const CATEGORY_VALUES = new Set([
  'Core_Personal_effectiveness', 'Core_Behavioral', 'Managerial', 'Leadership', 'Technical',
]);

const withTargetGroups = (competency) => ({
  _id:          competency.id,
  id:           competency.id,
  name:         competency.name,
  category:     competency.category,
  targetGroups: competency.targetGroups.map(tg => ({
    targetGroup: denormalizeTargetGroup(tg.targetGroup),
    description: tg.description,
  })),
  createdAt:    competency.createdAt,
  updatedAt:    competency.updatedAt,
});

// ─── LIST ─────────────────────────────────────────────────────────────────────
export const getCompetencies = asyncHandler(async (req, res) => {
  const { category, search, page = 1, limit = 50 } = req.query;

  const where = {};
  // Normalize hyphenated UI spellings ('Core-Behavioral') to enum values
  if (category && category !== 'All') where.category = normalizeCategory(category);
  if (search && search.trim()) {
    const s = search.trim();
    const or = [{ name: { contains: s, mode: 'insensitive' } }];
    // `contains` is not supported on enums — match exact category instead
    const asCategory = normalizeCategory(s);
    if (CATEGORY_VALUES.has(asCategory)) or.push({ category: asCategory });
    if (where.category) {
      where.AND = [{ category: where.category }, { OR: or }];
      delete where.category;
    } else {
      where.OR = or;
    }
  }

  const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);

  const [competencies, total] = await Promise.all([
    prisma.competency.findMany({
      where,
      include: { targetGroups: true },
      skip,
      take: parseInt(limit, 10),
      orderBy: { name: 'asc' },
    }),
    prisma.competency.count({ where }),
  ]);

  res.status(200).json({
    status: 'success',
    data: {
      competencies: competencies.map(withTargetGroups),
      pagination: { total, page: parseInt(page, 10), limit: parseInt(limit, 10) },
    },
  });
});

// ─── GET ONE ─────────────────────────────────────────────────────────────────
export const getCompetency = asyncHandler(async (req, res, next) => {
  const competency = await prisma.competency.findUnique({
    where: { id: req.params.id },
    include: { targetGroups: true },
  });
  if (!competency) return next(new AppError('Competency not found.', 404));

  res.status(200).json({
    status: 'success',
    data: { competency: withTargetGroups(competency) },
  });
});

// ─── CREATE / MERGE TARGET GROUPS ────────────────────────────────────────────
export const createCompetency = asyncHandler(async (req, res, next) => {
  const { name, category: rawCategory, targetGroups: rawTGs } = req.body;

  if (!name || !rawCategory) return next(new AppError('Name and category are required.', 400));
  if (!Array.isArray(rawTGs) || rawTGs.length === 0) {
    return next(new AppError('At least one target group is required.', 400));
  }

  // Normalize spellings (hyphen/underscore/case) to canonical enum values
  const category = normalizeCategory(rawCategory);
  const targetGroups = rawTGs.map(tg => ({
    targetGroup: normalizeTargetGroup(tg.targetGroup),
    description: tg.description || '',
  }));

  const uniqueTG = new Set();
  for (const tg of targetGroups) {
    if (!tg.targetGroup || !isValidTargetGroup(tg.targetGroup)) {
      return next(new AppError('Invalid target group provided.', 400));
    }
    if (uniqueTG.has(tg.targetGroup)) {
      return next(new AppError('Duplicate target groups not allowed.', 400));
    }
    uniqueTG.add(tg.targetGroup);
  }

  let competency = await prisma.competency.findUnique({
    where: { name_category: { name, category } },
    include: { targetGroups: true },
  });

  let created = false;

  if (competency) {
    // merge target groups
    const existingMap = new Map(competency.targetGroups.map(t => [t.targetGroup, t.description]));
    targetGroups.forEach(tg => {
      existingMap.set(tg.targetGroup, tg.description || '');
    });
    const merged = Array.from(existingMap, ([targetGroup, description]) => ({ targetGroup, description }));

    const deleteMany = prisma.competencyTargetGroup.deleteMany({ where: { competencyId: competency.id } });
    const createMany = prisma.competencyTargetGroup.createMany({
      data: merged.map((tg) => ({ ...tg, competencyId: competency.id })),
    });
    await prisma.$transaction([deleteMany, createMany]);

    competency = await prisma.competency.findUnique({
      where: { id: competency.id },
      include: { targetGroups: true },
    });
  } else {
    competency = await prisma.competency.create({
      data: {
        name,
        category,
        targetGroups: {
          create: targetGroups.map(tg => ({
            targetGroup: tg.targetGroup,
            description: tg.description || '',
          })),
        },
      },
      include: { targetGroups: true },
    });
    created = true;
  }

  await logActivity({
    req,
    action: created ? 'created' : 'updated',
    entity: 'Competency',
    entityId: competency.id,
    description: `Competency "${competency.name}" ${created ? 'created' : 'updated'}`,
    metadata: { category: competency.category, targetGroups: competency.targetGroups.map((t) => t.targetGroup) },
  });

  res.status(created ? 201 : 200).json({
    status: 'success',
    message: created ? 'Competency created.' : 'Target groups merged/updated.',
    data: { competency: withTargetGroups(competency) },
  });
});

// ─── UPDATE ──────────────────────────────────────────────────────────────────
export const updateCompetency = asyncHandler(async (req, res, next) => {
  const { name, category: rawCategory, targetGroups: rawTGs } = req.body;

  let competency = await prisma.competency.findUnique({
    where: { id: req.params.id },
    include: { targetGroups: true },
  });
  if (!competency) return next(new AppError('Competency not found.', 404));

  const data = {};

  const category = rawCategory !== undefined ? normalizeCategory(rawCategory) : undefined;
  let newName = name !== undefined ? name : competency.name;
  let newCategory = category !== undefined ? category : competency.category;

  if (name !== undefined || rawCategory !== undefined) {
    const existing = await prisma.competency.findUnique({
      where: { name_category: { name: newName, category: newCategory } },
    });
    if (existing && existing.id !== competency.id) {
      return next(new AppError('A competency with this name and category already exists.', 409));
    }
    data.name = newName;
    data.category = newCategory;
  }

  let targetGroups;
  if (Array.isArray(rawTGs)) {
    if (rawTGs.length === 0) {
      return next(new AppError('At least one target group is required.', 400));
    }
    targetGroups = rawTGs.map(tg => ({
      targetGroup: normalizeTargetGroup(tg.targetGroup),
      description: tg.description || '',
    }));
    const uniqueTG = new Set();
    for (const tg of targetGroups) {
      if (!tg.targetGroup || !isValidTargetGroup(tg.targetGroup)) {
        return next(new AppError('Invalid target group provided.', 400));
      }
      if (uniqueTG.has(tg.targetGroup)) {
        return next(new AppError('Duplicate target groups not allowed.', 400));
      }
      uniqueTG.add(tg.targetGroup);
    }
  }

  const tx = [];
  if (Object.keys(data).length > 0) {
    tx.push(prisma.competency.update({ where: { id: competency.id }, data }));
  }
  if (Array.isArray(targetGroups)) {
    tx.push(prisma.competencyTargetGroup.deleteMany({ where: { competencyId: competency.id } }));
    tx.push(prisma.competencyTargetGroup.createMany({
      data: targetGroups.map(tg => ({
        competencyId: competency.id,
        targetGroup: tg.targetGroup,
        description: tg.description || '',
      })),
    }));
  }
  if (tx.length > 0) {
    await prisma.$transaction(tx);
  }

  competency = await prisma.competency.findUnique({
    where: { id: competency.id },
    include: { targetGroups: true },
  });

  await logActivity({
    req,
    action: 'updated',
    entity: 'Competency',
    entityId: competency.id,
    description: `Competency "${competency.name}" updated`,
  });

  res.status(200).json({
    status: 'success',
    data: { competency: withTargetGroups(competency) },
  });
});

// ─── DELETE ───────────────────────────────────────────────────────────────────
export const deleteCompetency = asyncHandler(async (req, res, next) => {
  const competency = await prisma.competency.findUnique({ where: { id: req.params.id } });
  if (!competency) return next(new AppError('Competency not found.', 404));

  // Questions & recommendations reference the competency — delete first (matches
  // the original Mongo behavior) then Prisma cascades targetGroups.
  await prisma.question.deleteMany({ where: { competencyId: competency.id } });
  await prisma.recommendation.deleteMany({ where: { competencyId: competency.id } });
  await prisma.competency.delete({ where: { id: competency.id } });

  await logActivity({
    req,
    action: 'deleted',
    entity: 'Competency',
    entityId: competency.id,
    description: `Competency "${competency.name}" deleted`,
  });

  res.status(200).json({ status: 'success', message: 'Competency deleted.' });
});

// ═══ BULK IMPORT (Excel / CSV) ═══════════════════════════════════════════════
// Columns: name | category | targetGroups | descriptions
//   targetGroups: ';'-separated list, e.g. "managerial; non-managerial; common"
//   descriptions: ';'-separated, position-aligned with targetGroups (optional)
const COMP_HEADER_ALIASES = {
  'name': 'name', 'competency': 'name', 'competencyname': 'name', 'competency name': 'name',
  'category': 'category', 'competencycategory': 'category', 'competency category': 'category',
  'targetgroups': 'targetGroups', 'target groups': 'targetGroups', 'targetgroup': 'targetGroups',
  'target group': 'targetGroups', 'groups': 'targetGroups',
  'descriptions': 'descriptions', 'description': 'descriptions', 'descs': 'descriptions',
};

const splitList = (raw) =>
  String(raw || '').split(/[;|]+/).map(s => s.trim()).filter(Boolean);

export const bulkImportCompetencies = asyncHandler(async (req, res, next) => {
  if (!req.file) return next(new AppError('No file uploaded. Attach an .xlsx, .xls, or .csv file.', 400));

  let rows;
  try {
    rows = await parseImportBuffer(req.file.buffer, req.file.originalname,
      (h) => COMP_HEADER_ALIASES[(h || '').toString().trim().toLowerCase()] || null);
  } catch (err) {
    return next(new AppError(err.message || 'Unable to parse file.', 400));
  }

  if (rows.length > 500) {
    return next(new AppError('Import limited to 500 competencies per file.', 400));
  }

  const imported = [];
  const failed = [];
  let processed = 0;
  let merged = 0;

  for (const raw of rows) {
    processed++;
    const row = { __line: raw.__line };

    const name = toCell(raw.name);
    const category = normalizeCategory(toCell(raw.category));
    const tgNames = splitList(raw.targetGroups).map(normalizeTargetGroup);
    const descs = splitList(raw.descriptions);

    if (!name) { failed.push({ row: row.__line, message: 'Missing required field: name' }); continue; }
    if (!toCell(raw.category)) { failed.push({ row: row.__line, message: 'Missing required field: category' }); continue; }
    if (!CATEGORY_VALUES.has(category)) {
      failed.push({ row: row.__line, message: `Invalid category: ${toCell(raw.category)}. Allowed: ${[...CATEGORY_VALUES].join(', ')}` });
      continue;
    }
    if (tgNames.length === 0) { failed.push({ row: row.__line, message: 'Missing required field: targetGroups' }); continue; }
    const badTG = tgNames.find(t => !isValidTargetGroup(t));
    if (badTG) { failed.push({ row: row.__line, message: `Invalid target group: ${badTG}. Allowed: managerial, non-managerial, common` }); continue; }
    if (new Set(tgNames).size !== tgNames.length) { failed.push({ row: row.__line, message: 'Duplicate target groups in row' }); continue; }

    const targetGroups = tgNames.map((t, i) => ({ targetGroup: t, description: descs[i] || '' }));

    try {
      const existing = await prisma.competency.findUnique({
        where: { name_category: { name, category } },
        include: { targetGroups: true },
      });

      if (existing) {
        const existingMap = new Map(existing.targetGroups.map(t => [t.targetGroup, t.description]));
        targetGroups.forEach(tg => existingMap.set(tg.targetGroup, tg.description || existingMap.get(tg.targetGroup) || ''));
        const mergedTGs = Array.from(existingMap, ([targetGroup, description]) => ({ targetGroup, description }));
        await prisma.$transaction([
          prisma.competencyTargetGroup.deleteMany({ where: { competencyId: existing.id } }),
          prisma.competencyTargetGroup.createMany({
            data: mergedTGs.map(tg => ({ ...tg, competencyId: existing.id })),
          }),
        ]);
        merged++;
        imported.push({ _id: existing.id, name, category, merged: true });
      } else {
        const created = await prisma.competency.create({
          data: {
            name,
            category,
            targetGroups: { create: targetGroups },
          },
        });
        imported.push({ _id: created.id, name, category, merged: false });
      }
    } catch (err) {
      failed.push({ row: row.__line, message: `DB error: ${err.message}` });
    }
  }

  logger.info({ event: 'competencies_bulk_import', by: req.user.id, processed, imported: imported.length, merged, failed: failed.length });

  await logActivity({
    req,
    action: 'bulk_import',
    entity: 'Competency',
    description: `Bulk imported ${imported.length} competenc(ies)${failed.length ? ` (${failed.length} failed)` : ''}`,
    metadata: { total: rows.length, processed, imported: imported.length, merged, failed: failed.length },
  });

  res.status(200).json({
    status: 'success',
    data: {
      summary: { total: rows.length, processed, imported: imported.length, merged, failed: failed.length },
      imported,
      failed,
    },
  });
});

// ─── DOWNLOAD IMPORT TEMPLATE (Excel) ────────────────────────────────────────
export const downloadCompetencyTemplate = asyncHandler(async (req, res) => {
  const buffer = await buildImportTemplate(
    'Competencies',
    ['name', 'category', 'targetGroups', 'descriptions'],
    ['Communication', 'Core-Behavioral', 'managerial; non-managerial', 'Leading teams; Everyday collaboration'],
  );
  await sendXlsxDownload(res, 'competency-import-template.xlsx', buffer);
});
