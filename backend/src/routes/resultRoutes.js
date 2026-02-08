/* routes/resultRoutes.js */
const express    = require('express');
const router     = express.Router();
const { protect, authorize } = require('../middleware/auth');
const resCtrl    = require('../controllers/resultController');

router.use(protect);

// ── HR_ADMIN: trigger scoring & finalise ──────────────────────────────────────
router.post('/score/:assessmentId',    authorize('HR_ADMIN', "EMPLOYEE"), resCtrl.scoreAssessment);
router.patch('/:id/finalise',          authorize('HR_ADMIN'), resCtrl.finaliseResult);

// ── Reads (role-filtered inside controller) ──────────────────────────────────
router.get('/',                        resCtrl.getResults);
router.get('/user/:userId',           resCtrl.getUserResults);
router.get('/pdp/:userId',            resCtrl.getPDP);
router.get('/:id',                     resCtrl.getResult);


router.post(
  '/auto-score',
  protect,
  authorize('SUPERVISOR'),
  resCtrl.autoScoreEmployee
);


router.get(
  '/supervisor-score/:assessmentId/:employeeId',
  protect,
  resCtrl.getSupervisorEvaluationScores
);

module.exports = router;
