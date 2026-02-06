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
 *   correctAnswer is select:false on the model.  Only HR_ADMIN endpoints
 *   that explicitly need it (never exposed in GET responses to employees)
 *   use .select('+correctAnswer').
 */
const Question     = require('../models/Question');
const AppError     = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');

// ─── LIST ─────────────────────────────────────────────────────────────────────
exports.getQuestions = asyncHandler(async (req, res) => {
  const { competencyId, type, page = 1, limit = 30 } = req.query;

  const filter = {};
  if (competencyId) filter.competencyId = competencyId;
  if (type)         filter.type         = type;

  const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);

  const [questions, total] = await Promise.all([
    Question.find(filter)
      .populate('competencyId', 'name category')
      // correctAnswer is NOT selected here – safe for any role
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
// HR_ADMIN can see correctAnswer; others cannot.
exports.getQuestion = asyncHandler(async (req, res, next) => {
  let query = Question.findById(req.params.id).populate('competencyId', 'name category');

  // Only HR_ADMIN sees the answer key
  if (req.user.role === 'HR_ADMIN') {
    query = query.select('+correctAnswer');
  }

  const question = await query.lean();
  if (!question) return next(new AppError('Question not found.', 404));

  res.status(200).json({ status: 'success', data: { question } });
});

// ─── CREATE ──────────────────────────────────────────────────────────────────
exports.createQuestion = asyncHandler(async (req, res, next) => {
  const { competencyId, type, text, options, correctAnswer } = req.body;

  const question = await Question.create({
    competencyId,
    type,
    text,
    options:       options || [],
    correctAnswer: correctAnswer || null,
  });

  res.status(201).json({ status: 'success', data: { question } });
});

// ─── UPDATE ──────────────────────────────────────────────────────────────────
exports.updateQuestion = asyncHandler(async (req, res, next) => {
  const allowedFields = ['text', 'options', 'correctAnswer', 'type'];
  const updates = {};
  allowedFields.forEach((f) => {
    if (req.body[f] !== undefined) updates[f] = req.body[f];
  });

  if (Object.keys(updates).length === 0) {
    return next(new AppError('No valid fields to update.', 400));
  }

  const question = await Question.findByIdAndUpdate(req.params.id, updates, {
    new: true, runValidators: true,
  });

  if (!question) return next(new AppError('Question not found.', 404));

  res.status(200).json({ status: 'success', data: { question } });
});

// ─── DELETE ───────────────────────────────────────────────────────────────────
exports.deleteQuestion = asyncHandler(async (req, res, next) => {
  const question = await Question.findByIdAndDelete(req.params.id);
  if (!question) return next(new AppError('Question not found.', 404));

  res.status(200).json({ status: 'success', message: 'Question deleted.' });
});
