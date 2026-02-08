/* routes/supervisorRoutes.js */
const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const supervisorCtrl = require('../controllers/supervisorController');

router.use(protect);

// ── All routes require SUPERVISOR role ─────────────────────────────────────
router.get('/pending', authorize('SUPERVISOR'), supervisorCtrl.getPendingEvaluations);
router.patch('/evaluations/:assessmentId/:employeeId', 
  authorize('SUPERVISOR'), 
  supervisorCtrl.updateEvaluationStatus);
router.get('/evaluations/:assessmentId/:employeeId/progress',
  authorize('SUPERVISOR'),
  supervisorCtrl.getEvaluationProgress);

// ── Get supervisor dashboard stats ─────────────────────────────────────────
router.get('/:id/dashboard', authorize('SUPERVISOR'), supervisorCtrl.getSupervisorDashboardStats);

module.exports = router;