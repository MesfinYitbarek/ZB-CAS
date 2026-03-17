/* routes/assessmentRoutes.js */
import express from 'express';
import { protect, authorize } from '../middleware/auth.js';
import * as aCtrl from '../controllers/assessmentController.js';

const router = express.Router();

router.use(protect);

// ── Employee/Department search (HR_ADMIN only) ────────────────────────────────
router.get('/employees/departments', aCtrl.getDepartments);
router.get('/employees/search', authorize('HR_ADMIN'), aCtrl.searchEmployees);

// ── Reads ─────────────────────────────────────────────────────────────────────
router.get('/', aCtrl.getAssessments);               // filtered by role inside
router.get('/active', aCtrl.getActiveAssessments);   // current user's active ones
router.get('/:id', aCtrl.getAssessment);

// ── Writes – HR_ADMIN ─────────────────────────────────────────────────────────
router.post('/', authorize('HR_ADMIN'), aCtrl.createAssessment);
router.post('/send-reminders', authorize('HR_ADMIN'), aCtrl.sendReminderEmails);
router.post('/:id/duplicate', authorize('HR_ADMIN'), aCtrl.duplicateAssessment);
router.put('/:id', authorize('HR_ADMIN'), aCtrl.updateAssessment);
router.patch('/:id/status', authorize('HR_ADMIN'), aCtrl.updateStatus);
router.delete('/:id', authorize('HR_ADMIN'), aCtrl.deleteAssessments);

export default router;
