/* routes/recommendationRoutes.js */
const express    = require('express');
const router     = express.Router();
const { protect, authorize } = require('../middleware/auth');
const recCtrl    = require('../controllers/recommendationController');

router.use(protect);

// Reads
router.get('/',                                  recCtrl.getRecommendations);
router.get('/:id',                               recCtrl.getRecommendation);
router.get('/competency/:competencyId',          recCtrl.getByCompetency);

// Writes – HR_ADMIN
router.post('/',             authorize('HR_ADMIN'), recCtrl.createRecommendation);
router.put('/:id',           authorize('HR_ADMIN'), recCtrl.updateRecommendation);
router.delete('/:id',        authorize('HR_ADMIN'), recCtrl.deleteRecommendation);

module.exports = router;
