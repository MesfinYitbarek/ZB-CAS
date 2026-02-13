// routes/questionRoutes.js
import express from 'express';
import { protect, authorize } from '../middleware/auth.js';
import * as qCtrl from '../controllers/questionController.js';

const router = express.Router();

router.use(protect);

router.get('/', qCtrl.getQuestions);
router.get('/:id', qCtrl.getQuestion);

router.post('/', authorize('HR_ADMIN'), qCtrl.createQuestion);
router.post('/batch', authorize('HR_ADMIN'), qCtrl.batchCreateQuestions);
router.put('/:id', authorize('HR_ADMIN'), qCtrl.updateQuestion);
router.delete('/:id', authorize('HR_ADMIN'), qCtrl.deleteQuestion);

export default router;