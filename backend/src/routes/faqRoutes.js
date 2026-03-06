/* routes/faqRoutes.js */
import { Router } from 'express';
import { protect, authorize } from '../middleware/auth.js';
import {
  getActiveFAQs,
  getAllFAQs,
  getFAQ,
  createFAQ,
  updateFAQ,
  deleteFAQ,
  getCategories,
} from '../controllers/faqController.js';

const router = Router();

// Public routes (no auth required)
router.get('/public', getActiveFAQs);
router.get('/categories', getCategories);

// Protected routes - require authentication
router.use(protect);

// Admin only routes
router.get('/all', authorize('HR_ADMIN'), getAllFAQs);
router.post('/', authorize('HR_ADMIN'), createFAQ);
router.get('/:id', getFAQ);
router.patch('/:id', authorize('HR_ADMIN'), updateFAQ);
router.delete('/:id', authorize('HR_ADMIN'), deleteFAQ);

export default router;
