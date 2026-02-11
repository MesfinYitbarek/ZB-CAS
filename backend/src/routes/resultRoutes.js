const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const resCtrl = require('../controllers/resultController');

router.use(protect);

// Scoring Triggers
router.post('/score/:assessmentId', authorize('HR_ADMIN'), resCtrl.scoreAssessment);
router.post('/auto-score', resCtrl.autoScoreEmployee); // Used by FE on submit

// Data Retrieval
router.get('/', resCtrl.getResults);
router.get('/user/:userId', resCtrl.getResults); // Reuse getResults logic
router.get('/pdp/:userId', resCtrl.getPDP);
router.get('/:id', resCtrl.getResult);
router.get('/supervisor-score/:assessmentId/:employeeId', resCtrl.getSupervisorEvaluationScores);

module.exports = router;