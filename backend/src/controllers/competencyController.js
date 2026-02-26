import Competency from '../models/Competency.js';
import Question from '../models/Question.js';
import Recommendation from '../models/Recommendation.js';
import AppError from '../utils/AppError.js';
import asyncHandler from '../utils/asyncHandler.js';

// ─── LIST ─────────────────────────────────────────────────────────────────────
export const getCompetencies = asyncHandler(async (req, res) => {
  const { category, page = 1, limit = 50 } = req.query;

  const filter = {};
  if (category) filter.category = category;

  const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);

  const [competencies, total] = await Promise.all([
    Competency.find(filter).skip(skip).limit(parseInt(limit, 10)).sort({ name: 1 }).lean(),
    Competency.countDocuments(filter),
  ]);

  // Attach question count for each competency
  const withCount = await Promise.all(
    competencies.map(async (c) => ({
      ...c,
      noOfQuestions: await Question.countDocuments({ competencyId: c._id }),
    }))
  );

  res.status(200).json({
    status: 'success',
    data: {
      competencies: withCount,
      pagination: { total, page: parseInt(page, 10), limit: parseInt(limit, 10) },
    },
  });
});

// ─── GET ONE ─────────────────────────────────────────────────────────────────
export const getCompetency = asyncHandler(async (req, res, next) => {
  const competency = await Competency.findById(req.params.id).lean();
  if (!competency) return next(new AppError('Competency not found.', 404));

  const noOfQuestions = await Question.countDocuments({ competencyId: competency._id });

  res.status(200).json({
    status: 'success',
    data:   { competency: { ...competency, noOfQuestions } },
  });
});

// ─── CREATE ──────────────────────────────────────────────────────────────────
export const createCompetency = asyncHandler(async (req, res, next) => {
  const { name, category,targetGroup, description } = req.body;

  const competency = await Competency.create({ name, category,targetGroup, description });

  res.status(201).json({
    status: 'success',
    data:   { competency: { ...competency.toObject(), noOfQuestions: 0 } },
  });
});

// ─── UPDATE ──────────────────────────────────────────────────────────────────
export const updateCompetency = asyncHandler(async (req, res, next) => {
  const { name, category, targetGroup, description } = req.body;
  const updates = {};
  if (name !== undefined)        updates.name        = name;
  if (category !== undefined)    updates.category    = category;
  if (description !== undefined) updates.description = description;
if (targetGroup !== undefined) updates.targetGroup = targetGroup;
  const competency = await Competency.findByIdAndUpdate(req.params.id, updates, {
    new: true, runValidators: true,
  });

  if (!competency) return next(new AppError('Competency not found.', 404));

  const noOfQuestions = await Question.countDocuments({ competencyId: competency._id });

  res.status(200).json({
    status: 'success',
    data:   { competency: { ...competency.toObject(), noOfQuestions } },
  });
});

// ─── DELETE ───────────────────────────────────────────────────────────────────
export const deleteCompetency = asyncHandler(async (req, res, next) => {
  const competency = await Competency.findById(req.params.id);
  if (!competency) return next(new AppError('Competency not found.', 404));

  // Cascade: remove related questions and recommendations
  await Question.deleteMany({ competencyId: competency._id });
  await Recommendation.deleteMany({ competencyId: competency._id });
  await competency.deleteOne();

  res.status(200).json({ status: 'success', message: 'Competency deleted.' });
});