/* routes/authRoutes.js
 * All authentication lifecycle routes.
 * The authLimiter (tighter rate limit) is applied to every route here.
 */
import express from 'express';
import { authLimiter } from '../middleware/security.js';
import { protect } from '../middleware/auth.js';
import * as authCtrl from '../controllers/authController.js';

const router = express.Router();

// Apply the strict auth rate limiter to the entire auth router
router.use(authLimiter);

router.post('/register', protect, authCtrl.register);          // HR_ADMIN enforced inside
router.post('/login', authCtrl.login);
router.post('/refresh', authCtrl.refresh);
router.post('/logout', protect, authCtrl.logout);
router.post('/forgot-password', authCtrl.forgotPassword);
router.post('/reset-password/:token', authCtrl.resetPassword);
router.post('/change-password', protect, authCtrl.changePassword);

export default router;
