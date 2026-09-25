/* routes/authRoutes.js
 * SECURITY FIXES:
 *  A01 – register now requires authorize('HR_ADMIN') (was only protect)
 *  A04 – authLimiter applied ONLY to login & forgot-password (not entire router)
 *  F-01 – refreshLimiter (60 req / 15 min) added to /refresh to prevent
 *          cookie-theft hammering (was previously unlimited)
 */
import express from 'express';
import { authLimiter, refreshLimiter } from '../middleware/security.js';
import { protect, authorize } from '../middleware/auth.js';
import { loginValidation, registerValidation } from '../middleware/validators.js';
import * as authCtrl from '../controllers/authController.js';

const router = express.Router();

/**
 * @swagger
 * /auth/register:
 *   post:
 *     summary: Register a new user
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - username
 *               - email
 *               - name
 *             properties:
 *               username:
 *                 type: string
 *               email:
 *                 type: string
 *               name:
 *                 type: string
 *     responses:
 *       201:
 *         description: User created successfully
 *       400:
 *         description: Validation error
 *       403:
 *         description: Forbidden (requires HR_ADMIN)
 */
// FIX A01: Register requires HR_ADMIN role (previously only required authentication)
router.post('/register', protect, authorize('HR_ADMIN'), registerValidation, authCtrl.register);

/**
 * @swagger
 * /auth/login:
 *   post:
 *     summary: Login user
 *     tags: [Auth]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - username
 *               - password
 *             properties:
 *               username:
 *                 type: string
 *               password:
 *                 type: string
 *     responses:
 *       200:
 *         description: Successful login
 *       401:
 *         description: Invalid credentials
 */
// FIX A04: authLimiter applied only to brute-force targets: login & forgot-password
router.post('/login',           authLimiter, loginValidation, authCtrl.login);
router.post('/forgot-password', authLimiter,    authCtrl.forgotPassword);

// FIX F-01: refreshLimiter prevents stolen-cookie hammering (60 req / 15 min window)
router.post('/refresh',         refreshLimiter, authCtrl.refresh);
router.post('/logout',         protect, authCtrl.logout);
router.post('/reset-password/:token', authCtrl.resetPassword);
router.post('/change-password', protect, authCtrl.changePassword);

// Multi-role switch
router.post('/switch-role', protect, authCtrl.switchRole);

export default router;
