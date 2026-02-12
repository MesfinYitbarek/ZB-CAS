/* routes/userRoutes.js */
import express from 'express';
import { protect, authorize } from '../middleware/auth.js';
import * as userCtrl from '../controllers/userController.js';

const router = express.Router();

// All user routes require authentication
router.use(protect);

// ── Read endpoints (role checks inside controller where needed) ──────────────
router.get('/me', userCtrl.getMe);
router.get('/', authorize('HR_ADMIN'), userCtrl.getUsers);
router.get('/supervisor/:id/employees', authorize('HR_ADMIN', 'SUPERVISOR'), userCtrl.getSupervisorEmployees);
router.get('/:id', authorize('HR_ADMIN', 'SUPERVISOR'), userCtrl.getUser);

// ── Write endpoints – HR_ADMIN only ──────────────────────────────────────────
router.put('/:id', authorize('HR_ADMIN'), userCtrl.updateUser);
router.delete('/:id', authorize('HR_ADMIN'), userCtrl.deleteUser);

export default router;
