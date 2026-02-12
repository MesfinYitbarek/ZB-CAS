import express from 'express';
import { protect, authorize } from '../middleware/auth.js';
import * as resCtrl from '../controllers/resultController.js';

const router = express.Router();

router.use(protect);

// ── Scoring Triggers ───────────────────────────────────────────────────────
router.post('/score/:assessmentId', authorize('HR_ADMIN'), resCtrl.scoreAssessment);
router.post('/auto-score', resCtrl.autoScoreEmployee); // Used by FE on submit

// ── Assessment-specific endpoints ──────────────────────────────────────────
router.get('/assessments/available', resCtrl.getAvailableAssessments);
router.get('/by-assessment/:assessmentId', resCtrl.getResultsByAssessment);

// ── Data Retrieval ─────────────────────────────────────────────────────────
router.get('/', resCtrl.getResults);
router.get('/user/:userId', resCtrl.getResults); // Reuse getResults logic
router.get('/pdp/:userId', resCtrl.getPDP);
router.get('/:id', resCtrl.getResult);
router.get('/supervisor-score/:assessmentId/:employeeId', resCtrl.getSupervisorEvaluationScores);

export default router;