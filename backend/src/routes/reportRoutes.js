/* routes/reportRoutes.js */
import express from 'express';
import { protect, authorize } from '../middleware/auth.js';
import * as repCtrl from '../controllers/reportController.js';

const router = express.Router();

router.use(protect);

// ── HR_ADMIN: full access ─────────────────────────────────────────────────────
router.get('/',                          authorize('HR_ADMIN'), repCtrl.getReports);
router.get('/heatmap',                   authorize('HR_ADMIN'), repCtrl.getHeatmap);
router.get('/department/:department',    authorize('HR_ADMIN'), repCtrl.getDepartmentReports);

// ── Employee list (for the individual-report employee selector) ──────────────
router.get('/employees',                 authorize('HR_ADMIN', 'SUPERVISOR'), repCtrl.getEmployees);

// ── Filtered exports (PDF / Excel) ──────────────────────────────────────────
//   Query params: department, level, dateFrom, dateTo, employeeId
router.get('/export/pdf',               repCtrl.exportFilteredPDF);
router.get('/export/excel',             repCtrl.exportFilteredExcel);

// ── Individual employee exports (PDF / Excel) ───────────────────────────────
//   Access-checked inside the controller
router.get('/export/individual/:userId/pdf',   repCtrl.exportIndividualPDF);
router.get('/export/individual/:userId/excel', repCtrl.exportIndividualExcel);

// ── Individual reports (access-checked inside controller) ────────────────────
router.get('/individual/:userId',        repCtrl.getIndividualReports);

// ── Legacy JSON export (access-checked inside controller) ────────────────────
router.get('/export/:userId',            repCtrl.exportReports);

export default router;
