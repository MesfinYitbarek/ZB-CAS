/* routes/questionRoutes.js */
const express    = require('express');
const router     = express.Router();
const { protect, authorize } = require('../middleware/auth');
const qCtrl      = require('../controllers/questionController');

router.use(protect);

// Reads – all authenticated (correctAnswer is select:false, safe)
router.get('/',     qCtrl.getQuestions);
router.get('/:id',  qCtrl.getQuestion);   // controller checks role for answer key

// Writes – HR_ADMIN only
router.post('/',            authorize('HR_ADMIN'), qCtrl.createQuestion);
router.put('/:id',          authorize('HR_ADMIN'), qCtrl.updateQuestion);
router.delete('/:id',       authorize('HR_ADMIN'), qCtrl.deleteQuestion);

module.exports = router;
