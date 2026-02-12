/* routes/competencyRoutes.js */
import express from 'express';
import { protect, authorize } from '../middleware/auth.js';
import * as compCtrl from '../controllers/competencyController.js';

const router = express.Router();

router.use(protect);

// ── Reads – all authenticated roles ──────────────────────────────────────────
router.get('/', compCtrl.getCompetencies);
router.get('/:id', compCtrl.getCompetency);

// ── Writes – HR_ADMIN only ───────────────────────────────────────────────────
router.post('/', authorize('HR_ADMIN'), compCtrl.createCompetency);
router.put('/:id', authorize('HR_ADMIN'), compCtrl.updateCompetency);
router.delete('/:id', authorize('HR_ADMIN'), compCtrl.deleteCompetency);

export default router;
