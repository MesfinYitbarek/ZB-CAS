/* routes/activityRoutes.js */
import express from 'express';
import { protect, authorize } from '../middleware/auth.js';
import { getActivities } from '../controllers/activityController.js';

const router = express.Router();

router.use(protect);

// Audit trail is read-only — HR_ADMIN only (matches the sidebar gating).
router.get('/', authorize('HR_ADMIN'), getActivities);

export default router;