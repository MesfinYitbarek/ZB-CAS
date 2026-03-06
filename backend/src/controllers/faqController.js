/* controllers/faqController.js */
import FAQ from '../models/FAQ.js';
import AppError from '../utils/AppError.js';
import asyncHandler from '../utils/asyncHandler.js';
import logger from '../utils/logger.js';

// ─── GET ALL ACTIVE FAQS (PUBLIC) ────────────────────────────────────────────
export const getActiveFAQs = asyncHandler(async (req, res) => {
  const { category } = req.query;
  
  const query = { isActive: true };
  if (category && category !== 'ALL') {
    query.category = category;
  }

  const faqs = await FAQ.find(query)
    .sort({ category: 1, order: 1, createdAt: -1 })
    .populate('createdBy', 'name username');

  res.status(200).json({
    status: 'success',
    data: faqs,
  });
});

// ─── GET ALL FAQS (ADMIN ONLY) ───────────────────────────────────────────────
export const getAllFAQs = asyncHandler(async (req, res) => {
  const { category, isActive } = req.query;
  
  const query = {};
  if (category && category !== 'ALL') {
    query.category = category;
  }
  if (isActive !== undefined) {
    query.isActive = isActive === 'true';
  }

  const faqs = await FAQ.find(query)
    .sort({ category: 1, order: 1, createdAt: -1 })
    .populate('createdBy', 'name username')
    .populate('updatedBy', 'name username');

  res.status(200).json({
    status: 'success',
    data: faqs,
  });
});

// ─── GET SINGLE FAQ ──────────────────────────────────────────────────────────
export const getFAQ = asyncHandler(async (req, res, next) => {
  const { id } = req.params;
  
  const faq = await FAQ.findById(id)
    .populate('createdBy', 'name username')
    .populate('updatedBy', 'name username');

  if (!faq) {
    return next(new AppError('FAQ not found', 404));
  }

  res.status(200).json({
    status: 'success',
    data: faq,
  });
});

// ─── CREATE FAQ (ADMIN ONLY) ─────────────────────────────────────────────────
export const createFAQ = asyncHandler(async (req, res, next) => {
  const { question, answer, category, order } = req.body;

  if (!question?.trim() || !answer?.trim()) {
    return next(new AppError('Question and answer are required', 400));
  }

  const faq = await FAQ.create({
    question: question.trim(),
    answer: answer.trim(),
    category: category || 'GENERAL',
    order: order || 0,
    createdBy: req.user.id,
  });

  logger.info({
    event: 'faq_created',
    faqId: faq._id,
    createdBy: req.user.id,
  });

  res.status(201).json({
    status: 'success',
    data: faq,
  });
});

// ─── UPDATE FAQ (ADMIN ONLY) ─────────────────────────────────────────────────
export const updateFAQ = asyncHandler(async (req, res, next) => {
  const { id } = req.params;
  const { question, answer, category, order, isActive } = req.body;

  const faq = await FAQ.findById(id);
  if (!faq) {
    return next(new AppError('FAQ not found', 404));
  }

  const updateData = {
    updatedBy: req.user.id,
  };

  if (question !== undefined) updateData.question = question.trim();
  if (answer !== undefined) updateData.answer = answer.trim();
  if (category !== undefined) updateData.category = category;
  if (order !== undefined) updateData.order = order;
  if (isActive !== undefined) updateData.isActive = isActive;

  const updatedFAQ = await FAQ.findByIdAndUpdate(
    id,
    updateData,
    { new: true, runValidators: true }
  );

  logger.info({
    event: 'faq_updated',
    faqId: id,
    updatedBy: req.user.id,
  });

  res.status(200).json({
    status: 'success',
    data: updatedFAQ,
  });
});

// ─── DELETE FAQ (ADMIN ONLY) ─────────────────────────────────────────────────
export const deleteFAQ = asyncHandler(async (req, res, next) => {
  const { id } = req.params;

  const faq = await FAQ.findById(id);
  if (!faq) {
    return next(new AppError('FAQ not found', 404));
  }

  await FAQ.findByIdAndDelete(id);

  logger.info({
    event: 'faq_deleted',
    faqId: id,
    deletedBy: req.user.id,
  });

  res.status(200).json({
    status: 'success',
    message: 'FAQ deleted successfully',
  });
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

  res.status(200).json({
    status: 'success',
    data: categories,
  });
});
