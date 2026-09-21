/* routes/resultRoutes.js
 * SECURITY FIXES:
 *  A01 – /user/:userId now enforces that EMPLOYEE can only access their own results
 *  A01 – /pdp/:userId ownership enforced in controller
 *  A01 – /:id ownership enforced in controller
 *  NOTE: auto-score has no authorize() guard (needed by assessment submission flow)
 *        but ownership is checked inside the controller
 */
import express from 'express';
import { protect, authorize } from '../middleware/auth.js';
import * as resCtrl from '../controllers/resultController.js';

const router = express.Router();

router.use(protect);

// ── Scoring Triggers ───────────────────────────────────────────────────────
// HR_ADMIN: trigger bulk scoring for combined assessments
router.post('/score/:assessmentId', authorize('HR_ADMIN'), resCtrl.scoreAssessment);

// Auto-score: called on assessment submission; ownership enforced in controller
router.post('/auto-score', resCtrl.autoScoreEmployee);

// ── Filter options (must be before :id routes) ─────────────────────────────
router.get('/filter-options', resCtrl.getResultFilterOptions);
router.get('/filtered', resCtrl.getFilteredResults);

// ── Assessment-specific endpoints ──────────────────────────────────────────
router.get('/assessments/available', resCtrl.getAvailableAssessments);
router.get('/by-assessment/:assessmentId', resCtrl.getResultsByAssessment);

// ── Data Retrieval ─────────────────────────────────────────────────────────
router.get('/', resCtrl.getResults);
// FIX A01: /user/:userId — EMPLOYEE can only access own results (enforced in getResults)
router.get('/user/:userId', resCtrl.getResults);
// FIX A01: /pdp/:userId — ownership enforced in getPDP controller
router.get('/pdp/:userId', resCtrl.getPDP);
router.get('/supervisor-score/:assessmentId/:employeeId', authorize('SUPERVISOR', 'HR_ADMIN'), resCtrl.getSupervisorEvaluationScores);
// FIX A01: /:id — ownership enforced in getResult controller
router.get('/:id/question-details', resCtrl.getResultQuestionDetails);
router.get('/:id', resCtrl.getResult);

export default router;
