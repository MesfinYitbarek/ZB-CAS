/* routes/reportRoutes.js
 * SECURITY FIX A01: Export endpoints now require explicit role authorization.
 * Previously, export routes had protect but no authorize() guard.
 */
import express from 'express';
import { protect, authorize } from '../middleware/auth.js';
import * as repCtrl from '../controllers/reportController.js';

const router = express.Router();

router.use(protect);

// ── Analytics & stats ─────────────────────────────────────────────────────────
router.get('/stats',          authorize('HR_ADMIN'),              repCtrl.getReportStats);
router.get('/filter-options', authorize('HR_ADMIN', 'SUPERVISOR'), repCtrl.getReportFilterOptions);
router.get('/heatmap',        authorize('HR_ADMIN'),              repCtrl.getHeatmap);
router.get('/department/:department', authorize('HR_ADMIN', 'SUPERVISOR'), repCtrl.getDepartmentReports);

// ── Employee selector ─────────────────────────────────────────────────────────
router.get('/employees', authorize('HR_ADMIN', 'SUPERVISOR'), repCtrl.getEmployees);

// ── Filtered bulk exports — FIX A01: added authorize ─────────────────────────
router.get('/export/pdf',   authorize('HR_ADMIN', 'SUPERVISOR'), repCtrl.exportFilteredPDF);
router.get('/export/excel', authorize('HR_ADMIN', 'SUPERVISOR'), repCtrl.exportFilteredExcel);

// ── Per-employee exports — FIX A01: added authorize ──────────────────────────
// Note: authorization also checked inside controller (employee can only export own data)
router.get('/export/individual/:userId/pdf',   authorize('HR_ADMIN', 'SUPERVISOR'), repCtrl.exportIndividualPDF);
router.get('/export/individual/:userId/excel', authorize('HR_ADMIN', 'SUPERVISOR'), repCtrl.exportIndividualExcel);

// ── Legacy JSON export ────────────────────────────────────────────────────────
router.get('/export/:userId', authorize('HR_ADMIN', 'SUPERVISOR'), repCtrl.exportReports);

// ── Individual reports for a specific user ────────────────────────────────────
// Access-checked inside controller (employee can only see own reports)
router.get('/individual/:userId', repCtrl.getIndividualReports);

// ── Full paginated list ───────────────────────────────────────────────────────
router.get('/', authorize('HR_ADMIN'), repCtrl.getReports);

// ── Single report by ID ───────────────────────────────────────────────────────
router.get('/:reportId', repCtrl.getReportById);

export default router;
