import express from 'express';
import { protect, authorize } from '../middleware/auth.js';
import * as recCtrl from '../controllers/recommendationController.js';

const router = express.Router();

router.use(protect);

// ── Reads ───────────────────────────────────────────────────────────────────
router.get('/',                         recCtrl.getRecommendations);
router.get('/by-group-level',           recCtrl.getByTargetGroupAndLevel); // cross-competency lookup
router.get('/competency/:competencyId', recCtrl.getByCompetency);
router.get('/:id',                      recCtrl.getRecommendation);

// ── Writes – HR_ADMIN ───────────────────────────────────────────────────────
router.post('/',    authorize('HR_ADMIN'), recCtrl.createRecommendation);
router.put('/:id',  authorize('HR_ADMIN'), recCtrl.updateRecommendation);
router.delete('/:id', authorize('HR_ADMIN'), recCtrl.deleteRecommendation);

export default router;