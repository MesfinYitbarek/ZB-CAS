/* routes/competencyRoutes.js */
import express from 'express';
import multer from 'multer';
import { protect, authorize } from '../middleware/auth.js';
import * as compCtrl from '../controllers/competencyController.js';

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

// Reads — all authenticated roles
router.get('/', compCtrl.getCompetencies);
router.get('/import/template', authorize('HR_ADMIN'), compCtrl.downloadCompetencyTemplate);
router.get('/:id', compCtrl.getCompetency);

// Writes — HR_ADMIN only
router.post('/', authorize('HR_ADMIN'), compCtrl.createCompetency);
router.post('/import', authorize('HR_ADMIN'), upload.single('file'), compCtrl.bulkImportCompetencies);
router.put('/:id', authorize('HR_ADMIN'), compCtrl.updateCompetency);
router.delete('/:id', authorize('HR_ADMIN'), compCtrl.deleteCompetency);

export default router;
