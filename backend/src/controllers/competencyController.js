/* controllers/competencyController.js
 * Competency framework CRUD.
 *
 * GET    /competencies           – list (filterable by category)
 * GET    /competencies/:id       – single
 * POST   /competencies           – create (HR_ADMIN)
 * PUT    /competencies/:id       – update (HR_ADMIN)
 * DELETE /competencies/:id       – hard delete (HR_ADMIN)
 */
const Competency   = require('../models/Competency');
const Question     = require('../models/Question');
const AppError     = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');

// ─── LIST ─────────────────────────────────────────────────────────────────────
exports.getCompetencies = asyncHandler(async (req, res) => {
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
exports.getCompetency = asyncHandler(async (req, res, next) => {
  const competency = await Competency.findById(req.params.id).lean();
  if (!competency) return next(new AppError('Competency not found.', 404));

  const noOfQuestions = await Question.countDocuments({ competencyId: competency._id });

  res.status(200).json({
    status: 'success',
    data:   { competency: { ...competency, noOfQuestions } },
  });
});

// ─── CREATE ──────────────────────────────────────────────────────────────────
exports.createCompetency = asyncHandler(async (req, res, next) => {
  const { name, category, description } = req.body;

  const competency = await Competency.create({ name, category, description });

  res.status(201).json({
    status: 'success',
    data:   { competency: { ...competency.toObject(), noOfQuestions: 0 } },
  });
});

// ─── UPDATE ──────────────────────────────────────────────────────────────────
exports.updateCompetency = asyncHandler(async (req, res, next) => {
  const { name, category, description } = req.body;
  const updates = {};
  if (name !== undefined)        updates.name        = name;
  if (category !== undefined)    updates.category    = category;
  if (description !== undefined) updates.description = description;

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
exports.deleteCompetency = asyncHandler(async (req, res, next) => {
  const competency = await Competency.findById(req.params.id);
  if (!competency) return next(new AppError('Competency not found.', 404));

  // Cascade: remove related questions and recommendations
  await Question.deleteMany({ competencyId: competency._id });
  const Recommendation = require('../models/Recommendation');
  await Recommendation.deleteMany({ competencyId: competency._id });
  await competency.deleteOne();

  res.status(200).json({ status: 'success', message: 'Competency deleted.' });
});
