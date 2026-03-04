import Competency from '../models/Competency.js';
import Question from '../models/Question.js';
import Recommendation from '../models/Recommendation.js';
import AppError from '../utils/AppError.js';
import asyncHandler from '../utils/asyncHandler.js';

const TARGET_GROUPS = ['managerial', 'non-managerial', 'common'];

// ─── LIST ─────────────────────────────────────────────────────────────────────
export const getCompetencies = asyncHandler(async (req, res) => {
  const { category, search, page = 1, limit = 50 } = req.query;

  const filter = {};
  if (category) filter.category = category;
  if (search && search.trim()) {
    const regex = new RegExp(search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ name: regex }, { category: regex }];
  }

  const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);

  const [competencies, total] = await Promise.all([
    Competency.find(filter)
      .skip(skip)
      .limit(parseInt(limit, 10))
      .sort({ name: 1 })
      .lean(),
    Competency.countDocuments(filter),
  ]);

  res.status(200).json({
    status: 'success',
    data: {
      competencies,
      pagination: { total, page: parseInt(page, 10), limit: parseInt(limit, 10) },
    },
  });
});

// ─── GET ONE ─────────────────────────────────────────────────────────────────
export const getCompetency = asyncHandler(async (req, res, next) => {
  const competency = await Competency.findById(req.params.id).lean();
  if (!competency) return next(new AppError('Competency not found.', 404));

  res.status(200).json({
    status: 'success',
    data: { competency },
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

  let competency = await Competency.findOne({ name, category });

  if (competency) {
    const existingMap = new Map(competency.targetGroups.map(t => [t.targetGroup, t.description]));
    targetGroups.forEach(tg => {
      existingMap.set(tg.targetGroup, tg.description || '');
    });
    competency.targetGroups = Array.from(existingMap, ([targetGroup, description]) => ({
      targetGroup,
      description,
    }));
    await competency.save();
  } else {
    competency = await Competency.create({
      name,
      category,
      targetGroups: targetGroups.map(tg => ({
        targetGroup: tg.targetGroup,
        description: tg.description || '',
      })),
    });
  }

  res.status(competency ? 200 : 201).json({
    status: 'success',
    message: competency ? 'Target groups merged/updated.' : 'Competency created.',
    data: { competency: competency.toObject() },
  });
});

// ─── UPDATE ──────────────────────────────────────────────────────────────────
export const updateCompetency = asyncHandler(async (req, res, next) => {
  const { name, category, targetGroups } = req.body;

  let competency = await Competency.findById(req.params.id);
  if (!competency) return next(new AppError('Competency not found.', 404));

  let updated = false;

  let newName = name !== undefined ? name : competency.name;
  let newCategory = category !== undefined ? category : competency.category;

  if (name !== undefined || category !== undefined) {
    const existing = await Competency.findOne({ name: newName, category: newCategory });
    if (existing && existing._id.toString() !== competency._id.toString()) {
      return next(new AppError('A competency with this name and category already exists.', 409));
    }
    competency.name = newName;
    competency.category = newCategory;
    updated = true;
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
    competency.targetGroups = targetGroups.map(tg => ({
      targetGroup: tg.targetGroup,
      description: tg.description || '',
    }));
    updated = true;
  }

  if (updated) await competency.save();

  res.status(200).json({
    status: 'success',
    data: { competency: competency.toObject() },
  });
});

// ─── DELETE ───────────────────────────────────────────────────────────────────
export const deleteCompetency = asyncHandler(async (req, res, next) => {
  const competency = await Competency.findById(req.params.id);
  if (!competency) return next(new AppError('Competency not found.', 404));

  await Question.deleteMany({ competencyId: competency._id });
  await Recommendation.deleteMany({ competencyId: competency._id });
  await competency.deleteOne();

  res.status(200).json({ status: 'success', message: 'Competency deleted.' });
});