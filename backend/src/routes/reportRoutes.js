/* routes/reportRoutes.js */
import express from 'express';
import { protect, authorize } from '../middleware/auth.js';
import * as repCtrl from '../controllers/reportController.js';

const router = express.Router();
router.use(protect);

// ── Analytics & stats (HR_ADMIN only) ────────────────────────────────────────
router.get('/stats',              authorize('HR_ADMIN'), repCtrl.getReportStats);
router.get('/filter-options',     authorize('HR_ADMIN'), repCtrl.getReportFilterOptions);
router.get('/heatmap',            authorize('HR_ADMIN'), repCtrl.getHeatmap);
router.get('/department/:department', authorize('HR_ADMIN'), repCtrl.getDepartmentReports);

// ── Full paginated list ────────────────────────────────────────────────────────
router.get('/',                   authorize('HR_ADMIN'), repCtrl.getReports);

// ── Employee list (for employee selector) ────────────────────────────────────
router.get('/employees',          authorize('HR_ADMIN', 'SUPERVISOR'), repCtrl.getEmployees);

// ── Filtered exports ──────────────────────────────────────────────────────────
router.get('/export/pdf',         repCtrl.exportFilteredPDF);
router.get('/export/excel',       repCtrl.exportFilteredExcel);

// ── Individual employee exports ───────────────────────────────────────────────
router.get('/export/individual/:userId/pdf',   repCtrl.exportIndividualPDF);
router.get('/export/individual/:userId/excel', repCtrl.exportIndividualExcel);

// ── Individual reports (access-checked inside controller) ────────────────────
router.get('/individual/:userId', repCtrl.getIndividualReports);

// ── Legacy JSON export ────────────────────────────────────────────────────────
router.get('/export/:userId',     repCtrl.exportReports);

export default router;
