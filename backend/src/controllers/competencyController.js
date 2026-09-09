import prisma from '../config/prisma.js';
import AppError from '../utils/AppError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { logActivity } from '../services/activityService.js';

const TARGET_GROUPS = ['managerial', 'non-managerial', 'common'];

const withTargetGroups = (competency) => ({
  _id:          competency.id,
  id:           competency.id,
  name:         competency.name,
  category:     competency.category,
  targetGroups: competency.targetGroups.map(tg => ({
    targetGroup: tg.targetGroup,
    description: tg.description,
  })),
  createdAt:    competency.createdAt,
  updatedAt:    competency.updatedAt,
});

// ─── LIST ─────────────────────────────────────────────────────────────────────
export const getCompetencies = asyncHandler(async (req, res) => {
  const { category, search, page = 1, limit = 50 } = req.query;

  const where = {};
  if (category) where.category = category;
  if (search && search.trim()) {
    where.OR = [
      { name:     { contains: search.trim(), mode: 'insensitive' } },
      { category: { contains: search.trim(), mode: 'insensitive' } },
    ];
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
  const { name, category, targetGroups } = req.body;

  if (!name || !category) return next(new AppError('Name and category are required.', 400));
  if (!Array.isArray(targetGroups) || targetGroups.length === 0) {
    return next(new AppError('At least one target group is required.', 400));
  }

  const uniqueTG = new Set();
  for (const tg of targetGroups) {
    if (!tg.targetGroup || !TARGET_GROUPS.includes(tg.targetGroup)) {
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
  const { name, category, targetGroups } = req.body;

  let competency = await prisma.competency.findUnique({
    where: { id: req.params.id },
    include: { targetGroups: true },
  });
  if (!competency) return next(new AppError('Competency not found.', 404));

  const data = {};

  let newName = name !== undefined ? name : competency.name;
  let newCategory = category !== undefined ? category : competency.category;

  if (name !== undefined || category !== undefined) {
    const existing = await prisma.competency.findUnique({
      where: { name_category: { name: newName, category: newCategory } },
    });
    if (existing && existing.id !== competency.id) {
      return next(new AppError('A competency with this name and category already exists.', 409));
    }
    data.name = newName;
    data.category = newCategory;
  }

  if (Array.isArray(targetGroups)) {
    if (targetGroups.length === 0) {
      return next(new AppError('At least one target group is required.', 400));
    }
    const uniqueTG = new Set();
    for (const tg of targetGroups) {
      if (!tg.targetGroup || !TARGET_GROUPS.includes(tg.targetGroup)) {
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
