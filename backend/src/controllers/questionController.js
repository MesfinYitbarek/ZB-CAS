// controllers/questionController.js
import Question from '../models/Question.js';
import AppError from '../utils/AppError.js';
import asyncHandler from '../utils/asyncHandler.js';

const SECRET_FIELDS =
  '+correctAnswer +correctAnswers +matchingPairs +correctOrder +categories';

// ───────────────────────── GET LIST ─────────────────────────
export const getQuestions = asyncHandler(async (req, res) => {
  const { competencyId, targetGroup, type, page = 1, limit = 30 } = req.query;

  const filter = {};
  if (competencyId) filter.competencyId = competencyId;
  if (targetGroup) filter.targetGroup = targetGroup;
  if (type) filter.type = type;

  const skip = (page - 1) * limit;

  const [questions, total] = await Promise.all([
    Question.find(filter)
      .populate('competencyId', 'name category targetGroups')
      .skip(skip)
      .limit(limit)
      .sort({ createdAt: -1 })
      .lean(),
    Question.countDocuments(filter),
  ]);

  res.status(200).json({
    status: 'success',
    data: { questions, pagination: { total, page: +page, limit: +limit } },
  });
});

// ───────────────────────── GET ONE ─────────────────────────
export const getQuestion = asyncHandler(async (req, res, next) => {
  let query = Question.findById(req.params.id).populate(
    'competencyId',
    'name category'
  );

  if (req.user.role === 'HR_ADMIN') {
    query = query.select(SECRET_FIELDS);
  }

  const question = await query.lean();

  if (!question) return next(new AppError('Question not found.', 404));

  res.status(200).json({ status: 'success', data: { question } });
});

// ───────────────────────── CREATE SINGLE ─────────────────────────
export const createQuestion = asyncHandler(async (req, res) => {
  const question = new Question(req.body);
  await question.save();

  res.status(201).json({ status: 'success', data: { question } });
});

// ───────────────────────── CREATE BATCH (FIXED) ─────────────────────────
export const batchCreateQuestions = asyncHandler(async (req, res, next) => {
  const { questions } = req.body;

  if (!Array.isArray(questions) || questions.length === 0) {
    return next(new AppError('Questions array required.', 400));
  }

  const created = [];

  for (const q of questions) {
    const doc = new Question(q);
    await doc.save(); // ✅ triggers middleware
    created.push(doc);
  }

  res.status(201).json({
    status: 'success',
    data: {
      count: created.length,
      questions: created,
    },
  });
});

// ───────────────────────── UPDATE ─────────────────────────
export const updateQuestion = asyncHandler(async (req, res, next) => {
  const question = await Question.findById(req.params.id).select(
    SECRET_FIELDS
  );

  if (!question) return next(new AppError('Question not found.', 404));

  Object.assign(question, req.body);

  await question.save(); // ✅ triggers middleware again

  res.status(200).json({ status: 'success', data: { question } });
});

// ───────────────────────── DELETE ─────────────────────────
export const deleteQuestion = asyncHandler(async (req, res, next) => {
  const question = await Question.findByIdAndDelete(req.params.id);
  if (!question) return next(new AppError('Question not found.', 404));

  res.status(200).json({ status: 'success', message: 'Question deleted.' });
});

export const bulkDeleteQuestions = asyncHandler(async (req, res, next) => {
  const { ids } = req.body;

  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    return next(new AppError('Please provide an array of question IDs.', 400));
  }

  const result = await Question.deleteMany({ _id: { $in: ids } });

  res.status(200).json({
    status: 'success',
    message: `${result.deletedCount} question(s) deleted.`,
  });
});
