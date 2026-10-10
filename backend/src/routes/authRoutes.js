/* routes/authRoutes.js
 *
 * Password management endpoints (forgot/reset/change-password) have been removed.
 * Authentication is now delegated to Active Directory (LDAP).
 * Users must manage their passwords through the Zemen Bank AD self-service portal.
 *
 * SECURITY:
 *  A01 – register requires authorize('HR_ADMIN')
 *  A04 – authLimiter applied only to login (brute-force target)
 *  F-01 – refreshLimiter (60 req / 15 min) on /refresh
 */
import express from 'express';
import { authLimiter, refreshLimiter } from '../middleware/security.js';
import { protect, authorize } from '../middleware/auth.js';
import { loginValidation, registerValidation } from '../middleware/validators.js';
import * as authCtrl from '../controllers/authController.js';

const router = express.Router();

// Register a new user (HR_ADMIN only)
router.post('/register', protect, authorize('HR_ADMIN'), registerValidation, authCtrl.register);

// Login (LDAP by default; AUTH_MODE=local → bcrypt fallback)
router.post('/login', authLimiter, loginValidation, authCtrl.login);

// Token refresh
router.post('/refresh', refreshLimiter, authCtrl.refresh);

// Logout
router.post('/logout', protect, authCtrl.logout);

// Multi-role switch
router.post('/switch-role', protect, authCtrl.switchRole);

export default router;
