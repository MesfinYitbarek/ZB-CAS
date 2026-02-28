/* routes/feedbackRoutes.js */
import express from 'express';
import { protect, authorize } from '../middleware/auth.js';
import * as fbCtrl from '../controllers/feedbackController.js';

const router = express.Router();

router.use(protect);

// ── Employee: submit & view own ───────────────────────────────────────────────
router.post('/', fbCtrl.createFeedback);
router.get('/eligible-assessments', fbCtrl.getEligibleAssessmentsForFeedback);
router.get('/', fbCtrl.getFeedbacks);   // filtered by role
router.get('/:id', fbCtrl.getFeedback);

// ── HR_ADMIN: summary card view + detail drill-down ───────────────────────────
router.get('/admin/summary', authorize('HR_ADMIN'), fbCtrl.getFeedbackSummaryByAssessment);
router.get('/admin/by-assessment/:assessmentId', authorize('HR_ADMIN'), fbCtrl.getFeedbacksByAssessment);


export default router;
