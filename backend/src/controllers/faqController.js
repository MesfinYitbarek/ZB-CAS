/* controllers/faqController.js */
import prisma from '../config/prisma.js';
import AppError from '../utils/AppError.js';
import asyncHandler from '../utils/asyncHandler.js';
import logger from '../utils/logger.js';
import { logActivity } from '../services/activityService.js';

const mapFAQ = (f) => ({ ...f, _id: f.id });
const include = {
  createdByUser: { select: { id: true, name: true, username: true } },
  updatedByUser: { select: { id: true, name: true, username: true } },
};

// ─── GET ALL ACTIVE FAQS (PUBLIC) ────────────────────────────────────────────
export const getActiveFAQs = asyncHandler(async (req, res) => {
  const { category } = req.query;

  const where = { isActive: true };
  if (category && category !== 'ALL') {
    where.category = category;
  }

  const faqs = await prisma.fAQ.findMany({
    where,
    include,
    orderBy: [{ category: 'asc' }, { order: 'asc' }, { createdAt: 'desc' }],
  });

  res.status(200).json({ status: 'success', data: faqs.map(mapFAQ) });
});

// ─── GET ALL FAQS (ADMIN ONLY) ───────────────────────────────────────────────
export const getAllFAQs = asyncHandler(async (req, res) => {
  const { category, isActive } = req.query;

  const where = {};
  if (category && category !== 'ALL') where.category = category;
  if (isActive !== undefined) where.isActive = isActive === 'true';

  const faqs = await prisma.fAQ.findMany({
    where,
    include,
    orderBy: [{ category: 'asc' }, { order: 'asc' }, { createdAt: 'desc' }],
  });

  res.status(200).json({ status: 'success', data: faqs.map(mapFAQ) });
});

// ─── GET SINGLE FAQ ──────────────────────────────────────────────────────────
export const getFAQ = asyncHandler(async (req, res, next) => {
  const { id } = req.params;

  const faq = await prisma.fAQ.findUnique({ where: { id }, include });

  if (!faq) return next(new AppError('FAQ not found', 404));

  res.status(200).json({ status: 'success', data: mapFAQ(faq) });
});

// ─── CREATE FAQ (ADMIN ONLY) ─────────────────────────────────────────────────
export const createFAQ = asyncHandler(async (req, res, next) => {
  const { question, answer, category, order } = req.body;

  if (!question?.trim() || !answer?.trim()) {
    return next(new AppError('Question and answer are required', 400));
  }

  const faq = await prisma.fAQ.create({
    data: {
      question: question.trim(),
      answer: answer.trim(),
      category: category || 'GENERAL',
      order: order || 0,
      createdBy: req.user.id,
    },
    include,
  });

  logger.info({ event: 'faq_created', faqId: faq.id, createdBy: req.user.id });

  await logActivity({
    req,
    action: 'created',
    entity: 'FAQ',
    entityId: faq.id,
    description: `FAQ "${faq.question}" created`,
    metadata: { category: faq.category },
  });

  res.status(201).json({ status: 'success', data: mapFAQ(faq) });
});

// ─── UPDATE FAQ (ADMIN ONLY) ─────────────────────────────────────────────────
export const updateFAQ = asyncHandler(async (req, res, next) => {
  const { id } = req.params;
  const { question, answer, category, order, isActive } = req.body;

  const existing = await prisma.fAQ.findUnique({ where: { id } });
  if (!existing) return next(new AppError('FAQ not found', 404));

  const updateData = { updatedBy: req.user.id };
  if (question !== undefined) updateData.question = question.trim();
  if (answer !== undefined) updateData.answer = answer.trim();
  if (category !== undefined) updateData.category = category;
  if (order !== undefined) updateData.order = order;
  if (isActive !== undefined) updateData.isActive = isActive;

  const updatedFAQ = await prisma.fAQ.update({ where: { id }, data: updateData, include });

  logger.info({ event: 'faq_updated', faqId: id, updatedBy: req.user.id });

  await logActivity({
    req,
    action: 'updated',
    entity: 'FAQ',
    entityId: id,
    description: `FAQ "${updatedFAQ.question}" updated`,
    metadata: { category: updatedFAQ.category, isActive: updatedFAQ.isActive },
  });

  res.status(200).json({ status: 'success', data: mapFAQ(updatedFAQ) });
});

// ─── DELETE FAQ (ADMIN ONLY) ─────────────────────────────────────────────────
export const deleteFAQ = asyncHandler(async (req, res, next) => {
  const { id } = req.params;

  const existing = await prisma.fAQ.findUnique({ where: { id } });
  if (!existing) return next(new AppError('FAQ not found', 404));

  await prisma.fAQ.delete({ where: { id } });

  logger.info({ event: 'faq_deleted', faqId: id, deletedBy: req.user.id });

  await logActivity({
    req,
    action: 'deleted',
    entity: 'FAQ',
    entityId: id,
    description: `FAQ "${existing.question}" deleted`,
  });

  res.status(200).json({ status: 'success', message: 'FAQ deleted successfully' });
});

// ─── GET FAQ CATEGORIES ──────────────────────────────────────────────────────
export const getCategories = asyncHandler(async (req, res) => {
  const categories = [
    { value: 'GENERAL', label: 'General' },
    { value: 'ASSESSMENT', label: 'Assessment' },
    { value: 'ACCOUNT', label: 'Account' },
    { value: 'TECHNICAL', label: 'Technical' },
    { value: 'OTHER', label: 'Other' },
  ];
  res.status(200).json({ status: 'success', data: categories });
});
