import express from 'express';
import { protect, authorize } from '../middleware/auth.js';
import * as resCtrl from '../controllers/resultController.js';

const router = express.Router();

router.use(protect);

// ── Scoring Triggers ───────────────────────────────────────────────────────
router.post('/score/:assessmentId', authorize('HR_ADMIN'), resCtrl.scoreAssessment);
router.post('/auto-score', resCtrl.autoScoreEmployee);

// ── Filter options (must be before :id routes) ─────────────────────────────
router.get('/filter-options', resCtrl.getResultFilterOptions);
router.get('/filtered', resCtrl.getFilteredResults);

// ── Assessment-specific endpoints ──────────────────────────────────────────
router.get('/assessments/available', resCtrl.getAvailableAssessments);
router.get('/by-assessment/:assessmentId', resCtrl.getResultsByAssessment);

// ── Data Retrieval ─────────────────────────────────────────────────────────
router.get('/', resCtrl.getResults);
router.get('/user/:userId', resCtrl.getResults);
router.get('/pdp/:userId', resCtrl.getPDP);
router.get('/supervisor-score/:assessmentId/:employeeId', resCtrl.getSupervisorEvaluationScores);
router.get('/:id/question-details', resCtrl.getResultQuestionDetails);
router.get('/:id', resCtrl.getResult);

export default router;
