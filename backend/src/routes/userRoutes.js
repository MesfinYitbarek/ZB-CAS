/* routes/userRoutes.js */
const express    = require('express');
const router     = express.Router();
const { protect, authorize } = require('../middleware/auth');
const userCtrl   = require('../controllers/userController');

// All user routes require authentication
router.use(protect);

// ── Read endpoints (role checks inside controller where needed) ──────────────
router.get('/me',                                          userCtrl.getMe);
router.get('/',            authorize('HR_ADMIN'),          userCtrl.getUsers);
router.get('/supervisor/:id/employees',
           authorize('HR_ADMIN', 'SUPERVISOR'),            userCtrl.getSupervisorEmployees);
router.get('/:id',         authorize('HR_ADMIN', 'SUPERVISOR'), userCtrl.getUser);

// ── Write endpoints – HR_ADMIN only ──────────────────────────────────────────
router.put('/:id',         authorize('HR_ADMIN'),          userCtrl.updateUser);
router.delete('/:id',      authorize('HR_ADMIN'),          userCtrl.deleteUser);

module.exports = router;
