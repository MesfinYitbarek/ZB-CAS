/* routes/assessmentRoutes.js */
const express    = require('express');
const router     = express.Router();
const { protect, authorize } = require('../middleware/auth');
const aCtrl      = require('../controllers/assessmentController');

router.use(protect);

// ── Reads ─────────────────────────────────────────────────────────────────────
router.get('/',                        aCtrl.getAssessments);        // filtered by role inside
router.get('/active',                  aCtrl.getActiveAssessments);  // current user's active ones
router.get('/:id',                     aCtrl.getAssessment);

// ── Writes – HR_ADMIN ─────────────────────────────────────────────────────────
router.post('/',                       authorize('HR_ADMIN'), aCtrl.createAssessment);
router.put('/:id',                     authorize('HR_ADMIN'), aCtrl.updateAssessment);
router.patch('/:id/status',            authorize('HR_ADMIN'), aCtrl.updateStatus);
router.delete('/:id',                  authorize('HR_ADMIN'), aCtrl.deleteAssessments);

module.exports = router;
