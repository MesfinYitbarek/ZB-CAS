/* routes/feedbackRoutes.js */
const express    = require('express');
const router     = express.Router();
const { protect, authorize } = require('../middleware/auth');
const fbCtrl     = require('../controllers/feedbackController');

router.use(protect);

// ── Employee: submit & view own ───────────────────────────────────────────────
router.post('/',                               fbCtrl.createFeedback);
router.get('/',                                fbCtrl.getFeedbacks);   // filtered by role
router.get('/:id',                             fbCtrl.getFeedback);

// ── HR_ADMIN: review ──────────────────────────────────────────────────────────
router.patch('/:id/review',                    authorize('HR_ADMIN'), fbCtrl.reviewFeedback);

module.exports = router;
