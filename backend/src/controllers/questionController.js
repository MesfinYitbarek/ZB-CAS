/* controllers/questionController.js
 * Question Bank management.
 *
 * GET    /questions              – list (filter by competencyId, type)
 * GET    /questions/:id          – single (correctAnswer excluded for non-admin)
 * POST   /questions              – create (HR_ADMIN)
 * PUT    /questions/:id          – update (HR_ADMIN)
 * DELETE /questions/:id          – delete (HR_ADMIN)
 *
 * OWASP / integrity:
 *   correctAnswer, correctAnswers, matchingPairs, correctOrder, categories
 *   are all select:false on the model.  Only HR_ADMIN endpoints that explicitly
 *   need them use .select('+correctAnswer +correctAnswers ...').
 */
const Question = require('../models/Question');
const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');

// Fields that contain answer keys (hidden by default via select:false)
const SECRET_FIELDS = '+correctAnswer +correctAnswers +matchingPairs +correctOrder +categories';

// ─── LIST ─────────────────────────────────────────────────────────────────────
exports.getQuestions = asyncHandler(async (req, res) => {
  const { competencyId, type, page = 1, limit = 30 } = req.query;

  const filter = {};
  if (competencyId) filter.competencyId = competencyId;
  if (type) filter.type = type;

  const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);

  const [questions, total] = await Promise.all([
    Question.find(filter)
      .populate('competencyId', 'name category')
      // correctAnswer / correctAnswers / etc. are NOT selected here – safe for any role
      .skip(skip)
      .limit(parseInt(limit, 10))
      .sort({ createdAt: -1 })
      .lean(),
    Question.countDocuments(filter),
  ]);

  res.status(200).json({
    status: 'success',
    data: {
      questions,
      pagination: { total, page: parseInt(page, 10), limit: parseInt(limit, 10) },
    },
  });
});

// ─── GET ONE ─────────────────────────────────────────────────────────────────
// HR_ADMIN can see all answer keys; others cannot.
exports.getQuestion = asyncHandler(async (req, res, next) => {
  let query = Question.findById(req.params.id).populate('competencyId', 'name category');

  // Only HR_ADMIN sees the answer keys
  if (req.user.role === 'HR_ADMIN') {
    query = query.select(SECRET_FIELDS);
  }

  const question = await query.lean();
  if (!question) return next(new AppError('Question not found.', 404));

  res.status(200).json({ status: 'success', data: { question } });
});

// ─── CREATE ──────────────────────────────────────────────────────────────────
exports.createQuestion = asyncHandler(async (req, res, next) => {
  const {
    competencyId,
    type,
    text,
    score,
    options,
    correctAnswer,
    correctAnswers,
    scenario,
    matchingPairs,
    correctOrder,
    categories,
  } = req.body;

  const question = await Question.create({
    competencyId,
    type,
    text,
    score: score ?? 1,
    options: options || [],
    correctAnswer: correctAnswer || null,
    correctAnswers: correctAnswers || [],
    scenario: scenario || '',
    matchingPairs: matchingPairs || [],
    correctOrder: correctOrder || [],
    categories: categories || null,
  });

  res.status(201).json({ status: 'success', data: { question } });
});

// ─── UPDATE ──────────────────────────────────────────────────────────────────
exports.updateQuestion = asyncHandler(async (req, res, next) => {
  const allowedFields = [
    'text',
    'type',
    'score',
    'options',
    'correctAnswer',
    'correctAnswers',
    'scenario',
    'matchingPairs',
    'correctOrder',
    'categories',
  ];

  const updates = {};
  allowedFields.forEach((f) => {
    if (req.body[f] !== undefined) updates[f] = req.body[f];
  });

  if (Object.keys(updates).length === 0) {
    return next(new AppError('No valid fields to update.', 400));
  }

  // Use findById + save so that the pre-save hook runs (shuffles, validates)
  const question = await Question.findById(req.params.id).select(SECRET_FIELDS);
  if (!question) return next(new AppError('Question not found.', 404));

  Object.assign(question, updates);
  await question.save();

  res.status(200).json({ status: 'success', data: { question } });
});

// ─── DELETE ───────────────────────────────────────────────────────────────────
exports.deleteQuestion = asyncHandler(async (req, res, next) => {
  const question = await Question.findByIdAndDelete(req.params.id);
  if (!question) return next(new AppError('Question not found.', 404));

  res.status(200).json({ status: 'success', message: 'Question deleted.' });
});
