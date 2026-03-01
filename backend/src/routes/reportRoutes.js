/* routes/reportRoutes.js  –  v2 with advanced analytics */
import express from 'express';
import { protect, authorize } from '../middleware/auth.js';
import * as repCtrl from '../controllers/reportController.js';

const router = express.Router();
router.use(protect);

// ── Advanced HR-admin analytics (new) ────────────────────────────────────────
router.get('/advanced/filter-options', authorize('HR_ADMIN'), repCtrl.getAdvancedFilterOptions);
router.get('/advanced/stats',          authorize('HR_ADMIN'), repCtrl.getAdvancedStats);
router.get('/advanced/results',        authorize('HR_ADMIN'), repCtrl.getAdvancedResults);
router.get('/advanced/heatmap',        authorize('HR_ADMIN'), repCtrl.getHeatmap);
router.get('/advanced/employees',      authorize('HR_ADMIN'), repCtrl.getEmployeeList);
router.get('/advanced/employee/:userId', authorize('HR_ADMIN'), repCtrl.getEmployeeDeepDive);
router.get('/advanced/export/excel',   authorize('HR_ADMIN'), repCtrl.exportAdvancedExcel);
router.get('/advanced/export/pdf',     authorize('HR_ADMIN'), repCtrl.exportAdvancedPDF);

// ── Legacy endpoints (unchanged) ─────────────────────────────────────────────
import * as legacyCtrl from '../controllers/reportController.js';
router.get('/stats',                   authorize('HR_ADMIN'), legacyCtrl.getAdvancedStats);   // upgrade in place
router.get('/filter-options',          authorize('HR_ADMIN'), legacyCtrl.getAdvancedFilterOptions);
router.get('/heatmap',                 authorize('HR_ADMIN'), legacyCtrl.getHeatmap);
router.get('/department/:department',  authorize('HR_ADMIN'), legacyCtrl.getAdvancedStats);
router.get('/',                        authorize('HR_ADMIN'), legacyCtrl.getAdvancedResults);
router.get('/employees',               authorize('HR_ADMIN', 'SUPERVISOR'), legacyCtrl.getEmployeeList);
router.get('/export/pdf',              legacyCtrl.exportAdvancedPDF);
router.get('/export/excel',            legacyCtrl.exportAdvancedExcel);
router.get('/individual/:userId',      legacyCtrl.getEmployeeDeepDive);
router.get('/export/individual/:userId/pdf',   legacyCtrl.exportAdvancedPDF);
router.get('/export/individual/:userId/excel', legacyCtrl.exportAdvancedExcel);

export default router;
