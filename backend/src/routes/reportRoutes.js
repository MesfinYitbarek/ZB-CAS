/* routes/reportRoutes.js */
import express from 'express';
import { protect, authorize } from '../middleware/auth.js';
import * as repCtrl from '../controllers/reportController.js';

const router = express.Router();

router.use(protect);

// ── HR_ADMIN: full access ─────────────────────────────────────────────────────
router.get('/', authorize('HR_ADMIN'), repCtrl.getReports);
router.get('/heatmap', authorize('HR_ADMIN'), repCtrl.getHeatmap);
router.get('/department/:department', authorize('HR_ADMIN'), repCtrl.getDepartmentReports);

// ── Individual reports (access-checked inside controller) ────────────────────
router.get('/individual/:userId', repCtrl.getIndividualReports);
router.get('/export/:userId', repCtrl.exportReports);

export default router;
