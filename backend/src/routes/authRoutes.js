/* routes/authRoutes.js */
import express from 'express';
import { authLimiter } from '../middleware/security.js';
import { protect } from '../middleware/auth.js';
import * as authCtrl from '../controllers/authController.js';

const router = express.Router();

router.use(authLimiter);

router.post('/register',           protect, authCtrl.register);
router.post('/login',                       authCtrl.login);
router.post('/refresh',                     authCtrl.refresh);
router.post('/logout',             protect, authCtrl.logout);
router.post('/forgot-password',             authCtrl.forgotPassword);
router.post('/reset-password/:token',       authCtrl.resetPassword);
router.post('/change-password',    protect, authCtrl.changePassword);

// ── Multi-role: switch active role without logging out ───────────────────────
// Body: { role: 'SUPERVISOR' }
// Returns: { activeRole, accessToken }
router.post('/switch-role',        protect, authCtrl.switchRole);

export default router;
