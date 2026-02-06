/* routes/responseRoutes.js */
const express    = require('express');
const router     = express.Router();
const { protect, authorize } = require('../middleware/auth');
const rCtrl      = require('../controllers/responseController');

router.use(protect);

// ── Employee / Supervisor actions ─────────────────────────────────────────────
router.post('/save',                   rCtrl.saveAnswer);          // auto-save single answer
router.post('/submit',                 rCtrl.submitAssessment);    // full submission
router.get('/progress/:assessmentId',  rCtrl.getProgress);         // progress check

// ── HR_ADMIN: view & manually score ──────────────────────────────────────────
router.get('/:assessmentId/all',       authorize('HR_ADMIN'), rCtrl.getAllResponses);
router.patch('/:id/manual',            authorize('HR_ADMIN'), rCtrl.setManualScore);

module.exports = router;
