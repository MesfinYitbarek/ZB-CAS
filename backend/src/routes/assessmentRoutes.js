/* routes/assessmentRoutes.js */
import express from 'express';
import { protect, authorize } from '../middleware/auth.js';
import * as aCtrl from '../controllers/assessmentController.js';

const router = express.Router();

router.use(protect);

// ── Reads ─────────────────────────────────────────────────────────────────────
router.get('/', aCtrl.getAssessments);        // filtered by role inside
router.get('/active', aCtrl.getActiveAssessments);  // current user's active ones
router.get('/:id', aCtrl.getAssessment);

// ── Writes – HR_ADMIN ─────────────────────────────────────────────────────────
router.post('/', authorize('HR_ADMIN'), aCtrl.createAssessment);
router.put('/:id', authorize('HR_ADMIN'), aCtrl.updateAssessment);
router.patch('/:id/status', authorize('HR_ADMIN'), aCtrl.updateStatus);
router.delete('/:id', authorize('HR_ADMIN'), aCtrl.deleteAssessments);

export default router;
