import express from 'express';
import multer from 'multer';
import { protect, authorize } from '../middleware/auth.js';
import * as recCtrl from '../controllers/recommendationController.js';

const router = express.Router();

const allowedImportTypes = new Set([
  'text/csv',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
]);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => {
    const ok = allowedImportTypes.has(file.mimetype) || /\.(xlsx|xls|csv|txt)$/i.test(file.originalname);
    if (ok) return cb(null, true);
    const err = new Error('Invalid file type. Only .xlsx, .xls, and .csv are allowed.');
    err.statusCode = 400;
    err.status = 'fail';
    cb(err, false);
  },
});

router.use(protect);

// Reads
router.get('/',                         recCtrl.getRecommendations);
router.get('/by-group-level',           recCtrl.getByTargetGroupAndLevel); // cross-competency lookup
router.get('/import/template', authorize('HR_ADMIN'), recCtrl.downloadRecommendationTemplate);
router.get('/competency/:competencyId', recCtrl.getByCompetency);
router.get('/:id',                      recCtrl.getRecommendation);

// Writes — HR_ADMIN
router.post('/',    authorize('HR_ADMIN'), recCtrl.createRecommendation);
router.post('/import', authorize('HR_ADMIN'), upload.single('file'), recCtrl.bulkImportRecommendations);
router.put('/:id',  authorize('HR_ADMIN'), recCtrl.updateRecommendation);
router.delete('/:id', authorize('HR_ADMIN'), recCtrl.deleteRecommendation);

export default router;
