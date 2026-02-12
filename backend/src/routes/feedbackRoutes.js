/* routes/feedbackRoutes.js */
import express from 'express';
import { protect, authorize } from '../middleware/auth.js';
import * as fbCtrl from '../controllers/feedbackController.js';

const router = express.Router();

router.use(protect);

// ── Employee: submit & view own ───────────────────────────────────────────────
router.post('/', fbCtrl.createFeedback);
router.get('/', fbCtrl.getFeedbacks);   // filtered by role
router.get('/:id', fbCtrl.getFeedback);

// ── HR_ADMIN: review ──────────────────────────────────────────────────────────
router.patch('/:id/review', authorize('HR_ADMIN'), fbCtrl.reviewFeedback);

export default router;
