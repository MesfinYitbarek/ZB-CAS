/* routes/reportRoutes.js
 * Tier 1 — live analytics (computed on-request from FINAL results of
 * COMPLETED assessments).
 * Tier 2 — named on-demand reports with stored Excel artifacts (Excel only).
 */
import express from 'express';
import { protect, authorize } from '../middleware/auth.js';
import * as repCtrl from '../controllers/reportController.js';
import * as analyticsCtrl from '../controllers/analyticsController.js';
import * as genCtrl from '../controllers/generatedReportController.js';

const router = express.Router();

router.use(protect);

// ── Live analytics (Tier 1) — high-level views computed live from FINAL
//    results of COMPLETED assessments ─────────────────────────────────────────
router.get('/stats',          authorize('HR_ADMIN'),              analyticsCtrl.getLiveStats);
router.get('/filter-options', authorize('HR_ADMIN', 'SUPERVISOR'), analyticsCtrl.getFilterOptions);
router.get('/heatmap',        authorize('HR_ADMIN'),              analyticsCtrl.getLiveHeatmap);
router.get('/department/:department', authorize('HR_ADMIN', 'SUPERVISOR'), analyticsCtrl.getLiveDepartmentSummary);

// ── Employee selector ─────────────────────────────────────────────────────────
router.get('/employees', authorize('HR_ADMIN', 'SUPERVISOR'), repCtrl.getEmployees);

// ── Generated reports (Tier 2) — named records with stored Excel artifacts ───
router.post('/pivot-preview',           authorize('HR_ADMIN'), genCtrl.previewPivot);
router.post('/generate',                 authorize('HR_ADMIN', 'SUPERVISOR', 'EMPLOYEE'), genCtrl.createGeneratedReport);
router.get('/generated',                 authorize('HR_ADMIN', 'SUPERVISOR', 'EMPLOYEE'), genCtrl.listGeneratedReports);
router.get('/generated/:id',             authorize('HR_ADMIN', 'SUPERVISOR', 'EMPLOYEE'), genCtrl.getGeneratedReport);
router.get('/generated/:id/preview',     authorize('HR_ADMIN', 'SUPERVISOR', 'EMPLOYEE'), genCtrl.previewGeneratedReport);
router.get('/generated/:id/download',    authorize('HR_ADMIN', 'SUPERVISOR', 'EMPLOYEE'), genCtrl.downloadGeneratedReport);
router.delete('/generated/:id',          authorize('HR_ADMIN', 'SUPERVISOR', 'EMPLOYEE'), genCtrl.deleteGeneratedReport);

export default router;
