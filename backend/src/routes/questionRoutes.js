/* routes/questionRoutes.js */
import express from 'express';
import { protect, authorize } from '../middleware/auth.js';
import * as qCtrl from '../controllers/questionController.js';

const router = express.Router();

router.use(protect);

// ── Reads – all authenticated (correctAnswer is select:false, safe) ─────────
router.get('/', qCtrl.getQuestions);
router.get('/:id', qCtrl.getQuestion);   // controller checks role for answer key

// ── Writes – HR_ADMIN only ───────────────────────────────────────────────────
router.post('/', authorize('HR_ADMIN'), qCtrl.createQuestion);
router.put('/:id', authorize('HR_ADMIN'), qCtrl.updateQuestion);
router.delete('/:id', authorize('HR_ADMIN'), qCtrl.deleteQuestion);

export default router;
