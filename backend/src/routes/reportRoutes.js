/* routes/reportRoutes.js */
const express    = require('express');
const router     = express.Router();
const { protect, authorize } = require('../middleware/auth');
const repCtrl    = require('../controllers/reportController');

router.use(protect);

// ── HR_ADMIN: full access ─────────────────────────────────────────────────────
router.get('/',                                authorize('HR_ADMIN'), repCtrl.getReports);
router.get('/heatmap',                         authorize('HR_ADMIN'), repCtrl.getHeatmap);
router.get('/department/:department',          authorize('HR_ADMIN'), repCtrl.getDepartmentReports);

// ── Individual reports (access-checked inside controller) ────────────────────
router.get('/individual/:userId',             repCtrl.getIndividualReports);
router.get('/export/:userId',                 repCtrl.exportReports);

module.exports = router;
