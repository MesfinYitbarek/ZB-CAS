/* routes/authRoutes.js
 * All authentication lifecycle routes.
 * The authLimiter (tighter rate limit) is applied to every route here.
 */
const express = require('express');
const router  = express.Router();

const { authLimiter } = require('../middleware/security');
const { protect }     = require('../middleware/auth');
const authCtrl        = require('../controllers/authController');

// Apply the strict auth rate limiter to the entire auth router
router.use(authLimiter);

router.post('/register',          protect, authCtrl.register);          // HR_ADMIN enforced inside
router.post('/login',                      authCtrl.login);
router.post('/refresh',                    authCtrl.refresh);
router.post('/logout',            protect, authCtrl.logout);
router.post('/forgot-password',            authCtrl.forgotPassword);
router.post('/reset-password/:token',      authCtrl.resetPassword);
router.post('/change-password',   protect, authCtrl.changePassword);

module.exports = router;
