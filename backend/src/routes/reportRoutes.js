
/* routes/reportRoutes.js
 * All routes for the consolidated report system.
 * One report = one (user × assessment) pair with all competency results embedded.
 */
import express from 'express';
import { protect, authorize } from '../middleware/auth.js';
import * as repCtrl from '../controllers/reportController.js';

const router = express.Router();

// All report routes require authentication
router.use(protect);

// ── Analytics & stats ─────────────────────────────────────────────────────────
// GET /reports/stats?department=&assessmentId=&competencyId=&level=&assessmentType=&targetGroup=&purpose=&dateFrom=&dateTo=
router.get('/stats',
  authorize('HR_ADMIN'),
  repCtrl.getReportStats
);

// GET /reports/filter-options  — dropdowns for department, competency, assessment, level …
router.get('/filter-options',
  authorize('HR_ADMIN', 'SUPERVISOR'),
  repCtrl.getReportFilterOptions
);

// GET /reports/heatmap  — competency × department average scores
router.get('/heatmap',
  authorize('HR_ADMIN'),
  repCtrl.getHeatmap
);

// GET /reports/department/:department  — competency breakdown for one department
router.get('/department/:department',
  authorize('HR_ADMIN', 'SUPERVISOR'),
  repCtrl.getDepartmentReports
);

// ── Employee selector (must be before /:reportId to avoid route collision) ────
// GET /reports/employees?search=&department=
router.get('/employees',
  authorize('HR_ADMIN', 'SUPERVISOR'),
  repCtrl.getEmployees
);

// ── Filtered bulk exports (must be before /:reportId) ────────────────────────
// GET /reports/export/pdf?<filters>
router.get('/export/pdf',
  repCtrl.exportFilteredPDF
);

// GET /reports/export/excel?<filters>
router.get('/export/excel',
  repCtrl.exportFilteredExcel
);

// ── Per-employee exports ──────────────────────────────────────────────────────
// GET /reports/export/individual/:userId/pdf
router.get('/export/individual/:userId/pdf',
  repCtrl.exportIndividualPDF
);

// GET /reports/export/individual/:userId/excel
router.get('/export/individual/:userId/excel',
  repCtrl.exportIndividualExcel
);

// ── Legacy JSON export (kept for backward compatibility) ─────────────────────
// GET /reports/export/:userId
router.get('/export/:userId',
  repCtrl.exportReports
);

// ── Individual reports for a specific user ────────────────────────────────────
// GET /reports/individual/:userId  — access-checked inside controller
router.get('/individual/:userId',
  repCtrl.getIndividualReports
);

// ── Full paginated list ───────────────────────────────────────────────────────
// GET /reports?page=1&limit=20&sortBy=generatedAt&sortDir=desc&<filters>
router.get('/',
  authorize('HR_ADMIN'),
  repCtrl.getReports
);

// ── Single report by ID (last — catch-all :reportId must come after static paths) ──
// GET /reports/:reportId
router.get('/:reportId',
  repCtrl.getReportById
);

export default router;