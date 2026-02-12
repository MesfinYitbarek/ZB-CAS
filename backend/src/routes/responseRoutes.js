/* routes/responseRoutes.js */
import express from 'express';
import { protect, authorize } from '../middleware/auth.js';
import * as rCtrl from '../controllers/responseController.js';

const router = express.Router();

// All routes in this file require authentication
router.use(protect);

// ─── EMPLOYEE ACTIONS ────────────────────────────────────────────────────────
// Auto-save and progress tracking for the person taking the assessment
router.post('/save', rCtrl.saveAnswer);
router.post('/submit', rCtrl.submitAssessment);
router.get('/progress/:assessmentId', rCtrl.getProgress);

// ─── SUPERVISOR ACTIONS ─────────────────────────────────────────────────────
// Supervisor evaluation routes
router.post('/supervisor/save', authorize('SUPERVISOR'), rCtrl.saveSupervisorEvaluation);
router.post('/supervisor/submit', authorize('SUPERVISOR'), rCtrl.submitSupervisorEvaluation);
router.get('/supervisor/:assessmentId/:employeeId', authorize('SUPERVISOR'), rCtrl.getSupervisorEvaluation);

// ─── HR_ADMIN ACTIONS ───────────────────────────────────────────────────────
// Restricted to HR_ADMIN only
router.get('/admin/:assessmentId/all', authorize('HR_ADMIN'), rCtrl.getAllResponses);
router.patch('/admin/manual-score/:id', authorize('HR_ADMIN'), rCtrl.setManualScore);

export default router;
