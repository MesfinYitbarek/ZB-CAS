import express from 'express';
import { protect, authorize } from '../middleware/auth.js';
import { generalLimiter } from '../middleware/security.js';
import * as dashboardCtrl from '../controllers/dashboardController.js';

const router = express.Router();

// Apply general rate limiting to all dashboard routes
router.use(generalLimiter);

// All dashboard routes require authentication
router.use(protect);

// Admin dashboard - HR_ADMIN only
router.get(
  '/admin',
  authorize('HR_ADMIN'),
  dashboardCtrl.getAdminDashboardStats
);

// Supervisor dashboard - SUPERVISOR and HR_ADMIN
router.get(
  '/supervisor',
  authorize('SUPERVISOR', 'HR_ADMIN'),
  dashboardCtrl.getSupervisorDashboardStats
);

// Employee dashboard - EMPLOYEE, SUPERVISOR, and HR_ADMIN
router.get(
  '/employee',
  authorize('EMPLOYEE', 'SUPERVISOR', 'HR_ADMIN'),
  dashboardCtrl.getEmployeeDashboardStats
);

// Get dashboard stats based on authenticated user's role
router.get(
  '/me',
  dashboardCtrl.getDashboardByRole
);

export default router;