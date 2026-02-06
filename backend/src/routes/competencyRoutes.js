/* routes/competencyRoutes.js */
const express    = require('express');
const router     = express.Router();
const { protect, authorize } = require('../middleware/auth');
const compCtrl   = require('../controllers/competencyController');

router.use(protect);

// Reads – all authenticated roles
router.get('/',     compCtrl.getCompetencies);
router.get('/:id',  compCtrl.getCompetency);

// Writes – HR_ADMIN only
router.post('/',            authorize('HR_ADMIN'), compCtrl.createCompetency);
router.put('/:id',          authorize('HR_ADMIN'), compCtrl.updateCompetency);
router.delete('/:id',       authorize('HR_ADMIN'), compCtrl.deleteCompetency);

module.exports = router;
