// controllers/questionController.js
import prisma from '../config/prisma.js';
import AppError from '../utils/AppError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { applyQuestionDefaults } from '../utils/questionValidation.js';
import { logActivity } from '../services/activityService.js';
import { normalizeTargetGroup, denormalizeTargetGroup } from '../utils/targetGroup.js';

// ───────────────────────── GET LIST ─────────────────────────
export const getQuestions = asyncHandler(async (req, res) => {
  const { competencyId, targetGroup, type, page = 1, limit = 30 } = req.query;

  const where = {};
  if (competencyId) where.competencyId = competencyId;
  if (targetGroup)  where.targetGroup  = normalizeTargetGroup(targetGroup);
  if (type)         where.type         = type;

  const skip = (Number(page) - 1) * Number(limit);

  const [questions, total] = await Promise.all([
    prisma.question.findMany({
      where,
      include: { competency: { select: { id: true, name: true, category: true, targetGroups: true } } },
      skip,
      take: Number(limit),
      orderBy: { createdAt: 'desc' },
    }),
    prisma.question.count({ where }),
  ]);

  res.status(200).json({
    status: 'success',
    data: {
      questions: questions.map((q) => ({
        ...q,
        _id: q.id,
        targetGroup: denormalizeTargetGroup(q.targetGroup),
        competencyId: q.competency,
      })),
      pagination: { total, page: +page, limit: +limit },
    },
  });
});

// ───────────────────────── GET ONE ─────────────────────────
export const getQuestion = asyncHandler(async (req, res, next) => {
  const question = await prisma.question.findUnique({
    where: { id: req.params.id },
    include: { competency: { select: { id: true, name: true, category: true } } },
  });

  if (!question) return next(new AppError('Question not found.', 404));

  // Strip secret fields unless HR_ADMIN
  let data = { ...question };
  if (req.user.role !== 'HR_ADMIN') {
    const { correctAnswer, correctAnswers, matchingPairs, correctOrder, categories, ...safe } = data;
    data = safe;
  }
  data._id = data.id;
  data.competencyId = data.competency;

  res.status(200).json({ status: 'success', data: { question: data } });
});

// ───────────────────────── CREATE SINGLE ─────────────────────────
export const createQuestion = asyncHandler(async (req, res, next) => {
  let data;
  try {
    data = applyQuestionDefaults(req.body);
  } catch (e) {
    return next(new AppError(e.message, 400));
  }

  const question = await prisma.question.create({ data });

  await logActivity({
    req,
    action: 'created',
    entity: 'Question',
    entityId: question.id,
    description: `Question created (${question.type})`,
    metadata: { competencyId: question.competencyId, type: question.type, targetGroup: question.targetGroup },
  });

  res.status(201).json({ status: 'success', data: { question: { ...question, _id: question.id } } });
});

// ───────────────────────── CREATE BATCH (FIXED) ─────────────────────────
export const batchCreateQuestions = asyncHandler(async (req, res, next) => {
  const { questions } = req.body;

  if (!Array.isArray(questions) || questions.length === 0) {
    return next(new AppError('Questions array required.', 400));
  }

  const created = [];

  for (const q of questions) {
    let data;
    try {
      data = applyQuestionDefaults(q);
    } catch (e) {
      return next(new AppError(e.message, 400));
    }
    const doc = await prisma.question.create({ data });
    created.push(doc);
  }

  await logActivity({
    req,
    action: 'bulk_created',
    entity: 'Question',
    description: `Created ${created.length} question(s)`,
    metadata: { count: created.length },
  });

  res.status(201).json({
    status: 'success',
    data: {
      count: created.length,
      questions: created.map((q) => ({ ...q, _id: q.id })),
    },
  });
});

// ───────────────────────── UPDATE ─────────────────────────
export const updateQuestion = asyncHandler(async (req, res, next) => {
  const question = await prisma.question.findUnique({ where: { id: req.params.id } });
  if (!question) return next(new AppError('Question not found.', 404));

  let data;
  try {
    data = applyQuestionDefaults({ ...question, ...req.body });
  } catch (e) {
    return next(new AppError(e.message, 400));
  }

  const updated = await prisma.question.update({
    where: { id: req.params.id },
    data,
  });

  await logActivity({
    req,
    action: 'updated',
    entity: 'Question',
    entityId: updated.id,
    description: 'Question updated',
  });

  res.status(200).json({ status: 'success', data: { question: { ...updated, _id: updated.id } } });
});

// ───────────────────────── DELETE ─────────────────────────
export const deleteQuestion = asyncHandler(async (req, res, next) => {
  const question = await prisma.question.findUnique({ where: { id: req.params.id } });
  if (!question) return next(new AppError('Question not found.', 404));

  await prisma.question.delete({ where: { id: req.params.id } });

  await logActivity({
    req,
    action: 'deleted',
    entity: 'Question',
    entityId: req.params.id,
    description: `Question deleted (${question.type})`,
  });

  res.status(200).json({ status: 'success', message: 'Question deleted.' });
});

export const bulkDeleteQuestions = asyncHandler(async (req, res, next) => {
  const { ids } = req.body;

  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    return next(new AppError('Please provide an array of question IDs.', 400));
  }

  const result = await prisma.question.deleteMany({ where: { id: { in: ids } } });

  await logActivity({
    req,
    action: 'bulk_deleted',
    entity: 'Question',
    description: `Deleted ${result.count} question(s)`,
    metadata: { count: result.count },
  });

  res.status(200).json({
    status: 'success',
    message: `${result.count} question(s) deleted.`,
  });
});

// ─── DOWNLOAD UPLOAD FORMAT GUIDE (.txt sample) ─────────────────────────────
// The document upload parses plain-text question files — this sample shows the
// exact format the parser expects. Mark the correct MCQ option with *.
const QUESTION_FORMAT_SAMPLE = `Type: MCQ
Question 1: What does RAM stand for?
a) Read Access Memory
b) Random Access Memory *
c) Rapid Access Module
d) Read Anywhere Memory
Score: 2

Type: TrueFalse
Question 2: The CPU is the brain of the computer.
Answer: True

Type: MultiSelect
Question 3: Which are programming languages?
a) Python *
b) HTML *
c) Photoshop
d) JavaScript *

Type: Matching
Question 4: Match the term to its definition.
CPU -> Processes instructions
RAM -> Temporary memory
HDD -> Permanent storage

Type: Ordering
Question 5: Order the OSI model layers (bottom up).
1. Physical
2. Data Link
3. Network
4. Transport

Type: Rating
Question 6: Rate your communication skills.
`;

export const downloadQuestionTemplate = asyncHandler(async (req, res) => {
  const buf = Buffer.from(QUESTION_FORMAT_SAMPLE, 'utf8');
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="question-upload-format.txt"');
  res.send(buf);
});
