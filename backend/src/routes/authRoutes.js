/* routes/authRoutes.js
 * SECURITY FIXES:
 *  A01 – register now requires authorize('HR_ADMIN') (was only protect)
 *  A04 – authLimiter applied ONLY to login & forgot-password (not entire router)
 */
import express from 'express';
import { authLimiter } from '../middleware/security.js';
import { protect, authorize } from '../middleware/auth.js';
import * as authCtrl from '../controllers/authController.js';

const router = express.Router();

// FIX A01: Register requires HR_ADMIN role (previously only required authentication)
router.post('/register', protect, authorize('HR_ADMIN'), authCtrl.register);

// FIX A04: authLimiter applied only to brute-force targets: login & forgot-password
router.post('/login',          authLimiter, authCtrl.login);
router.post('/forgot-password', authLimiter, authCtrl.forgotPassword);

// These don't need rate limiting (refresh validated by token, others are protected)
router.post('/refresh',        authCtrl.refresh);
router.post('/logout',         protect, authCtrl.logout);
router.post('/reset-password/:token', authCtrl.resetPassword);
router.post('/change-password', protect, authCtrl.changePassword);

// Multi-role switch
router.post('/switch-role', protect, authCtrl.switchRole);

export default router;
