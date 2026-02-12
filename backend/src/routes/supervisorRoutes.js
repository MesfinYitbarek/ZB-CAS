/* routes/supervisorRoutes.js */
import express from 'express';
import { protect, authorize } from '../middleware/auth.js';
import * as supervisorCtrl from '../controllers/supervisorController.js';

const router = express.Router();

router.use(protect);

// ── All routes require SUPERVISOR role ─────────────────────────────────────
router.get('/pending', authorize('SUPERVISOR'), supervisorCtrl.getPendingEvaluations);
// router.patch('/evaluations/:assessmentId/:employeeId', 
//   authorize('SUPERVISOR'), 
//   supervisorCtrl.updateEvaluationStatus);
// router.get('/evaluations/:assessmentId/:employeeId/progress',
//   authorize('SUPERVISOR'),
//   supervisorCtrl.getEvaluationProgress);

// ── Get supervisor dashboard stats ─────────────────────────────────────────
router.get('/:id/dashboard', authorize('SUPERVISOR'), supervisorCtrl.getSupervisorDashboardStats);

export default router;
